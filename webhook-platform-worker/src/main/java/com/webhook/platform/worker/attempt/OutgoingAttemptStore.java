package com.webhook.platform.worker.attempt;

import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.common.retry.RetryLadder;
import com.webhook.platform.common.security.EncryptionKeyRegistry;
import com.webhook.platform.common.util.HeaderSanitizer;
import com.webhook.platform.common.security.SecretRotationWindow;
import com.webhook.platform.common.enums.SignatureScheme;
import com.webhook.platform.common.util.StandardWebhookSignature;
import com.webhook.platform.common.util.WebhookSignatureUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.worker.domain.entity.Delivery;
import com.webhook.platform.worker.domain.entity.DeliveryAttempt;
import com.webhook.platform.worker.domain.entity.Endpoint;
import com.webhook.platform.worker.domain.entity.Event;
import com.webhook.platform.worker.domain.repository.DeliveryAttemptRepository;
import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import com.webhook.platform.worker.domain.repository.EndpointRepository;
import com.webhook.platform.worker.domain.repository.EventRepository;
import com.webhook.platform.worker.service.MtlsWebClientFactory;
import com.webhook.platform.worker.service.OrderingBufferService;
import com.webhook.platform.worker.service.PayloadTransformException;
import com.webhook.platform.worker.service.PayloadTransformService;
import com.webhook.platform.worker.service.TransformationCacheService;
import io.micrometer.core.instrument.Counter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * How the Outgoing direction records its Attempts: one {@code deliveries} row mutated in
 * place, with a separate {@code delivery_attempts} row appended per Attempt as a log.
 *
 * <p>The fence and the FIFO ordering gate live here and never reach {@link AttemptRunner};
 * the gate appears at the seam as {@link ClaimResult.Deferred}, because parking a Delivery
 * already means the Claim was released and nothing was sent.
 *
 * <p>One instance per Attempt; thread-confined.
 */
@Slf4j
public class OutgoingAttemptStore implements AttemptStore<OutgoingAttemptStore.Claim> {

    /** Ownership of one delivery row; {@code fence} is the token stamped when it was taken. */
    public record Claim(UUID deliveryId, UUID fence, Delivery delivery) {
    }

    private final DeliveryRepository deliveryRepository;
    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final EndpointRepository endpointRepository;
    private final EventRepository eventRepository;
    private final TransactionTemplate transactionTemplate;
    private final OrderingBufferService orderingBufferService;
    private final KafkaTemplate<String, DeliveryMessage> kafkaTemplate;
    private final EncryptionKeyRegistry encryptionKeyRegistry;
    private final MtlsWebClientFactory mtlsWebClientFactory;
    private final TransformationCacheService transformationCacheService;
    private final PayloadTransformService payloadTransformService;
    private final ObjectMapper objectMapper;
    private final WebClient defaultWebClient;
    private final Counter orderingGapTimeoutCounter;
    private final int orderingRescheduleDelaySeconds;

    private final DeliveryMessage message;
    private final boolean isRetry;

    // Resolved inside claim(), after the ordering gate — see the note there.
    private Endpoint endpoint;
    private Event event;

    private long signatureTimestamp;

    public OutgoingAttemptStore(
            DeliveryRepository deliveryRepository,
            DeliveryAttemptRepository deliveryAttemptRepository,
            EndpointRepository endpointRepository,
            EventRepository eventRepository,
            TransactionTemplate transactionTemplate,
            OrderingBufferService orderingBufferService,
            KafkaTemplate<String, DeliveryMessage> kafkaTemplate,
            EncryptionKeyRegistry encryptionKeyRegistry,
            MtlsWebClientFactory mtlsWebClientFactory,
            TransformationCacheService transformationCacheService,
            PayloadTransformService payloadTransformService,
            ObjectMapper objectMapper,
            WebClient defaultWebClient,
            Counter orderingGapTimeoutCounter,
            int orderingRescheduleDelaySeconds,
            DeliveryMessage message,
            boolean isRetry) {
        this.deliveryRepository = deliveryRepository;
        this.deliveryAttemptRepository = deliveryAttemptRepository;
        this.endpointRepository = endpointRepository;
        this.eventRepository = eventRepository;
        this.transactionTemplate = transactionTemplate;
        this.orderingBufferService = orderingBufferService;
        this.kafkaTemplate = kafkaTemplate;
        this.encryptionKeyRegistry = encryptionKeyRegistry;
        this.mtlsWebClientFactory = mtlsWebClientFactory;
        this.transformationCacheService = transformationCacheService;
        this.payloadTransformService = payloadTransformService;
        this.objectMapper = objectMapper;
        this.defaultWebClient = defaultWebClient;
        this.orderingGapTimeoutCounter = orderingGapTimeoutCounter;
        this.orderingRescheduleDelaySeconds = orderingRescheduleDelaySeconds;
        this.message = message;
        this.isRetry = isRetry;
    }

    /**
     * Claim, then apply the ordering gate.
     *
     * <p>The retry path does not re-claim: RetrySchedulerService already moved the row to
     * PROCESSING before publishing, so an {@code UPDATE … WHERE status = 'PENDING'} would
     * never match and every retry would be silently skipped.
     */
    @Override
    public ClaimResult<Claim> claim() {
        Delivery delivery;
        UUID fence;

        if (isRetry) {
            UUID expected = message.getClaimToken();
            if (expected == null) {
                // Published before the token travelled with the message. Trust the status
                // rather than strand every retry already in flight.
                delivery = deliveryRepository.findById(message.getDeliveryId()).orElse(null);
                if (delivery == null || delivery.getStatus() != Delivery.DeliveryStatus.PROCESSING) {
                    return new ClaimResult.NotClaimed<>("retry delivery not found or not PROCESSING");
                }
                log.debug("Retry message for delivery {} carries no fencing token (older producer?), "
                        + "proceeding without CAS", message.getDeliveryId());
                fence = delivery.getClaimToken();
            } else {
                // CAS on the token the scheduler published with, not on the status: reading
                // the fence out of the row let every copy of a redelivered message match, and
                // the second webhook went out with nothing recording it.
                UUID token = UUID.randomUUID();
                delivery = transactionTemplate.execute(tx ->
                        deliveryRepository.claimRetryForProcessing(message.getDeliveryId(), expected, token));
                if (delivery == null) {
                    return new ClaimResult.NotClaimed<>(
                            "retry delivery already claimed by a prior delivery of this Kafka message");
                }
                fence = token;
            }
        } else {
            UUID token = UUID.randomUUID();
            delivery = transactionTemplate.execute(tx ->
                    deliveryRepository.claimForProcessingAndReturn(message.getDeliveryId(), token));
            if (delivery == null) {
                return new ClaimResult.NotClaimed<>("delivery already claimed or not PENDING");
            }
            fence = token;
        }

        Claim claim = new Claim(delivery.getId(), fence, delivery);

        // Before the Endpoint and Event are read: a parked Delivery is re-polled every few
        // seconds, and loading both rows each time put two reads per poll on the hot path.
        if (Boolean.TRUE.equals(delivery.getOrderingEnabled()) && delivery.getSequenceNumber() != null) {
            Instant until = orderingHold(delivery);
            if (until != null) {
                return new ClaimResult.Deferred<>(until, "waiting for an earlier sequence");
            }
        }

        // Resolved after the claim rather than before it, so these terminal failures are
        // written under the fencing token like every other finalisation.
        endpoint = endpointRepository.findById(delivery.getEndpointId()).orElse(null);
        if (endpoint == null) {
            return terminal(claim, "Endpoint not found");
        }
        // A soft delete is a deletion as far as the owner is concerned: stop delivering,
        // including for events already queued or partway through the retry ladder.
        if (endpoint.getDeletedAt() != null) {
            return terminal(claim, "Endpoint has been deleted");
        }
        if (!endpoint.getEnabled()) {
            return terminal(claim, "Endpoint is disabled");
        }
        if (endpoint.getVerificationStatus() != Endpoint.VerificationStatus.VERIFIED
                && endpoint.getVerificationStatus() != Endpoint.VerificationStatus.SKIPPED) {
            return terminal(claim,
                    "Endpoint not verified - verification required before receiving webhooks");
        }

        event = eventRepository.findById(delivery.getEventId()).orElse(null);
        if (event == null) {
            return terminal(claim, "Event not found");
        }

        RetryLadder ladder;
        try {
            ladder = RetryLadder.parse(delivery.getRetryDelays(), delivery.getMaxAttempts());
        } catch (IllegalArgumentException e) {
            // No number of retries fixes a ladder that does not parse.
            String reason = "INVALID_RETRY_LADDER: " + e.getMessage();
            log.error("Delivery {} carries an unusable retry ladder: {}", delivery.getId(), e.getMessage());
            return terminal(claim, reason);
        }

        AttemptContext context = new AttemptContext(
                "delivery " + delivery.getId() + " attempt " + (delivery.getAttemptCount() + 1)
                        + "/" + delivery.getMaxAttempts(),
                endpoint.getProjectId(),
                endpoint.getId(),
                endpoint.getRateLimitPerSecond(),
                delivery.getAttemptCount() + 1,
                ladder,
                endpoint.getUrl(),
                clampTimeout(delivery.getTimeoutSeconds()));
        return new ClaimResult.Claimed<>(claim, context);
    }

    /** Fails the Delivery under its fencing token and reports that there is nothing to attempt. */
    private ClaimResult<Claim> terminal(Claim claim, String reason) {
        log.warn("Delivery {} will not be attempted: {}", claim.deliveryId(), reason);
        // Never reaches AttemptRunner, so it owes the release itself — and only if its own
        // finalisation applied.
        if (finalise(claim, new Finalization.TerminallyFailed(reason))) {
            onTerminallyFailed(claim);
        }
        return new ClaimResult.NotClaimed<>(reason);
    }

    /**
     * @return when to come back, or null if this Delivery may proceed now. Parking hands the
     *         row back to the retry ladder, so the Claim is over — the token is cleared rather
     *         than left stale for a later writer to match.
     */
    private Instant orderingHold(Delivery delivery) {
        UUID endpointId = delivery.getEndpointId();
        long sequenceNumber = delivery.getSequenceNumber();

        if (orderingBufferService.canDeliver(endpointId, sequenceNumber)) {
            return null;
        }

        // The whole missing range: checking only sequenceNumber - 1 let a Delivery several
        // ahead sail through whenever the immediately preceding one was already terminal.
        Long lastDelivered = orderingBufferService.getLastDeliveredSequence(endpointId);
        long rangeStart = (lastDelivered == null ? 0 : lastDelivered) + 1;
        long rangeEnd = sequenceNumber - 1;

        Instant oldestPendingInRange = rangeStart <= rangeEnd
                ? deliveryRepository.findOldestPendingCreatedAt(endpointId, rangeStart, rangeEnd)
                : null;

        if (oldestPendingInRange == null) {
            log.info("No outstanding deliveries in gap [{}, {}] for endpoint {}, proceeding with seq={}",
                    rangeStart, rangeEnd, endpointId, sequenceNumber);
            return null;
        }

        // From when this Delivery was first buffered: the blocking row's ingest timestamp made
        // the timeout trivially true for any backlog older than it.
        if (orderingBufferService.isGapTimedOut(delivery.getOrderingFirstBufferedAt())) {
            log.warn("Gap timeout for endpoint {}, proceeding with seq={} despite outstanding range [{}, {}]",
                    endpointId, sequenceNumber, rangeStart, rangeEnd);
            orderingGapTimeoutCounter.increment();
            return null;
        }

        if (delivery.getOrderingFirstBufferedAt() == null) {
            delivery.setOrderingFirstBufferedAt(Instant.now());
        }
        log.info("Buffering delivery {} (seq={}) waiting for range [{}, {}]",
                delivery.getId(), sequenceNumber, rangeStart, rangeEnd);
        orderingBufferService.bufferDelivery(endpointId, delivery.getId(), sequenceNumber);

        Instant until = Instant.now().plusSeconds(orderingRescheduleDelaySeconds);
        delivery.setStatus(Delivery.DeliveryStatus.PENDING);
        delivery.setNextRetryAt(until);
        delivery.setClaimToken(null);
        delivery.setUpdatedAt(Instant.now());
        try {
            deliveryRepository.save(delivery);
        } catch (OptimisticLockingFailureException e) {
            // Someone advanced the row while we were parking it; the buffer entry is already
            // in place, so nothing is lost. Swallowed because propagating stalls the partition.
            log.warn("Delivery {} (seq={}) was updated concurrently while being buffered; "
                    + "leaving the other writer's state in place", delivery.getId(), sequenceNumber);
        }
        return until;
    }

    @Override
    public RequestSpec buildRequest(Claim claim, String body) {
        Delivery delivery = claim.delivery();
        String secret = decryptSecret();
        String previousSecret = secretInsideGraceWindow();
        signatureTimestamp = System.currentTimeMillis();

        SignatureScheme scheme = endpoint.getSignatureScheme() != null
                ? endpoint.getSignatureScheme()
                : SignatureScheme.BOTH;

        String signature = scheme == SignatureScheme.STANDARD ? null
                : WebhookSignatureUtils.buildSignatureHeader(
                        secret, previousSecret, signatureTimestamp, body);

        // The delivery id, not the event id, which would collide across a fan-out.
        String standardSignature = scheme == SignatureScheme.LEGACY ? null
                : StandardWebhookSignature.buildSignatureHeader(
                        secret, previousSecret, delivery.getId().toString(),
                        signatureTimestamp / 1000, body);

        String sequenceHeader = delivery.getSequenceNumber() != null
                ? String.valueOf(delivery.getSequenceNumber())
                : "0";
        String idempotencyKey = delivery.getIdempotencyKey() != null
                ? delivery.getIdempotencyKey()
                : event.getId() + "-" + delivery.getEndpointId();

        WebClient client = Boolean.TRUE.equals(endpoint.getMtlsEnabled())
                ? mtlsWebClientFactory.getWebClient(endpoint)
                : defaultWebClient;

        return new RequestSpec(
                client,
                request -> {
                    request.contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                            .header("X-Event-Id", event.getId().toString())
                            .header("X-Delivery-Id", delivery.getId().toString())
                            .header("X-Sequence-Number", sequenceHeader)
                            .header("Idempotency-Key", idempotencyKey);
                    if (signature != null) {
                        request.header("X-Signature", signature)
                                .header("X-Timestamp", String.valueOf(signatureTimestamp));
                    }
                    if (standardSignature != null) {
                        // Lower-case as the convention spells them; cosmetic on the wire.
                        request.header("webhook-id", delivery.getId().toString())
                                .header("webhook-timestamp", String.valueOf(signatureTimestamp / 1000))
                                .header("webhook-signature", standardSignature);
                    }
                    addCustomHeaders(request, delivery.getCustomHeaders());
                },
                recordedRequestHeaders(signature, standardSignature, delivery));
    }

    /**
     * A missing or disabled {@code transformationId} is a configuration failure, not "no
     * transform": falling back would ship the data the transform exists to strip.
     */
    @Override
    public String buildBody(Claim claim) {
        Delivery delivery = claim.delivery();
        String template;
        if (delivery.getTransformationId() != null) {
            template = transformationCacheService.findEnabledTemplate(delivery.getTransformationId());
            if (template == null) {
                throw new PayloadTransformException(
                        "Configured transformation " + delivery.getTransformationId()
                                + " not found or disabled for delivery " + delivery.getId());
            }
        } else {
            template = delivery.getPayloadTemplate();
        }
        return payloadTransformService.transform(event.getDecompressedPayload(), template);
    }

    @Override
    public void attemptStarting(Claim claim) {
        transactionTemplate.executeWithoutResult(tx ->
                deliveryRepository.incrementAttemptCount(claim.deliveryId()));
        claim.delivery().setAttemptCount(claim.delivery().getAttemptCount() + 1);
    }

    /** Outgoing keeps a separate row per Attempt, with more of the body kept for failures. */
    @Override
    public void recordAttempt(Claim claim, AttemptRecord record) {
        boolean success = record.statusCode() != null
                && record.statusCode() >= 200 && record.statusCode() < 300;
        deliveryAttemptRepository.save(DeliveryAttempt.builder()
                .deliveryId(claim.deliveryId())
                // Carried across from the Delivery: the api filters delivery_attempts on it and
                // the worker has no tenant of its own to derive it from.
                .organizationId(claim.delivery().getOrganizationId())
                .attemptNumber(claim.delivery().getAttemptCount())
                .requestHeaders(record.requestHeaders())
                .requestBody(truncate(record.requestBody(), 10240))
                .httpStatusCode(record.statusCode())
                .responseHeaders(record.responseHeaders())
                .responseBody(truncate(record.responseBody(), success ? 2048 : 10240))
                .errorMessage(record.errorMessage())
                .durationMs(record.durationMs())
                .build());
    }

    /**
     * Re-reads the row and writes only while this Attempt still holds the Claim.
     *
     * <p>The status alone is not enough: a swept row reclaimed by another Attempt is PROCESSING
     * again, for somebody else. Both tokens null is a match, so a row claimed before the token
     * existed is not stranded; a mismatch is not.
     */
    @Override
    public boolean finalise(Claim claim, Finalization outcome) {
        Boolean applied = transactionTemplate.execute(tx -> {
            Delivery fresh = deliveryRepository.findById(claim.deliveryId()).orElse(null);
            if (fresh == null) {
                log.warn("Delivery {} disappeared during finalisation", claim.deliveryId());
                return false;
            }
            if (fresh.getStatus() != Delivery.DeliveryStatus.PROCESSING) {
                log.debug("Delivery {} no longer PROCESSING (status={}), skipping finalisation",
                        fresh.getId(), fresh.getStatus());
                return false;
            }
            if (!stillHoldsClaim(fresh, claim)) {
                log.warn("Delivery {} was reclaimed by another attempt, skipping finalisation", fresh.getId());
                return false;
            }

            Instant now = Instant.now();
            if (outcome instanceof Finalization.Succeeded) {
                fresh.setStatus(Delivery.DeliveryStatus.SUCCESS);
                fresh.setSucceededAt(now);
            } else if (outcome instanceof Finalization.Deferred deferred) {
                fresh.setStatus(Delivery.DeliveryStatus.PENDING);
                fresh.setClaimToken(null);
                fresh.setNextRetryAt(deferred.until());
            } else if (outcome instanceof Finalization.Retry retry) {
                fresh.setStatus(Delivery.DeliveryStatus.PENDING);
                fresh.setClaimToken(null);
                fresh.setNextRetryAt(retry.at());
            } else if (outcome instanceof Finalization.Abandoned) {
                fresh.setStatus(Delivery.DeliveryStatus.DLQ);
                fresh.setFailedAt(now);
            } else if (outcome instanceof Finalization.TerminallyFailed failed) {
                fresh.setStatus(Delivery.DeliveryStatus.FAILED);
                fresh.setFailedAt(now);
                log.error("Delivery {} failed: {}", fresh.getId(), failed.reason());
            }
            fresh.setUpdatedAt(now);
            deliveryRepository.save(fresh);
            return true;
        });
        return Boolean.TRUE.equals(applied);
    }

    /** Outside the finalising transaction: the DLQ write is committed, this is a notification. */
    @Override
    public void onAbandoned(Claim claim) {
        Delivery delivery = claim.delivery();
        releaseOrdering(delivery, true);
        try {
            kafkaTemplate.send(KafkaTopics.DELIVERIES_DLQ, delivery.getEndpointId().toString(),
                    DeliveryMessage.builder()
                            .deliveryId(delivery.getId())
                            .eventId(delivery.getEventId())
                            .endpointId(delivery.getEndpointId())
                            .subscriptionId(delivery.getSubscriptionId())
                            .status(Delivery.DeliveryStatus.DLQ.name())
                            .attemptCount(delivery.getAttemptCount())
                            .sequenceNumber(delivery.getSequenceNumber())
                            .orderingEnabled(delivery.getOrderingEnabled())
                            .build());
            log.info("Published DLQ event for delivery {}", delivery.getId());
        } catch (Exception e) {
            log.error("Failed to publish DLQ event for delivery {}: {}", delivery.getId(), e.getMessage(), e);
        }
    }

    @Override
    public void onSucceeded(Claim claim) {
        releaseOrdering(claim.delivery(), false);
    }

    /**
     * The cursor has to move past a terminally failed Delivery too, or a single non-retryable
     * 4xx parks an ordering-enabled endpoint at that sequence forever. Removed from the buffer
     * as well: nothing is coming along behind it to clean up.
     */
    @Override
    public void onTerminallyFailed(Claim claim) {
        releaseOrdering(claim.delivery(), true);
    }

    private void releaseOrdering(Delivery delivery, boolean removeFromBuffer) {
        if (!Boolean.TRUE.equals(delivery.getOrderingEnabled()) || delivery.getSequenceNumber() == null) {
            return;
        }
        try {
            if (removeFromBuffer) {
                orderingBufferService.removeFromBuffer(delivery.getEndpointId(), delivery.getId());
            }
            orderingBufferService.markDelivered(delivery.getEndpointId(), delivery.getSequenceNumber());
            triggerBufferedDeliveries(delivery.getEndpointId());
        } catch (Exception e) {
            log.error("Failed to release ordering buffer for delivery {}: {}", delivery.getId(), e.getMessage(), e);
        }
    }

    /** Republishes the Deliveries that this sequence was blocking. */
    private void triggerBufferedDeliveries(UUID endpointId) {
        List<UUID> ready = orderingBufferService.getReadyDeliveries(endpointId);
        if (ready.isEmpty()) {
            return;
        }
        for (Delivery buffered : deliveryRepository.findAllById(ready)) {
            kafkaTemplate.send(KafkaTopics.DELIVERIES_DISPATCH, endpointId.toString(),
                    DeliveryMessage.builder()
                            .deliveryId(buffered.getId())
                            .eventId(buffered.getEventId())
                            .endpointId(buffered.getEndpointId())
                            .subscriptionId(buffered.getSubscriptionId())
                            .status(buffered.getStatus().name())
                            .attemptCount(buffered.getAttemptCount())
                            .sequenceNumber(buffered.getSequenceNumber())
                            .orderingEnabled(buffered.getOrderingEnabled())
                            .build());
            log.info("Triggered buffered delivery {} (seq={}) for endpoint {}",
                    buffered.getId(), buffered.getSequenceNumber(), endpointId);
        }
    }

    private boolean stillHoldsClaim(Delivery fresh, Claim claim) {
        UUID current = fresh.getClaimToken();
        return current == null ? claim.fence() == null : current.equals(claim.fence());
    }

    private String decryptSecret() {
        try {
            return encryptionKeyRegistry.decryptWithFallback(
                    endpoint.getSecretEncrypted(), endpoint.getSecretIv(), endpoint.getEncryptionKeyVersion());
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt secret for endpoint " + endpoint.getId()
                    + ". Check WEBHOOK_ENCRYPTION_KEY configuration.", e);
        }
    }

    /**
     * The retired secret while its grace window is open, otherwise null. Signing with both means
     * the receiver's deploy and ours need not be simultaneous. A failure to decrypt this one is
     * logged and dropped: the delivery is still correctly signed with the current secret.
     */
    private String secretInsideGraceWindow() {
        String encrypted = endpoint.getSecretPreviousEncrypted();
        Instant rotatedAt = endpoint.getSecretRotatedAt();
        if (encrypted == null || rotatedAt == null) {
            return null;
        }
        if (!SecretRotationWindow.isOpen(rotatedAt, endpoint.getSecretRotationGracePeriodHours(), Instant.now())) {
            return null;
        }
        try {
            return encryptionKeyRegistry.decryptWithFallback(
                    encrypted, endpoint.getSecretPreviousIv(), endpoint.getEncryptionKeyVersion());
        } catch (Exception e) {
            log.warn("Endpoint {}: previous secret is inside its rotation grace window but could not be "
                    + "decrypted; signing with the current secret only", endpoint.getId(), e);
            return null;
        }
    }

    /** The signature is masked: this string is shown in the dashboard. */
    private String recordedRequestHeaders(String signature, String standardSignature, Delivery delivery) {
        StringBuilder json = new StringBuilder("{\"Content-Type\":\"application/json\"");
        if (signature != null) {
            json.append(",\"X-Signature\":\"").append(HeaderSanitizer.maskSignature(signature)).append('"')
                    .append(",\"X-Timestamp\":\"").append(signatureTimestamp).append('"');
        }
        json.append(",\"X-Event-Id\":\"").append(event.getId()).append('"')
                .append(",\"X-Delivery-Id\":\"").append(delivery.getId()).append('"');
        if (standardSignature != null) {
            // Masked: shown verbatim in the dashboard, and a signature can be replayed.
            json.append(",\"webhook-id\":\"").append(delivery.getId()).append('"')
                    .append(",\"webhook-timestamp\":\"").append(signatureTimestamp / 1000).append('"')
                    .append(",\"webhook-signature\":\"")
                    .append(HeaderSanitizer.maskSignature(standardSignature)).append('"');
        }
        json.append(",\"User-Agent\":\"WebhookPlatform/1.0\"}");
        return json.toString();
    }

    @SuppressWarnings("unchecked")
    private void addCustomHeaders(WebClient.RequestBodySpec request, String customHeadersJson) {
        if (customHeadersJson == null || customHeadersJson.isBlank()) {
            return;
        }
        try {
            Map<String, String> headers = objectMapper.readValue(customHeadersJson, Map.class);
            headers.forEach((key, value) -> {
                if (key != null && value != null && !key.isBlank()) {
                    String lower = key.toLowerCase();
                    if (!lower.equals("host") && !lower.equals("content-length")
                            && !lower.equals("transfer-encoding")) {
                        request.header(key, value);
                    }
                }
            });
        } catch (Exception e) {
            log.warn("Failed to parse custom headers: {}", e.getMessage());
        }
    }

    private int clampTimeout(Integer timeoutSeconds) {
        if (timeoutSeconds == null) {
            return 30;
        }
        return Math.max(1, Math.min(60, timeoutSeconds));
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "\n...[truncated]";
    }
}
