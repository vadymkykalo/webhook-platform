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
import com.webhook.platform.common.enums.VerificationMode;
import com.webhook.platform.api.domain.repository.IncomingDestinationRepository;
import com.webhook.platform.api.domain.repository.IncomingEventRepository;
import com.webhook.platform.api.domain.repository.IncomingForwardAttemptRepository;
import com.webhook.platform.api.domain.repository.IncomingSourceRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import com.webhook.platform.common.util.CryptoUtils;
import com.webhook.platform.common.util.WebhookSignatureUtils;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
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
        this.encryptionKey = encryptionKey;
        this.encryptionSalt = encryptionSalt;
        this.maxPayloadSizeBytes = maxPayloadSizeBytes;
    }

    @Transactional
    public IncomingEvent receiveWebhook(String token, String body, HttpServletRequest request) {
        IncomingSource source = sourceRepository.findByIngressPathToken(token)
                .orElseThrow(() -> new SourceNotFoundException("Invalid ingress token"));

        if (source.getStatus() != IncomingSourceStatus.ACTIVE) {
            throw new SourceDisabledException("Source is disabled");
        }

        // Enforce size limit
        if (body != null && body.length() > maxPayloadSizeBytes) {
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

        // Verify signature if enabled
        Boolean verified = null;
        String verificationError = null;
        if (source.getVerificationMode() == VerificationMode.HMAC_GENERIC) {
            try {
                verified = verifyHmacSignature(source, body, request);
                if (!verified) {
                    verificationError = "Signature mismatch";
                }
            } catch (Exception e) {
                verified = false;
                verificationError = "Verification error: " + e.getMessage();
                log.warn("HMAC verification failed for source {}: {}", source.getId(), e.getMessage());
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

    private boolean verifyHmacSignature(IncomingSource source, String body, HttpServletRequest request) {
        if (source.getHmacSecretEncrypted() == null || source.getHmacSecretIv() == null) {
            throw new IllegalStateException("HMAC secret not configured for source " + source.getId());
        }

        String secret = CryptoUtils.decryptSecret(
                source.getHmacSecretEncrypted(),
                source.getHmacSecretIv(),
                encryptionKey,
                encryptionSalt
        );

        String headerName = source.getHmacHeaderName() != null ? source.getHmacHeaderName() : "X-Signature";
        String signatureHeader = request.getHeader(headerName);
        if (signatureHeader == null || signatureHeader.isBlank()) {
            return false;
        }

        // Strip prefix if configured (e.g., "sha256=")
        String prefix = source.getHmacSignaturePrefix();
        if (prefix != null && !prefix.isEmpty() && signatureHeader.startsWith(prefix)) {
            signatureHeader = signatureHeader.substring(prefix.length());
        }

        // Try platform's standard signature format (t=timestamp,v1=signature)
        if (signatureHeader.contains("t=") && signatureHeader.contains("v1=")) {
            return WebhookSignatureUtils.verifySignature(secret, signatureHeader, body);
        }

        // Generic HMAC: compare raw HMAC-SHA256 hex of body
        String computedHmac = computeHmacSha256(secret, body);
        return MessageDigest.isEqual(
                computedHmac.getBytes(StandardCharsets.UTF_8),
                signatureHeader.getBytes(StandardCharsets.UTF_8)
        );
    }

    private String computeHmacSha256(String secret, String body) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            javax.crypto.spec.SecretKeySpec keySpec = new javax.crypto.spec.SecretKeySpec(
                    secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] hash = mac.doFinal(body != null ? body.getBytes(StandardCharsets.UTF_8) : new byte[0]);
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("Failed to compute HMAC-SHA256", e);
        }
    }

    private String extractClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            return xForwardedFor.split(",")[0].trim();
        }
        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isBlank()) {
            return xRealIp.trim();
        }
        return request.getRemoteAddr();
    }

    private String extractHeadersJson(HttpServletRequest request) {
        try {
            Map<String, String> headers = new HashMap<>();
            Enumeration<String> headerNames = request.getHeaderNames();
            while (headerNames.hasMoreElements()) {
                String name = headerNames.nextElement();
                headers.put(name, request.getHeader(name));
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
}
