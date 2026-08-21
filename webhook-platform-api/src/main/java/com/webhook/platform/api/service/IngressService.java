package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.IncomingDestination;
import com.webhook.platform.api.domain.entity.IncomingEvent;
import com.webhook.platform.api.domain.entity.IncomingForwardAttempt;
import com.webhook.platform.api.domain.entity.IncomingSource;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.common.enums.IncomingSourceStatus;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.IncomingDestinationRepository;
import com.webhook.platform.api.domain.repository.IncomingEventRepository;
import com.webhook.platform.api.domain.repository.IncomingForwardAttemptRepository;
import com.webhook.platform.api.domain.repository.IncomingSourceRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import com.webhook.platform.api.security.TrustedProxyResolver;
import com.webhook.platform.api.service.ingress.HeaderSanitizer;
import com.webhook.platform.api.service.ingress.PayloadTooLargeException;
import com.webhook.platform.api.service.ingress.ProviderEventIdExtractor;
import com.webhook.platform.api.service.ingress.RateLimitExceededException;
import com.webhook.platform.api.service.ingress.SignatureVerificationFailedException;
import com.webhook.platform.api.service.ingress.SourceDisabledException;
import com.webhook.platform.api.service.ingress.SourceNotFoundException;
import com.webhook.platform.api.service.verification.ReplayDetectionService;
import com.webhook.platform.api.service.verification.WebhookVerificationStrategy;
import com.webhook.platform.api.service.verification.WebhookVerifierFactory;
import com.webhook.platform.common.enums.VerificationMode;
import com.webhook.platform.common.security.EncryptionKeyRegistry;
import com.webhook.platform.common.util.CryptoUtils;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class IngressService {

    private final IncomingSourceRepository sourceRepository;
    private final IncomingEventRepository eventRepository;
    private final IncomingDestinationRepository destinationRepository;
    private final IncomingForwardAttemptRepository forwardAttemptRepository;
    private final OutboxMessageRepository outboxMessageRepository;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meterRegistry;
    private final WebhookVerifierFactory verifierFactory;
    private final ReplayDetectionService replayDetectionService;
    private final RedisRateLimiterService rateLimiterService;
    private final TrustedProxyResolver clientIpResolver;
    private final TransactionTemplate transactionTemplate;
    private final EncryptionKeyRegistry encryptionKeyRegistry;
    private final long maxPayloadSizeBytes;

    public IngressService(
            IncomingSourceRepository sourceRepository,
            IncomingEventRepository eventRepository,
            IncomingDestinationRepository destinationRepository,
            IncomingForwardAttemptRepository forwardAttemptRepository,
            OutboxMessageRepository outboxMessageRepository,
            ObjectMapper objectMapper,
            MeterRegistry meterRegistry,
            WebhookVerifierFactory verifierFactory,
            ReplayDetectionService replayDetectionService,
            RedisRateLimiterService rateLimiterService,
            TrustedProxyResolver clientIpResolver,
            PlatformTransactionManager transactionManager,
            EncryptionKeyRegistry encryptionKeyRegistry,
            @Value("${webhook.incoming.max-payload-size-bytes:524288}") long maxPayloadSizeBytes) {
        this.sourceRepository = sourceRepository;
        this.eventRepository = eventRepository;
        this.destinationRepository = destinationRepository;
        this.forwardAttemptRepository = forwardAttemptRepository;
        this.outboxMessageRepository = outboxMessageRepository;
        this.objectMapper = objectMapper;
        this.meterRegistry = meterRegistry;
        this.verifierFactory = verifierFactory;
        this.replayDetectionService = replayDetectionService;
        this.rateLimiterService = rateLimiterService;
        this.clientIpResolver = clientIpResolver;
        this.encryptionKeyRegistry = encryptionKeyRegistry;
        this.maxPayloadSizeBytes = maxPayloadSizeBytes;

        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    /**
     * P1-25b: only the writes (IncomingEvent + forward attempts + outbox) run inside a
     * transaction. Token lookup, rate limiting, payload-size check, signature verification and
     * replay-marking all happen first, on plain (non-transactional) reads and Redis round
     * trips -- previously the whole method ran inside one transaction, so every invalid-token
     * or rate-limited request held a Hikari connection for the duration of two Redis calls that
     * never wrote anything (a cheap DoS on the connection pool).
     */
    public IncomingEvent receiveWebhook(String token, String body, HttpServletRequest request) {
        IncomingSource source = resolveActiveSource(token);
        enforceRateLimit(source);
        enforcePayloadSize(body);

        RequestMetadata meta = extractMetadata(body, request);
        VerificationOutcome verification = verifyAndCheckReplay(source, body, request);

        // Block immediately when signature verification is configured and not verified
        if (source.getVerificationMode() != VerificationMode.NONE && !Boolean.TRUE.equals(verification.verified())) {
            meterRegistry.counter("incoming_events_rejected_total",
                    "reason", "signature_verification_failed").increment();
            String reason = verification.verificationError() != null
                    ? verification.verificationError() : "Verification not completed";
            log.warn("Rejecting incoming webhook due to failed signature verification: sourceId={}, error={}",
                    source.getId(), reason);
            throw new SignatureVerificationFailedException("Signature verification failed: " + reason);
        }

        // Extract provider event ID for dedup (well-known headers only, no body hash fallback)
        String providerEventId = ProviderEventIdExtractor.extract(request, body);

        // Dedup: if same source + same provider event ID already exists, return existing
        // (idempotent). Plain read, no explicit transaction needed.
        if (providerEventId != null) {
            var existing = eventRepository.findByIncomingSourceIdAndProviderEventId(source.getId(), providerEventId);
            if (existing.isPresent()) {
                log.info("Duplicate incoming webhook detected: sourceId={}, providerEventId={}, existingEventId={}",
                        source.getId(), providerEventId, existing.get().getId());
                meterRegistry.counter("incoming_events_deduplicated_total").increment();
                return existing.get();
            }
        }

        try {
            return transactionTemplate.execute(status ->
                    persistEventAndForwardAttempts(source, meta, providerEventId, verification));
        } catch (DataIntegrityViolationException e) {
            IncomingEvent recovered = handleDuplicateRace(source, providerEventId, e);
            if (recovered != null) {
                return recovered;
            }
            // Genuinely lost -- nothing was persisted and there's no existing row to fall back
            // to. The replay marker (if any) must not stay burned for a webhook that never made
            // it to disk, or the provider's legitimate resend gets rejected as a replay for the
            // rest of the TTL window instead of just being retried.
            releaseReplayMarkerAfterFailedPersist(source, verification);
            throw e;
        } catch (RuntimeException e) {
            releaseReplayMarkerAfterFailedPersist(source, verification);
            throw e;
        }
    }

    private IncomingSource resolveActiveSource(String token) {
        IncomingSource source = sourceRepository.findByIngressPathToken(token)
                .orElseThrow(() -> new SourceNotFoundException("Invalid ingress token"));
        if (source.getStatus() != IncomingSourceStatus.ACTIVE) {
            throw new SourceDisabledException("Source is disabled");
        }
        return source;
    }

    private void enforceRateLimit(IncomingSource source) {
        // Per-source rate limiting (fail-closed: reject if Redis is down)
        if (source.getRateLimitPerSecond() != null && source.getRateLimitPerSecond() > 0) {
            if (!rateLimiterService.tryAcquireForSourceFailClosed(source.getId(), source.getRateLimitPerSecond())) {
                throw new RateLimitExceededException("Rate limit exceeded for source " + source.getId());
            }
        }
    }

    private void enforcePayloadSize(String body) {
        // Enforce size limit (measure in bytes, not characters — multi-byte UTF-8 matters)
        if (body != null && body.getBytes(StandardCharsets.UTF_8).length > maxPayloadSizeBytes) {
            throw new PayloadTooLargeException("Payload exceeds maximum allowed size of " + maxPayloadSizeBytes + " bytes");
        }
    }

    private record RequestMetadata(String requestId, String method, String path, String queryParams,
                                    String contentType, String clientIp, String userAgent,
                                    String headersJson, String bodySha256, String body) {
    }

    private RequestMetadata extractMetadata(String body, HttpServletRequest request) {
        String requestId = UUID.randomUUID().toString();
        String method = request.getMethod();
        String path = request.getRequestURI();
        String queryParams = request.getQueryString();
        String contentType = request.getContentType();
        String clientIp = clientIpResolver.resolve(request);
        String rawUserAgent = request.getHeader("User-Agent");
        String userAgent = rawUserAgent != null && rawUserAgent.length() > 512
                ? rawUserAgent.substring(0, 512) : rawUserAgent;
        String headersJson = HeaderSanitizer.toJson(request, objectMapper);
        String bodySha256 = computeSha256(body);
        return new RequestMetadata(requestId, method, path, queryParams, contentType, clientIp, userAgent,
                headersJson, bodySha256, body);
    }

    private record VerificationOutcome(Boolean verified, String verificationError, String replayKey) {
    }

    /**
     * Verifies the signature BEFORE dedup to prevent dedup poisoning (P0 security fix). An
     * attacker could send a webhook with a known providerEventId but invalid signature; if we
     * dedup/persist first, the poisoned record blocks the real webhook.
     *
     * <p>Unified replay detection for ALL verifiers (Generic, Stripe, GitHub, Slack, Shopify):
     * after successful verification, check if this exact signature was already seen. Key =
     * sourceId + SHA256(replayKey). TTL = 5 min (matches provider timestamp tolerance). The
     * check marks the signature as seen as a side effect (P1-25b) -- if the write that's
     * supposed to follow never commits, the caller must release this mark via
     * {@link #releaseReplayMarkerAfterFailedPersist}.
     */
    private VerificationOutcome verifyAndCheckReplay(IncomingSource source, String body, HttpServletRequest request) {
        Boolean verified = null;
        String verificationError = null;
        String replayKey = null;
        WebhookVerificationStrategy verifier = verifierFactory.getVerifier(source);
        if (verifier != null) {
            try {
                String secret = decryptHmacSecret(source);
                WebhookVerificationStrategy.VerificationResult result = verifier.verify(secret, body, request);
                verified = result.verified();
                replayKey = result.replayKey();
                if (!result.verified()) {
                    verificationError = result.error();
                }
            } catch (Exception e) {
                verified = false;
                verificationError = "Verification error: " + e.getMessage();
                log.warn("Webhook verification failed for source {}: {}", source.getId(), e.getMessage());
            }
        }

        if (Boolean.TRUE.equals(verified) && replayKey != null) {
            if (replayDetectionService.isReplay(source.getId().toString(), replayKey)) {
                meterRegistry.counter("incoming_events_rejected_total",
                        "reason", "replay_detected").increment();
                log.warn("Replay attack detected for source {}", source.getId());
                throw new SignatureVerificationFailedException("Replay attack detected: signature already seen");
            }
        }

        return new VerificationOutcome(verified, verificationError, replayKey);
    }

    private void releaseReplayMarkerAfterFailedPersist(IncomingSource source, VerificationOutcome verification) {
        if (Boolean.TRUE.equals(verification.verified()) && verification.replayKey() != null) {
            replayDetectionService.unmark(source.getId().toString(), verification.replayKey());
            log.warn("Released replay marker after failed persist so a legitimate resend is not "
                    + "permanently rejected: sourceId={}", source.getId());
        }
    }

    private IncomingEvent handleDuplicateRace(IncomingSource source, String providerEventId,
                                               DataIntegrityViolationException e) {
        if (providerEventId != null) {
            var existing = eventRepository.findByIncomingSourceIdAndProviderEventId(source.getId(), providerEventId);
            if (existing.isPresent()) {
                log.info("Duplicate race resolved for incoming webhook: sourceId={}, providerEventId={}, existingEventId={}",
                        source.getId(), providerEventId, existing.get().getId());
                meterRegistry.counter("incoming_events_deduplicated_total").increment();
                return existing.get();
            }
        }
        return null;
    }

    /**
     * Everything that must be transactional: persisting the IncomingEvent row and, if there are
     * enabled destinations, the forward-attempt + outbox rows in the same transaction as the
     * outbox pattern requires. Runs inside {@code transactionTemplate.execute} only -- no
     * Redis/verification work happens in here (P1-25b).
     */
    private IncomingEvent persistEventAndForwardAttempts(IncomingSource source, RequestMetadata meta,
                                                           String providerEventId, VerificationOutcome verification) {
        IncomingEvent event = IncomingEvent.builder()
                .incomingSourceId(source.getId())
                .requestId(meta.requestId())
                .method(meta.method())
                .path(meta.path())
                .queryParams(meta.queryParams())
                .headersJson(meta.headersJson())
                .bodyRaw(meta.body())
                .bodySha256(meta.bodySha256())
                .providerEventId(providerEventId)
                .contentType(meta.contentType())
                .clientIp(meta.clientIp())
                .userAgent(meta.userAgent())
                .verified(verification.verified())
                .verificationError(verification.verificationError())
                .receivedAt(Instant.now())
                .build();

        event = eventRepository.save(event);

        meterRegistry.counter("incoming_events_received_total",
                "provider_type", source.getProviderType().name()).increment();

        log.info("Received incoming webhook: eventId={}, sourceId={}, requestId={}, verified={}",
                event.getId(), source.getId(), meta.requestId(), verification.verified());

        // Create forward attempts + outbox messages in batch
        List<IncomingDestination> destinations = destinationRepository
                .findByIncomingSourceIdAndEnabledTrue(source.getId());

        if (!destinations.isEmpty()) {
            List<IncomingForwardAttempt> attempts = new ArrayList<>(destinations.size());
            List<OutboxMessage> outboxMessages = new ArrayList<>(destinations.size());

            for (IncomingDestination destination : destinations) {
                IncomingForwardMessage forwardMessage = IncomingForwardMessage.builder()
                        .incomingEventId(event.getId())
                        .destinationId(destination.getId())
                        .incomingSourceId(source.getId())
                        .attemptCount(0)
                        .replay(false)
                        .build();

                String payload;
                try {
                    payload = objectMapper.writeValueAsString(forwardMessage);
                } catch (Exception e) {
                    throw new RuntimeException(
                            "Failed to serialize outbox message for incoming forward: eventId="
                                    + event.getId() + ", destId=" + destination.getId(), e);
                }

                attempts.add(IncomingForwardAttempt.builder()
                        .incomingEventId(event.getId())
                        .destinationId(destination.getId())
                        .attemptNumber(1)
                        .status(ForwardAttemptStatus.PENDING)
                        .build());

                outboxMessages.add(OutboxMessage.builder()
                        .aggregateType("IncomingForward")
                        .aggregateId(event.getId())
                        .eventType("IncomingForwardCreated")
                        .payload(payload)
                        .kafkaTopic(KafkaTopics.INCOMING_FORWARD_DISPATCH)
                        .kafkaKey(destination.getId().toString())
                        .projectId(source.getProjectId())
                        .status(OutboxStatus.PENDING)
                        .retryCount(0)
                        .build());
            }

            forwardAttemptRepository.saveAll(attempts);
            outboxMessageRepository.saveAll(outboxMessages);
        }

        return event;
    }

    private String decryptHmacSecret(IncomingSource source) {
        if (source.getHmacSecretEncrypted() == null || source.getHmacSecretIv() == null) {
            throw new IllegalStateException("HMAC secret not configured for source " + source.getId());
        }
        return encryptionKeyRegistry.decryptWithFallback(
                source.getHmacSecretEncrypted(),
                source.getHmacSecretIv(),
                source.getEncryptionKeyVersion()
        );
    }

    private String computeSha256(String body) {
        if (body == null || body.isEmpty()) {
            return null;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(body.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            log.warn("Failed to compute SHA-256: {}", e.getMessage());
            return null;
        }
    }
}
