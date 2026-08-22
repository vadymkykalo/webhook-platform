package com.webhook.platform.worker.attempt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.common.enums.IncomingAuthType;
import com.webhook.platform.common.retry.RetryLadder;
import com.webhook.platform.common.security.EncryptionKeyRegistry;
import com.webhook.platform.worker.domain.entity.IncomingDestination;
import com.webhook.platform.worker.domain.entity.IncomingEvent;
import com.webhook.platform.worker.domain.entity.IncomingForwardAttempt;
import com.webhook.platform.worker.domain.repository.IncomingForwardAttemptRepository;
import com.webhook.platform.worker.service.PayloadTransformException;
import com.webhook.platform.worker.service.PayloadTransformService;
import com.webhook.platform.worker.service.TransformationCacheService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * How the Incoming direction records its Attempts: one
 * {@code incoming_forward_attempts} row per Attempt, with the successor inserted when the
 * current one is finalised as retryable.
 *
 * <p>Contrast with {@link OutgoingAttemptStore}, which mutates a single {@code deliveries}
 * row in place. Neither model can move to the other's: both are public through API DTOs,
 * controllers, dashboard pages and usage aggregation. That difference is the whole reason
 * this seam has two adapters rather than one.
 *
 * <p>One instance per Attempt. It holds the loaded Event and Destination, so it is confined
 * to the thread running that Attempt and shares no mutable state with any other.
 */
@Slf4j
public class IncomingAttemptStore implements AttemptStore<IncomingAttemptStore.Claim> {

    /**
     * Ownership of one forward attempt row.
     *
     * <p>{@code fence} is the {@code started_at} value this Attempt CASes on. It is never
     * read by {@link AttemptRunner} — the Runner is generic over this type and has no way to
     * reach inside it.
     */
    public record Claim(UUID eventId, UUID destinationId, int attemptNumber, Instant fence) {
    }

    private final IncomingForwardAttemptRepository attemptRepository;
    private final TransactionTemplate transactionTemplate;
    private final TransformationCacheService transformationCacheService;
    private final PayloadTransformService payloadTransformService;
    private final EncryptionKeyRegistry encryptionKeyRegistry;
    private final ObjectMapper objectMapper;
    private final WebClient webClient;
    private final KafkaTemplate<String, IncomingForwardMessage> kafkaTemplate;

    private final IncomingForwardMessage message;
    private final IncomingEvent event;
    private final IncomingDestination destination;

    public IncomingAttemptStore(
            IncomingForwardAttemptRepository attemptRepository,
            TransactionTemplate transactionTemplate,
            TransformationCacheService transformationCacheService,
            PayloadTransformService payloadTransformService,
            EncryptionKeyRegistry encryptionKeyRegistry,
            ObjectMapper objectMapper,
            WebClient webClient,
            KafkaTemplate<String, IncomingForwardMessage> kafkaTemplate,
            IncomingForwardMessage message,
            IncomingEvent event,
            IncomingDestination destination) {
        this.attemptRepository = attemptRepository;
        this.transactionTemplate = transactionTemplate;
        this.transformationCacheService = transformationCacheService;
        this.payloadTransformService = payloadTransformService;
        this.encryptionKeyRegistry = encryptionKeyRegistry;
        this.objectMapper = objectMapper;
        this.webClient = webClient;
        this.kafkaTemplate = kafkaTemplate;
        this.message = message;
        this.event = event;
        this.destination = destination;
    }

    /**
     * Three entry paths, each claiming a row that already exists:
     *
     * <ul>
     *   <li><b>First dispatch</b> ({@code attemptCount == 0}): IngressService created a
     *       PENDING row at attempt 1; claim it with an atomic UPDATE.</li>
     *   <li><b>Replay</b>: the api created a PENDING row at the given number; same claim.</li>
     *   <li><b>Retry</b>: IncomingForwardRetryScheduler already moved the row to PROCESSING
     *       and stamped {@code started_at} as a fencing token before publishing. CAS on that
     *       token rather than trusting the status — Kafka is at-least-once, so the same retry
     *       message can be redelivered after a rebalance loses the offset commit, and both
     *       copies would otherwise see PROCESSING and double-POST.</li>
     * </ul>
     *
     * <p>Never returns {@link ClaimResult.Deferred}: FIFO ordering is an Outgoing concern.
     */
    @Override
    public ClaimResult<Claim> claim() {
        boolean isRetry = message.getAttemptCount() != null && message.getAttemptCount() > 0;
        boolean isReplay = message.isReplay();

        int attemptNumber = isRetry ? message.getAttemptCount() : 1;

        if (isRetry && !isReplay) {
            Instant expected = message.getStartedAt();
            if (expected == null) {
                // An older producer published this before the fencing token existed (rolling
                // deploy skew). Falling back to the pre-existing behaviour beats dropping every
                // in-flight retry.
                log.debug("Retry message has no fencing token (older producer?), proceeding without CAS: "
                        + "eventId={}, destId={}, attempt={}", event.getId(), destination.getId(), attemptNumber);
                return claimed(attemptNumber, null);
            }
            Integer applied = transactionTemplate.execute(tx -> attemptRepository.claimRetryForProcessing(
                    event.getId(), destination.getId(), attemptNumber, expected));
            if (applied == null || applied == 0) {
                return new ClaimResult.NotClaimed<>(
                        "retry attempt already claimed by a prior delivery of this Kafka message");
            }
            return claimed(attemptNumber, expected);
        }

        final int number = attemptNumber;
        Integer applied = transactionTemplate.execute(tx ->
                attemptRepository.claimForProcessing(event.getId(), destination.getId(), number));
        if (applied == null || applied == 0) {
            return new ClaimResult.NotClaimed<>("forward attempt already claimed or not PENDING");
        }
        return claimed(number, null);
    }

    private ClaimResult<Claim> claimed(int attemptNumber, Instant fence) {
        RetryLadder ladder;
        try {
            ladder = RetryLadder.parse(destination.getRetryDelays(), destination.getMaxAttempts());
        } catch (IllegalArgumentException e) {
            // Retrying cannot fix a ladder that does not parse, and letting it throw further
            // down would leave the row PROCESSING for StuckForwardRecovery to hand back,
            // failing the same way forever. The api rejects a malformed ladder on write, so
            // reaching this means the column was written outside the api.
            String reason = "INVALID_RETRY_LADDER: " + e.getMessage();
            log.error("Destination {} carries an unusable retry ladder: {}", destination.getId(), e.getMessage());
            Claim claim = new Claim(event.getId(), destination.getId(), attemptNumber, fence);
            finalise(claim, new Finalization.TerminallyFailed(reason));
            return new ClaimResult.NotClaimed<>(reason);
        }

        Claim claim = new Claim(event.getId(), destination.getId(), attemptNumber, fence);
        AttemptContext context = new AttemptContext(
                "forward eventId=" + event.getId() + " destId=" + destination.getId()
                        + " attempt=" + attemptNumber + "/" + destination.getMaxAttempts(),
                event.getIncomingSourceId(),
                destination.getId(),
                null, // Destinations carry no per-target rate limit of their own
                attemptNumber,
                ladder,
                destination.getUrl(),
                Math.max(1, Math.min(60, destination.getTimeoutSeconds())));
        return new ClaimResult.Claimed<>(claim, context);
    }

    @Override
    public RequestSpec buildRequest(Claim claim, String body) {
        String contentType = event.getContentType() != null ? event.getContentType() : "application/json";
        String idempotencyKey = event.getId() + "-" + destination.getId();

        return new RequestSpec(
                webClient,
                request -> {
                    request.header("Content-Type", contentType)
                            .header("X-Incoming-Event-Id", event.getId().toString())
                            .header("X-Incoming-Request-Id", event.getRequestId())
                            .header("X-Forward-Attempt", String.valueOf(claim.attemptNumber()))
                            .header("Idempotency-Key", idempotencyKey);
                    addAuthHeaders(request);
                    addCustomHeaders(request, destination.getCustomHeadersJson());
                },
                null); // Incoming has never recorded its request headers on the attempt row
    }

    /**
     * Priority: a reusable Transformation by id, then an inline JSONPath expression, then the
     * body unchanged.
     *
     * <p>"No transformation configured" is fine and forwards as-is. But once either is
     * configured, failing to apply it must fail the Attempt: transformations are how customers
     * strip PII before an Incoming payload is relayed onward, so silently forwarding the raw
     * body is the one outcome that must never happen.
     */
    @Override
    public String buildBody(Claim claim) {
        String body = event.getBodyRaw();
        if (body == null || body.isBlank()) {
            return body;
        }

        if (destination.getTransformationId() != null) {
            String template = transformationCacheService.findEnabledTemplate(destination.getTransformationId());
            if (template == null) {
                throw new PayloadTransformException(
                        "Configured transformation " + destination.getTransformationId()
                                + " not found or disabled for destination " + destination.getId());
            }
            return payloadTransformService.transform(body, template);
        }

        String inline = destination.getPayloadTransform();
        if (inline == null || inline.isBlank()) {
            return body;
        }
        try {
            Object result = JsonPath.read(body, inline);
            if (result instanceof String s) {
                return s;
            }
            return objectMapper.writeValueAsString(result);
        } catch (Exception e) {
            throw new PayloadTransformException(
                    "Inline payload transform failed for destination " + destination.getId() + ": " + e.getMessage(), e);
        }
    }

    /** The attempt row already carries its own number; nothing to consume. */
    @Override
    public void attemptStarting(Claim claim) {
    }

    /**
     * Incoming records an Attempt by writing onto the row itself, so there is nothing to
     * append here — {@link #finalise} carries the response fields. Kept as a no-op rather
     * than removed from the interface, because Outgoing genuinely appends a separate row and
     * the Runner must call the same thing for both.
     */
    @Override
    public void recordAttempt(Claim claim, AttemptRecord record) {
        this.pendingRecord = record;
    }

    private AttemptRecord pendingRecord;

    /**
     * Writes the outcome onto the PROCESSING row, and only while it is still PROCESSING.
     *
     * <p>Without that guard a late writer — a timed-out call whose 2xx already landed, or a
     * duplicate Kafka redelivery — silently overwrote a terminal row and, through the
     * retryable branch, queued a duplicate forward. Terminal states are final: whoever got
     * here first won.
     */
    @Override
    public boolean finalise(Claim claim, Finalization outcome) {
        Boolean applied = transactionTemplate.execute(tx -> {
            IncomingForwardAttempt attempt = findAttempt(claim);
            if (attempt == null) {
                log.error("Attempt row not found for finalisation: eventId={}, destId={}, attempt={}",
                        claim.eventId(), claim.destinationId(), claim.attemptNumber());
                return false;
            }

            if (outcome instanceof Finalization.Deferred deferred) {
                // Nothing was sent: hand the row back to the ladder without consuming an
                // attempt. next_retry_at must be set — the scheduler's claim query ignores
                // rows where it is null, so clearing it would strand the forward.
                if (attempt.getStatus() != ForwardAttemptStatus.PENDING
                        && attempt.getStatus() != ForwardAttemptStatus.PROCESSING) {
                    return false;
                }
                attempt.setStatus(ForwardAttemptStatus.PENDING);
                attempt.setStartedAt(null);
                attempt.setNextRetryAt(deferred.until());
                attemptRepository.save(attempt);
                return true;
            }

            if (attempt.getStatus() != ForwardAttemptStatus.PROCESSING) {
                log.warn("Attempt {} for eventId={}, destId={} is already {} — refusing to overwrite",
                        claim.attemptNumber(), claim.eventId(), claim.destinationId(), attempt.getStatus());
                return false;
            }

            attempt.setStatus(statusFor(outcome));
            attempt.setFinishedAt(Instant.now());
            attempt.setErrorMessage(reasonFor(outcome));
            attempt.setNextRetryAt(null);
            applyRecord(attempt);
            attemptRepository.save(attempt);

            // Only the Attempt that actually finalised may queue a successor.
            if (outcome instanceof Finalization.Retry retry) {
                attemptRepository.save(IncomingForwardAttempt.builder()
                        .incomingEventId(claim.eventId())
                        .destinationId(claim.destinationId())
                        .attemptNumber(claim.attemptNumber() + 1)
                        .status(ForwardAttemptStatus.PENDING)
                        .nextRetryAt(retry.at())
                        .build());
            }
            return true;
        });
        return Boolean.TRUE.equals(applied);
    }

    /**
     * Publishes the DLQ notification for a Forward whose Retry Ladder is exhausted.
     *
     * <p>Called only after an {@link Finalization.Abandoned} that actually applied, and
     * deliberately outside that transaction: a Kafka failure here must not roll back the DLQ
     * write that already committed. The database is the source of truth; this is a
     * notification.
     *
     * <p>{@code incoming.forward.dlq} is also the listener container's poison-record topic, so
     * it carries a mix of records the container routed there and business notifications like
     * this one. That mirrors {@code deliveries.dlq}, which has always worked the same way.
     * Anything consuming either topic has to tolerate both shapes; the actionable count is the
     * DB-backed {@code incoming_forward_dlq_depth} gauge rather than the topic's depth.
     */
    @Override
    public void onAbandoned(Claim claim) {
        try {
            kafkaTemplate.send(KafkaTopics.INCOMING_FORWARD_DLQ, claim.destinationId().toString(),
                    IncomingForwardMessage.builder()
                            .incomingEventId(claim.eventId())
                            .destinationId(claim.destinationId())
                            .incomingSourceId(event.getIncomingSourceId())
                            .attemptCount(claim.attemptNumber())
                            .build());
            log.info("Published DLQ event for forward eventId={}, destId={}",
                    claim.eventId(), claim.destinationId());
        } catch (Exception e) {
            log.error("Failed to publish DLQ event for forward eventId={}, destId={}: {}",
                    claim.eventId(), claim.destinationId(), e.getMessage(), e);
        }
    }

    /** Incoming enforces no ordering, so nothing has to be released on success. */
    @Override
    public void onSucceeded(Claim claim) {
    }

    private void applyRecord(IncomingForwardAttempt attempt) {
        if (pendingRecord == null) {
            return;
        }
        attempt.setResponseCode(pendingRecord.statusCode());
        attempt.setResponseHeadersJson(pendingRecord.responseHeaders());
        attempt.setResponseBodySnippet(truncate(pendingRecord.responseBody(), 10240));
    }

    private IncomingForwardAttempt findAttempt(Claim claim) {
        List<IncomingForwardAttempt> attempts = attemptRepository
                .findByIncomingEventIdAndDestinationIdOrderByAttemptNumberDesc(claim.eventId(), claim.destinationId());
        return attempts.stream()
                .filter(a -> a.getAttemptNumber() == claim.attemptNumber())
                .findFirst()
                .orElse(null);
    }

    private ForwardAttemptStatus statusFor(Finalization outcome) {
        if (outcome instanceof Finalization.Succeeded) {
            return ForwardAttemptStatus.SUCCESS;
        }
        if (outcome instanceof Finalization.Abandoned) {
            return ForwardAttemptStatus.DLQ;
        }
        return ForwardAttemptStatus.FAILED;
    }

    private String reasonFor(Finalization outcome) {
        if (outcome instanceof Finalization.Retry retry) {
            return retry.reason();
        }
        if (outcome instanceof Finalization.Abandoned abandoned) {
            return "Max attempts reached: " + abandoned.reason();
        }
        if (outcome instanceof Finalization.TerminallyFailed failed) {
            return failed.reason();
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private void addAuthHeaders(WebClient.RequestBodySpec request) {
        if (destination.getAuthType() == IncomingAuthType.NONE || destination.getAuthConfigEncrypted() == null) {
            return;
        }
        try {
            String authConfig = encryptionKeyRegistry.decryptWithFallback(
                    destination.getAuthConfigEncrypted(),
                    destination.getAuthConfigIv(),
                    destination.getEncryptionKeyVersion());
            Map<String, String> config = objectMapper.readValue(authConfig, Map.class);

            switch (destination.getAuthType()) {
                case BEARER -> {
                    String token = config.get("token");
                    if (token != null) {
                        request.header("Authorization", "Bearer " + token);
                    }
                }
                case BASIC -> {
                    String username = config.getOrDefault("username", "");
                    String password = config.getOrDefault("password", "");
                    request.header("Authorization", "Basic " + Base64.getEncoder()
                            .encodeToString((username + ":" + password).getBytes()));
                }
                case CUSTOM_HEADER -> {
                    String name = config.get("headerName");
                    String value = config.get("headerValue");
                    if (name != null && value != null) {
                        request.header(name, value);
                    }
                }
                default -> {
                }
            }
        } catch (Exception e) {
            log.warn("Failed to apply auth headers for destination {}: {}", destination.getId(), e.getMessage());
        }
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

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "\n...[truncated]";
    }
}
