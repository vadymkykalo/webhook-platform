package com.webhook.platform.worker.attempt;

import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.common.retry.RetryLadder;
import com.webhook.platform.common.security.EncryptionKeyRegistry;
import com.webhook.platform.common.util.HeaderSanitizer;
import com.webhook.platform.common.security.SecretRotationWindow;
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
 * <p>Two things live here that have no Incoming counterpart and therefore never reach
 * {@link AttemptRunner}: the {@code claim_token} fence, and the FIFO ordering gate — which
 * appears at the seam as {@link ClaimResult.Deferred} rather than as a stage, because parking
 * a Delivery behind an outstanding sequence already means "the Claim was released and nothing
 * was sent".
 *
 * <p>One instance per Attempt; thread-confined.
 */
@Slf4j
public class OutgoingAttemptStore implements AttemptStore<OutgoingAttemptStore.Claim> {

    /**
     * Ownership of one delivery row.
     *
     * <p>{@code fence} is the {@code claim_token} stamped when this Attempt took the row.
     * {@link AttemptRunner} is generic over this type and cannot read it.
     */
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
                // Published by a worker from before the token travelled with the message
                // (rolling deploy skew). Fall back to trusting the status rather than
                // stranding every retry already in flight — the same accommodation
                // IncomingAttemptStore makes for its own fencing token.
                delivery = deliveryRepository.findById(message.getDeliveryId()).orElse(null);
                if (delivery == null || delivery.getStatus() != Delivery.DeliveryStatus.PROCESSING) {
                    return new ClaimResult.NotClaimed<>("retry delivery not found or not PROCESSING");
                }
                log.debug("Retry message for delivery {} carries no fencing token (older producer?), "
                        + "proceeding without CAS", message.getDeliveryId());
                fence = delivery.getClaimToken();
            } else {
                // CAS on the token the scheduler published with, rather than trusting the
                // status. Reading the fence out of the row meant every copy of a redelivered
                // Kafka message matched, and both dispatched: only the first finalisation
                // applied, so the second webhook went out with nothing recording it. The same
                // held for a message the scheduler had already given up on — it hands the row
                // back as PENDING with a null token, the next poll re-claims it under a new
                // token, and the late send then picked up that new token and dispatched
                // alongside the fresh one.
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

        // The ordering gate comes before the Endpoint and Event are read, deliberately. A
        // Delivery parked behind an outstanding sequence is re-polled every few seconds until
        // its predecessor lands, and loading both rows on each of those polls put two reads per
        // poll on the ordering hot path for no result.
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
            // No number of retries fixes a ladder that does not parse, and letting it throw
            // later would leave the row PROCESSING for StuckDeliveryRecovery to hand back,
            // failing identically forever.
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
        // This path never reaches AttemptRunner — it rejects the Delivery during the claim,
        // before there is an Attempt at all — so it owes the release itself. Same condition as
        // everywhere else: only the writer whose finalisation applied may let go of the cursor.
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

        // The whole missing range, not just sequenceNumber - 1: checking a single sequence let
        // a Delivery several ahead of an outstanding one sail through whenever the immediately
        // preceding sequence happened to be terminal already.
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

        // Measured from when this Delivery was first buffered, not from the blocking row's
        // ingest timestamp — that is unrelated to how long we have actually been stuck, and
        // using it made the timeout trivially true for any backlog older than it.
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
            // Someone advanced this row while we were deciding to park it. Their view is the
            // newer one and the buffer entry is already in place, so the Delivery is not lost:
            // it comes back through the buffer trigger or the retry poll. Swallowed
            // deliberately — propagating fails the consumer task, which then does not ack and
            // stalls the whole partition until a restart.
            log.warn("Delivery {} (seq={}) was updated concurrently while being buffered; "
                    + "leaving the other writer's state in place", delivery.getId(), sequenceNumber);
        }
        return until;
    }

    @Override
    public RequestSpec buildRequest(Claim claim, String body) {
        Delivery delivery = claim.delivery();
        String secret = decryptSecret();
        signatureTimestamp = System.currentTimeMillis();
        String signature = WebhookSignatureUtils.buildSignatureHeader(
                secret, secretInsideGraceWindow(), signatureTimestamp, body);

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
                            .header("X-Signature", signature)
                            .header("X-Event-Id", event.getId().toString())
                            .header("X-Delivery-Id", delivery.getId().toString())
                            .header("X-Timestamp", String.valueOf(signatureTimestamp))
                            .header("X-Sequence-Number", sequenceHeader)
                            .header("Idempotency-Key", idempotencyKey);
                    addCustomHeaders(request, delivery.getCustomHeaders());
                },
                recordedRequestHeaders(signature, delivery));
    }

    /**
     * A {@code transformationId} is an explicit choice: if it is gone or disabled that is a
     * configuration failure, not "no transform configured". Falling back to the inline
     * template (often null, i.e. the raw payload) would silently ship data the customer
     * configured a transform specifically to strip.
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

    /**
     * Consumed before the request goes out, so a crash mid-send still counts against the
     * Ladder rather than retrying forever.
     */
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
                // the worker has no tenant of its own to derive it from (ADR-0006).
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
     * <p>Guarding on {@code status == PROCESSING} alone is not enough: a Claim can be swept
     * away as abandoned and the row reclaimed by a different Attempt, at which point it is
     * PROCESSING again — for somebody else. Comparing the fencing token closes that window.
     *
     * <p>Both tokens null is a match, on purpose: during a rolling deploy a row claimed by a
     * pre-V055 instance carries none, and rejecting it would strand every in-flight Delivery
     * of the older instances. What is rejected is the mismatch.
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

    /**
     * Outside the finalising transaction on purpose: a Kafka or Redis failure here must not
     * roll back the DLQ write that already committed. The database is the source of truth;
     * the Kafka record is a notification.
     */
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
     * A Delivery that terminally failed is as done as one that succeeded or was abandoned, and
     * the endpoint's cursor has to move past it. It did not, so a single non-retryable 4xx —
     * or a disabled endpoint, or an SSRF rejection — parked an ordering-enabled endpoint at
     * that sequence permanently: nothing after it ever satisfied {@code canDeliver} again.
     * Removed from the buffer as well as marked delivered, as with abandonment, because a
     * terminal Delivery has no successor coming to clean up after it.
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
     * The retired secret, while its grace window is still open — otherwise {@code null}.
     *
     * <p>Rotating used to be a breaking change for the receiver: the new secret took effect
     * on the next delivery, so every webhook failed their verification until they had
     * deployed it. Signing with both for the window means the two deploys do not have to be
     * simultaneous.
     *
     * <p>A failure to decrypt the <em>previous</em> secret is not fatal the way a failure on
     * the current one is: the delivery is still correctly signed with the secret the customer
     * is migrating to. It is logged and the second signature is dropped, rather than taking
     * down a delivery over a secret that is on its way out.
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
    private String recordedRequestHeaders(String signature, Delivery delivery) {
        return String.format(
                "{\"Content-Type\":\"application/json\",\"X-Signature\":\"%s\",\"X-Event-Id\":\"%s\","
                        + "\"X-Delivery-Id\":\"%s\",\"X-Timestamp\":\"%s\",\"User-Agent\":\"WebhookPlatform/1.0\"}",
                HeaderSanitizer.maskSignature(signature), event.getId(), delivery.getId(), signatureTimestamp);
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
