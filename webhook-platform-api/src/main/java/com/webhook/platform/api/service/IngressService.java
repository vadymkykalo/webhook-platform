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
import com.webhook.platform.api.service.ingress.ClientIpResolver;
import com.webhook.platform.api.service.ingress.HeaderSanitizer;
import com.webhook.platform.api.service.ingress.PayloadTooLargeException;
import com.webhook.platform.api.service.ingress.ProviderEventIdExtractor;
import com.webhook.platform.api.service.ingress.RateLimitExceededException;
import com.webhook.platform.api.service.ingress.SignatureVerificationFailedException;
import com.webhook.platform.api.service.ingress.SourceDisabledException;
import com.webhook.platform.api.service.ingress.SourceNotFoundException;
import com.webhook.platform.api.service.verification.WebhookVerificationStrategy;
import com.webhook.platform.api.service.verification.WebhookVerifierFactory;
import com.webhook.platform.common.enums.VerificationMode;
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
    private final RedisRateLimiterService rateLimiterService;
    private final ClientIpResolver clientIpResolver;
    private final TransactionTemplate transactionTemplate;
    private final String encryptionKey;
    private final String encryptionSalt;
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
            RedisRateLimiterService rateLimiterService,
            ClientIpResolver clientIpResolver,
            PlatformTransactionManager transactionManager,
            @Value("${webhook.encryption-key}") String encryptionKey,
            @Value("${webhook.encryption-salt}") String encryptionSalt,
            @Value("${webhook.incoming.max-payload-size-bytes:524288}") long maxPayloadSizeBytes) {
        this.sourceRepository = sourceRepository;
        this.eventRepository = eventRepository;
        this.destinationRepository = destinationRepository;
        this.forwardAttemptRepository = forwardAttemptRepository;
        this.outboxMessageRepository = outboxMessageRepository;
        this.objectMapper = objectMapper;
        this.meterRegistry = meterRegistry;
        this.verifierFactory = verifierFactory;
        this.rateLimiterService = rateLimiterService;
        this.clientIpResolver = clientIpResolver;
        this.encryptionKey = encryptionKey;
        this.encryptionSalt = encryptionSalt;
        this.maxPayloadSizeBytes = maxPayloadSizeBytes;

        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public IncomingEvent receiveWebhook(String token, String body, HttpServletRequest request) {
        try {
            return transactionTemplate.execute(status -> doReceiveWebhook(token, body, request));
        } catch (DataIntegrityViolationException e) {
            return handleDuplicateRace(token, body, request, e);
        }
    }

    private IncomingEvent handleDuplicateRace(String token, String body, HttpServletRequest request,
                                               DataIntegrityViolationException e) {
        String providerEventId = ProviderEventIdExtractor.extract(request, body);
        if (providerEventId != null) {
            var source = sourceRepository.findByIngressPathToken(token);
            if (source.isPresent()) {
                var existing = eventRepository.findByIncomingSourceIdAndProviderEventId(
                        source.get().getId(), providerEventId);
                if (existing.isPresent()) {
                    log.info("Duplicate race resolved for incoming webhook: sourceId={}, providerEventId={}, existingEventId={}",
                            source.get().getId(), providerEventId, existing.get().getId());
                    meterRegistry.counter("incoming_events_deduplicated_total",
                            "source_id", source.get().getId().toString()).increment();
                    return existing.get();
                }
            }
        }
        throw e;
    }

    private IncomingEvent doReceiveWebhook(String token, String body, HttpServletRequest request) {
        IncomingSource source = sourceRepository.findByIngressPathToken(token)
                .orElseThrow(() -> new SourceNotFoundException("Invalid ingress token"));

        if (source.getStatus() != IncomingSourceStatus.ACTIVE) {
            throw new SourceDisabledException("Source is disabled");
        }

        // Per-source rate limiting
        if (source.getRateLimitPerSecond() != null && source.getRateLimitPerSecond() > 0) {
            if (!rateLimiterService.tryAcquireForSource(source.getId(), source.getRateLimitPerSecond())) {
                throw new RateLimitExceededException("Rate limit exceeded for source " + source.getId());
            }
        }

        // Enforce size limit (measure in bytes, not characters — multi-byte UTF-8 matters)
        if (body != null && body.getBytes(StandardCharsets.UTF_8).length > maxPayloadSizeBytes) {
            throw new PayloadTooLargeException("Payload exceeds maximum allowed size of " + maxPayloadSizeBytes + " bytes");
        }

        // Extract metadata
        String requestId = UUID.randomUUID().toString();
        String method = request.getMethod();
        String path = request.getRequestURI();
        String queryParams = request.getQueryString();
        String contentType = request.getContentType();
        String clientIp = clientIpResolver.resolve(request);
        String userAgent = request.getHeader("User-Agent");
        String headersJson = HeaderSanitizer.toJson(request, objectMapper);
        String bodySha256 = computeSha256(body);

        // Verify signature BEFORE dedup to prevent dedup poisoning (P0 security fix).
        // An attacker could send a webhook with a known providerEventId but invalid signature;
        // if we dedup/persist first, the poisoned record blocks the real webhook.
        Boolean verified = null;
        String verificationError = null;
        WebhookVerificationStrategy verifier = verifierFactory.getVerifier(source);
        if (verifier != null) {
            try {
                String secret = decryptHmacSecret(source);
                WebhookVerificationStrategy.VerificationResult result = verifier.verify(secret, body, request);
                verified = result.verified();
                if (!result.verified()) {
                    verificationError = result.error();
                }
            } catch (Exception e) {
                verified = false;
                verificationError = "Verification error: " + e.getMessage();
                log.warn("Webhook verification failed for source {}: {}", source.getId(), e.getMessage());
            }
        }

        // Block immediately when signature verification is configured and not verified
        if (source.getVerificationMode() != VerificationMode.NONE && !Boolean.TRUE.equals(verified)) {
            meterRegistry.counter("incoming_events_rejected_total",
                    "source_id", source.getId().toString(),
                    "reason", "signature_verification_failed").increment();
            String reason = verificationError != null ? verificationError : "Verification not completed";
            log.warn("Rejecting incoming webhook due to failed signature verification: sourceId={}, error={}",
                    source.getId(), reason);
            throw new SignatureVerificationFailedException("Signature verification failed: " + reason);
        }

        // Extract provider event ID for dedup (well-known headers only, no body hash fallback)
        String providerEventId = ProviderEventIdExtractor.extract(request, body);

        // Dedup: if same source + same provider event ID already exists, return existing (idempotent)
        if (providerEventId != null) {
            var existing = eventRepository.findByIncomingSourceIdAndProviderEventId(source.getId(), providerEventId);
            if (existing.isPresent()) {
                log.info("Duplicate incoming webhook detected: sourceId={}, providerEventId={}, existingEventId={}",
                        source.getId(), providerEventId, existing.get().getId());
                meterRegistry.counter("incoming_events_deduplicated_total",
                        "source_id", source.getId().toString()).increment();
                return existing.get();
            }
        }

        // Persist the event
        IncomingEvent event = IncomingEvent.builder()
                .incomingSourceId(source.getId())
                .requestId(requestId)
                .method(method)
                .path(path)
                .queryParams(queryParams)
                .headersJson(headersJson)
                .bodyRaw(body)
                .bodySha256(bodySha256)
                .providerEventId(providerEventId)
                .contentType(contentType)
                .clientIp(clientIp)
                .userAgent(userAgent != null && userAgent.length() > 512 ? userAgent.substring(0, 512) : userAgent)
                .verified(verified)
                .verificationError(verificationError)
                .receivedAt(Instant.now())
                .build();

        event = eventRepository.save(event);

        meterRegistry.counter("incoming_events_received_total",
                "source_id", source.getId().toString(),
                "provider_type", source.getProviderType().name()).increment();

        log.info("Received incoming webhook: eventId={}, sourceId={}, requestId={}, verified={}",
                event.getId(), source.getId(), requestId, verified);

        // Create forward attempts + outbox messages in batch
        List<IncomingDestination> destinations = destinationRepository
                .findByIncomingSourceIdAndEnabledTrue(source.getId());

        if (!destinations.isEmpty()) {
            List<IncomingForwardAttempt> attempts = new ArrayList<>(destinations.size());
            List<OutboxMessage> outboxMessages = new ArrayList<>(destinations.size());

            for (IncomingDestination destination : destinations) {
                attempts.add(IncomingForwardAttempt.builder()
                        .incomingEventId(event.getId())
                        .destinationId(destination.getId())
                        .attemptNumber(1)
                        .status(ForwardAttemptStatus.PENDING)
                        .build());

                try {
                    IncomingForwardMessage forwardMessage = IncomingForwardMessage.builder()
                            .incomingEventId(event.getId())
                            .destinationId(destination.getId())
                            .incomingSourceId(source.getId())
                            .attemptCount(0)
                            .replay(false)
                            .build();

                    outboxMessages.add(OutboxMessage.builder()
                            .aggregateType("IncomingForward")
                            .aggregateId(event.getId())
                            .eventType("IncomingForwardCreated")
                            .payload(objectMapper.writeValueAsString(forwardMessage))
                            .kafkaTopic(KafkaTopics.INCOMING_FORWARD_DISPATCH)
                            .kafkaKey(destination.getId().toString())
                            .status(OutboxStatus.PENDING)
                            .retryCount(0)
                            .build());
                } catch (Exception e) {
                    log.error("Failed to serialize outbox message for incoming forward: eventId={}, destId={}",
                            event.getId(), destination.getId(), e);
                }
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
        return CryptoUtils.decryptSecret(
                source.getHmacSecretEncrypted(),
                source.getHmacSecretIv(),
                encryptionKey,
                encryptionSalt
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
