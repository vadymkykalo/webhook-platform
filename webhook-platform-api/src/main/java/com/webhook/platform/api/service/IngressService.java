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
import org.springframework.transaction.interceptor.NoRollbackRuleAttribute;
import org.springframework.transaction.interceptor.RuleBasedTransactionAttribute;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private final TransactionTemplate transactionTemplate;
    private final List<String> trustedProxies;
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
            PlatformTransactionManager transactionManager,
            @Value("${webhook.incoming.trusted-proxies:127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16}") List<String> trustedProxies,
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
        this.trustedProxies = trustedProxies;
        this.encryptionKey = encryptionKey;
        this.encryptionSalt = encryptionSalt;
        this.maxPayloadSizeBytes = maxPayloadSizeBytes;

        RuleBasedTransactionAttribute txAttr = new RuleBasedTransactionAttribute();
        txAttr.getRollbackRules().add(new NoRollbackRuleAttribute(SignatureVerificationFailedException.class));
        this.transactionTemplate = new TransactionTemplate(transactionManager, txAttr);
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
        String bodySha256 = computeSha256(body);
        String providerEventId = extractProviderEventId(request, bodySha256);
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
        String clientIp = extractClientIp(request);
        String userAgent = request.getHeader("User-Agent");
        String headersJson = extractHeadersJson(request);
        String bodySha256 = computeSha256(body);

        // Extract provider event ID for dedup (well-known headers, fallback to body hash)
        String providerEventId = extractProviderEventId(request, bodySha256);

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

        // Verify signature via strategy pattern
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
                .userAgent(userAgent != null ? truncate(userAgent, 512) : null)
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

        // Block forwarding when signature verification is configured and not verified
        if (source.getVerificationMode() != VerificationMode.NONE && !Boolean.TRUE.equals(verified)) {
            meterRegistry.counter("incoming_events_rejected_total",
                    "source_id", source.getId().toString(),
                    "reason", "signature_verification_failed").increment();
            String reason = verificationError != null ? verificationError : "Verification not completed";
            log.warn("Blocking incoming webhook due to failed signature verification: eventId={}, sourceId={}, error={}",
                    event.getId(), source.getId(), reason);
            throw new SignatureVerificationFailedException(
                    "Signature verification failed: " + reason, event);
        }

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

    private String extractClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        // Only trust proxy headers when the direct connection comes from a known proxy
        if (isTrustedProxy(remoteAddr)) {
            String xForwardedFor = request.getHeader("X-Forwarded-For");
            if (xForwardedFor != null && !xForwardedFor.isBlank()) {
                return xForwardedFor.split(",")[0].trim();
            }
            String xRealIp = request.getHeader("X-Real-IP");
            if (xRealIp != null && !xRealIp.isBlank()) {
                return xRealIp.trim();
            }
        }
        return remoteAddr;
    }

    private boolean isTrustedProxy(String remoteAddr) {
        if (trustedProxies == null || trustedProxies.isEmpty()) {
            return false;
        }
        try {
            InetAddress remote = InetAddress.getByName(remoteAddr);
            byte[] remoteBytes = remote.getAddress();
            for (String proxy : trustedProxies) {
                String trimmed = proxy.trim();
                if (trimmed.isEmpty()) continue;
                if (trimmed.contains("/")) {
                    // CIDR notation
                    String[] parts = trimmed.split("/");
                    InetAddress network = InetAddress.getByName(parts[0]);
                    int prefixLen = Integer.parseInt(parts[1]);
                    if (isInCidr(remoteBytes, network.getAddress(), prefixLen)) {
                        return true;
                    }
                } else {
                    InetAddress trusted = InetAddress.getByName(trimmed);
                    if (remote.equals(trusted)) {
                        return true;
                    }
                }
            }
        } catch (UnknownHostException e) {
            log.warn("Failed to resolve remote address for trusted proxy check: {}", remoteAddr);
        }
        return false;
    }

    private static boolean isInCidr(byte[] addr, byte[] network, int prefixLen) {
        if (addr.length != network.length) return false;
        int fullBytes = prefixLen / 8;
        int remainingBits = prefixLen % 8;
        for (int i = 0; i < fullBytes; i++) {
            if (addr[i] != network[i]) return false;
        }
        if (remainingBits > 0 && fullBytes < addr.length) {
            int mask = (0xFF << (8 - remainingBits)) & 0xFF;
            if ((addr[fullBytes] & mask) != (network[fullBytes] & mask)) return false;
        }
        return true;
    }

    private static final Set<String> SENSITIVE_HEADERS = Set.of(
            "authorization", "cookie", "set-cookie",
            "x-api-key", "proxy-authorization"
    );
    private static final String MASKED_VALUE = "***MASKED***";

    private String extractHeadersJson(HttpServletRequest request) {
        try {
            Map<String, String> headers = new HashMap<>();
            Enumeration<String> headerNames = request.getHeaderNames();
            while (headerNames.hasMoreElements()) {
                String name = headerNames.nextElement();
                String value = SENSITIVE_HEADERS.contains(name.toLowerCase())
                        ? MASKED_VALUE
                        : request.getHeader(name);
                headers.put(name, value);
            }
            return objectMapper.writeValueAsString(headers);
        } catch (Exception e) {
            log.warn("Failed to serialize request headers: {}", e.getMessage());
            return "{}";
        }
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

    private static final List<String> PROVIDER_EVENT_ID_HEADERS = List.of(
            "X-Webhook-Id",              // Generic
            "Stripe-Webhook-Id",         // Stripe
            "X-GitHub-Delivery",         // GitHub
            "X-Shopify-Webhook-Id",      // Shopify
            "X-Request-Id",              // Generic fallback
            "X-Twilio-Webhook-Id",       // Twilio
            "X-Slack-Request-Timestamp"  // Slack (timestamp as dedup key)
    );

    private String extractProviderEventId(HttpServletRequest request, String bodySha256) {
        for (String header : PROVIDER_EVENT_ID_HEADERS) {
            String value = request.getHeader(header);
            if (value != null && !value.isBlank()) {
                return truncate(value.trim(), 255);
            }
        }
        // Fallback: use body hash as dedup key (same payload = duplicate)
        return bodySha256;
    }

    private String truncate(String str, int maxLength) {
        if (str == null || str.length() <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength);
    }

    // Custom exceptions for ingress handling
    public static class SourceNotFoundException extends RuntimeException {
        public SourceNotFoundException(String message) { super(message); }
    }

    public static class SourceDisabledException extends RuntimeException {
        public SourceDisabledException(String message) { super(message); }
    }

    public static class PayloadTooLargeException extends RuntimeException {
        public PayloadTooLargeException(String message) { super(message); }
    }

    public static class RateLimitExceededException extends RuntimeException {
        public RateLimitExceededException(String message) { super(message); }
    }

    public static class SignatureVerificationFailedException extends RuntimeException {
        private final IncomingEvent event;

        public SignatureVerificationFailedException(String message, IncomingEvent event) {
            super(message);
            this.event = event;
        }

        public IncomingEvent getEvent() {
            return event;
        }
    }
}
