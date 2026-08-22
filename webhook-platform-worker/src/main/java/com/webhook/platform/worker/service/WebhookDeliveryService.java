package com.webhook.platform.worker.service;

import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.common.security.EncryptionKeyRegistry;
import com.webhook.platform.common.security.UrlValidator;
import com.webhook.platform.common.util.HeaderSanitizer;
import com.webhook.platform.common.util.WebhookSignatureUtils;
import com.webhook.platform.worker.domain.entity.*;
import com.webhook.platform.worker.domain.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.extern.slf4j.Slf4j;
import com.webhook.platform.common.constants.KafkaTopics;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import jakarta.annotation.PreDestroy;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import reactor.netty.http.client.HttpClient;
import reactor.netty.resources.ConnectionProvider;

@Service
@Slf4j
public class WebhookDeliveryService {

    private final DeliveryRepository deliveryRepository;
    private final EndpointRepository endpointRepository;
    private final EventRepository eventRepository;
    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final WebClient defaultWebClient;
    private final MtlsWebClientFactory mtlsWebClientFactory;
    private final EncryptionKeyRegistry encryptionKeyRegistry;
    private final boolean allowPrivateIps;
    private final List<String> allowedHosts;
    private final RedisRateLimiterService rateLimiterService;
    private final RedisConcurrencyControlService concurrencyControlService;
    private final ProjectRateLimiterService projectRateLimiterService;
    private final CircuitBreakerService circuitBreakerService;
    private final MeterRegistry meterRegistry;
    private final OrderingBufferService orderingBufferService;
    private final KafkaTemplate<String, DeliveryMessage> kafkaTemplate;
    private final PayloadTransformService payloadTransformService;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;
    private final TransformationCacheService transformationCacheService;

    private final Counter deliverySuccessCounter;
    private final Counter deliveryFailureCounter;
    private final Counter deliveryErrorCounter;
    private final Counter orderingGapTimeoutCounter;
    /**
     * How long a delivery blocked behind an outstanding sequence waits before it is
     * re-polled. This is the fallback path only: the fast path is
     * {@link #triggerBufferedDeliveries}, which republishes buffered deliveries the
     * moment the sequence ahead of them completes. The fallback still matters when a
     * delivery reaches the buffer *after* the trigger for its predecessor already
     * fired — the chain is broken at that point and nothing but this poll restarts it.
     *
     * <p>Configurable rather than hardcoded because it sets the floor on how long an
     * out-of-order burst takes to drain, which is a deployment-shaped trade-off (a
     * shorter delay drains faster and polls the DB more often) and, concretely, was
     * what made {@code DeliveryEndToEndIntegrationTest}'s ordering scenario take ~30s
     * of its 60s Awaitility budget on a developer machine — a margin thin enough that
     * the slower CI runner tipped it over into a timeout.
     */
    private final int orderingBufferRescheduleDelaySeconds;
    private final Counter transformFailedCounter;
    private final Timer deliveryLatency2xx;
    private final Timer deliveryLatency4xx;
    private final Timer deliveryLatency5xx;

    private final AtomicInteger inFlightCount = new AtomicInteger(0);
    private volatile boolean shuttingDown = false;

    public WebhookDeliveryService(
            DeliveryRepository deliveryRepository,
            EndpointRepository endpointRepository,
            EventRepository eventRepository,
            DeliveryAttemptRepository deliveryAttemptRepository,
            WebClient.Builder webClientBuilder,
            MtlsWebClientFactory mtlsWebClientFactory,
            EncryptionKeyRegistry encryptionKeyRegistry,
            @Value("${webhook.url-validation.allow-private-ips:false}") boolean allowPrivateIps,
            @Value("${webhook.url-validation.allowed-hosts:}") List<String> allowedHosts,
            RedisRateLimiterService rateLimiterService,
            RedisConcurrencyControlService concurrencyControlService,
            ProjectRateLimiterService projectRateLimiterService,
            CircuitBreakerService circuitBreakerService,
            MeterRegistry meterRegistry,
            ObjectMapper objectMapper,
            OrderingBufferService orderingBufferService,
            KafkaTemplate<String, DeliveryMessage> kafkaTemplate,
            PayloadTransformService payloadTransformService,
            TransactionTemplate transactionTemplate,
            TransformationCacheService transformationCacheService,
            ConnectionProvider webhookConnectionProvider,
            @Value("${ordering.buffer-reschedule-delay-seconds:5}") int orderingBufferRescheduleDelaySeconds) {
        this.deliveryRepository = deliveryRepository;
        this.endpointRepository = endpointRepository;
        this.eventRepository = eventRepository;
        this.deliveryAttemptRepository = deliveryAttemptRepository;
        HttpClient ssrfSafeHttpClient = SsrfProtectionCustomizer.createHttpClient(webhookConnectionProvider, allowPrivateIps);
        this.defaultWebClient = webClientBuilder
                .clientConnector(new ReactorClientHttpConnector(ssrfSafeHttpClient))
                .defaultHeader("User-Agent", "WebhookPlatform/1.0")
                .build();
        this.mtlsWebClientFactory = mtlsWebClientFactory;
        this.encryptionKeyRegistry = encryptionKeyRegistry;
        this.allowPrivateIps = allowPrivateIps;
        this.allowedHosts = allowedHosts;
        this.rateLimiterService = rateLimiterService;
        this.concurrencyControlService = concurrencyControlService;
        this.projectRateLimiterService = projectRateLimiterService;
        this.circuitBreakerService = circuitBreakerService;
        this.meterRegistry = meterRegistry;
        this.orderingBufferService = orderingBufferService;
        this.kafkaTemplate = kafkaTemplate;
        this.payloadTransformService = payloadTransformService;
        this.objectMapper = objectMapper;
        this.transactionTemplate = transactionTemplate;
        this.transformationCacheService = transformationCacheService;

        this.deliverySuccessCounter = Counter.builder("webhook_delivery_attempts_total")
                .tag("result", "success").tag("status_class", "2xx")
                .register(meterRegistry);
        this.deliveryFailureCounter = Counter.builder("webhook_delivery_attempts_total")
                .tag("result", "failure").tag("status_class", "non_2xx")
                .register(meterRegistry);
        this.deliveryErrorCounter = Counter.builder("webhook_delivery_attempts_total")
                .tag("result", "error").tag("status_class", "none")
                .register(meterRegistry);
        this.orderingBufferRescheduleDelaySeconds = orderingBufferRescheduleDelaySeconds;
        this.orderingGapTimeoutCounter = Counter.builder("webhook_ordering_gap_timeout_total")
                .register(meterRegistry);
        this.transformFailedCounter = Counter.builder("transform_failed_total")
                .tag("component", "outgoing_delivery")
                .register(meterRegistry);
        this.deliveryLatency2xx = Timer.builder("webhook_delivery_latency_ms")
                .tag("status_class", "2xx").register(meterRegistry);
        this.deliveryLatency4xx = Timer.builder("webhook_delivery_latency_ms")
                .tag("status_class", "4xx").register(meterRegistry);
        this.deliveryLatency5xx = Timer.builder("webhook_delivery_latency_ms")
                .tag("status_class", "5xx").register(meterRegistry);
    }

    @PreDestroy
    public void onShutdown() {
        shuttingDown = true;
        log.info("Graceful shutdown initiated, {} in-flight deliveries (handled by Kafka container shutdown)",
                inFlightCount.get());
    }

    public boolean isShuttingDown() {
        return shuttingDown;
    }

    /**
     * Called by DeliveryConsumer when the async executor pool is full and this record
     * can't even be submitted. With MANUAL acks a non-ack does not get redelivered until
     * a rebalance/restart, and now that KafkaConsumerConfig defers commits until every
     * lower offset is acked, leaving this record unacked would stall the whole
     * partition forever instead of just delaying it. Kafka's job for this record is done
     * either way — the retry ladder (RetrySchedulerService), not Kafka redelivery, is
     * what actually drives reprocessing, so reschedule the DB row explicitly and let the
     * caller ack.
     */
    public void rescheduleForBackpressure(UUID deliveryId, boolean isRetry) {
        transactionTemplate.executeWithoutResult(tx -> {
            Delivery delivery = deliveryRepository.findById(deliveryId).orElse(null);
            if (delivery == null) {
                log.debug("Delivery {} disappeared before backpressure reschedule", deliveryId);
                return;
            }
            Delivery.DeliveryStatus expected = isRetry
                    ? Delivery.DeliveryStatus.PROCESSING
                    : Delivery.DeliveryStatus.PENDING;
            if (delivery.getStatus() != expected) {
                log.debug("Delivery {} no longer {} (already handled?), skipping backpressure reschedule",
                        deliveryId, expected);
                return;
            }
            long delaySec = ThreadLocalRandom.current().nextLong(5, 16);
            delivery.setStatus(Delivery.DeliveryStatus.PENDING);
            delivery.setClaimToken(null);
            delivery.setNextRetryAt(Instant.now().plusSeconds(delaySec));
            delivery.setUpdatedAt(Instant.now());
            deliveryRepository.save(delivery);
            log.warn("Executor pool full, rescheduled delivery {} via retry ladder in {}s instead of leaving it unacked",
                    deliveryId, delaySec);
        });
    }

    public void processDelivery(DeliveryMessage message, boolean isRetry) {
        Delivery delivery;
        if (isRetry) {
            // Retry path: RetrySchedulerService already claimed the row (status=PROCESSING)
            // before publishing to the retry topic — mirrors how IncomingForwardService
            // treats attempts claimed by IncomingForwardRetryScheduler. No re-claim here;
            // an UPDATE ... WHERE status = 'PENDING' claim would never match and every
            // retry would be silently skipped.
            delivery = deliveryRepository.findById(message.getDeliveryId()).orElse(null);
            if (delivery == null || delivery.getStatus() != Delivery.DeliveryStatus.PROCESSING) {
                log.debug("Retry delivery {} not found or not PROCESSING (already handled?), skipping",
                        message.getDeliveryId());
                return;
            }
        } else {
            // Atomic claim + read in single transaction (UPDATE ... RETURNING *)
            delivery = transactionTemplate
                    .execute(tx -> deliveryRepository.claimForProcessingAndReturn(
                            message.getDeliveryId(), UUID.randomUUID()));
            if (delivery == null) {
                log.debug("Delivery {} already claimed or not PENDING, skipping", message.getDeliveryId());
                return;
            }
        }

        // Check ordering constraints for ordered deliveries
        if (Boolean.TRUE.equals(delivery.getOrderingEnabled()) && delivery.getSequenceNumber() != null) {
            if (!canDeliverWithOrdering(delivery)) {
                return; // Delivery buffered or rescheduled
            }
        }

        Optional<Endpoint> endpointOpt = endpointRepository.findById(delivery.getEndpointId());
        if (endpointOpt.isEmpty()) {
            log.error("Endpoint not found: {}", delivery.getEndpointId());
            markAsFailed(delivery, "Endpoint not found");
            return;
        }

        Endpoint endpoint = endpointOpt.get();
        if (!endpoint.getEnabled()) {
            log.warn("Endpoint disabled: {}", endpoint.getId());
            markAsFailed(delivery, "Endpoint is disabled");
            return;
        }

        // Block deliveries to unverified endpoints (SSRF protection)
        if (endpoint.getVerificationStatus() != Endpoint.VerificationStatus.VERIFIED
                && endpoint.getVerificationStatus() != Endpoint.VerificationStatus.SKIPPED) {
            log.warn("Endpoint {} not verified (status: {}), blocking delivery {}",
                    endpoint.getId(), endpoint.getVerificationStatus(), delivery.getId());
            markAsFailed(delivery, "Endpoint not verified - verification required before receiving webhooks");
            return;
        }

        Optional<Event> eventOpt = eventRepository.findById(delivery.getEventId());
        if (eventOpt.isEmpty()) {
            log.error("Event not found: {}", delivery.getEventId());
            markAsFailed(delivery, "Event not found");
            return;
        }

        Event event = eventOpt.get();

        inFlightCount.incrementAndGet();
        try {
            attemptDelivery(delivery, endpoint, event);
        } catch (Exception e) {
            log.error("Unexpected error in delivery {}: {}", delivery.getId(), e.getMessage(), e);
            try {
                handleError(delivery, e, null, null, 0);
            } catch (Exception ex) {
                log.error("Failed to handle error for delivery {}: {}", delivery.getId(), ex.getMessage());
            }
        } finally {
            inFlightCount.decrementAndGet();
        }
    }

    private void attemptDelivery(Delivery delivery, Endpoint endpoint, Event event) {
        long startTime = System.currentTimeMillis();

        // Project-level rate limit — prevent noisy-neighbor
        if (!projectRateLimiterService.tryAcquire(endpoint.getProjectId())) {
            long delaySec = RetryPolicy.backoffWithJitter(delivery.getAttemptCount(), 1, 30);
            log.warn("Project rate limit exceeded for project {}, rescheduling delivery {} in {}s",
                    endpoint.getProjectId(), delivery.getId(), delaySec);
            rescheduleDelivery(delivery.getId(), Instant.now().plusSeconds(delaySec));
            return;
        }

        if (!circuitBreakerService.isCallPermitted(endpoint.getId())) {
            log.warn("CircuitBreaker OPEN for endpoint {}, rescheduling delivery {}", endpoint.getId(),
                    delivery.getId());
            saveAttempt(delivery, null, null, null, null, null, "CIRCUIT_BREAKER_OPEN", 0);
            rescheduleDelivery(delivery.getId(), Instant.now().plusSeconds(30));
            return;
        }

        Integer rateLimit = endpoint.getRateLimitPerSecond();
        if (rateLimit != null && !rateLimiterService.tryAcquire(endpoint.getId(), rateLimit)) {
            long delaySec = RetryPolicy.backoffWithJitter(delivery.getAttemptCount(), 2, 60);
            log.warn("Rate limited for endpoint {}, rescheduling delivery {} in {}s",
                    endpoint.getId(), delivery.getId(), delaySec);
            rescheduleDelivery(delivery.getId(), Instant.now().plusSeconds(delaySec));
            return;
        }

        if (!concurrencyControlService.tryAcquire(endpoint.getId())) {
            long delaySec = RetryPolicy.backoffWithJitter(delivery.getAttemptCount(), 2, 60);
            log.warn("Max concurrency reached for endpoint {}, rescheduling delivery {} in {}s",
                    endpoint.getId(), delivery.getId(), delaySec);
            rescheduleDelivery(delivery.getId(), Instant.now().plusSeconds(delaySec));
            return;
        }

        // Everything from here on holds a concurrency permit. Every exit path — including
        // exceptions thrown before the HTTP call itself (decryptSecret on a key that got
        // rotated away, the mTLS client factory on a bad cert, ...) — must go through the
        // finally below, or a single bad endpoint config burns a permit per attempt until
        // the endpoint is throttled to zero for the full key TTL.
        String requestHeaders = null;
        String body = null;
        try {
            UrlValidator.validateWebhookUrl(endpoint.getUrl(), allowPrivateIps, allowedHosts);

            // Increment attempt count NOW — only when we actually attempt the HTTP call
            transactionTemplate.executeWithoutResult(tx -> deliveryRepository.incrementAttemptCount(delivery.getId()));
            delivery.setAttemptCount(delivery.getAttemptCount() + 1);

            String secret = decryptSecret(endpoint);
            String originalPayload = event.getPayload();
            String template = resolveTransformTemplate(delivery);
            body = payloadTransformService.transform(originalPayload, template);
            long timestamp = System.currentTimeMillis();

            String signature = WebhookSignatureUtils.buildSignatureHeader(secret, timestamp, body);

            requestHeaders = buildRequestHeadersJson(signature, event.getId().toString(),
                    delivery.getId().toString(), String.valueOf(timestamp));

            Timer.Sample sample = Timer.start(meterRegistry);

            String sequenceHeader = delivery.getSequenceNumber() != null
                    ? String.valueOf(delivery.getSequenceNumber())
                    : "0";

            WebClient client = Boolean.TRUE.equals(endpoint.getMtlsEnabled())
                    ? mtlsWebClientFactory.getWebClient(endpoint)
                    : defaultWebClient;

            String idempotencyKey = delivery.getIdempotencyKey() != null
                    ? delivery.getIdempotencyKey()
                    : event.getId().toString() + "-" + delivery.getEndpointId().toString();

            var requestSpec = client.post()
                    .uri(endpoint.getUrl())
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("X-Signature", signature)
                    .header("X-Event-Id", event.getId().toString())
                    .header("X-Delivery-Id", delivery.getId().toString())
                    .header("X-Timestamp", String.valueOf(timestamp))
                    .header("X-Sequence-Number", sequenceHeader)
                    .header("Idempotency-Key", idempotencyKey);

            // Add custom headers if configured
            addCustomHeaders(requestSpec, delivery.getCustomHeaders());

            // The mono only ever produces the raw HTTP outcome — no DB/Redis/Kafka work
            // happens inside .map/.timeout. handleResponse (DB writes via markAsSuccess/
            // scheduleRetry, Redis via orderingBufferService, Kafka via kafkaTemplate) runs
            // below, after block() returns, on this calling thread — never on the reactor-
            // netty event-loop thread, and never race with the .timeout that guards the HTTP
            // call itself. Previously handleResponse ran inside .map, so a slow markAsSuccess
            // could trip .timeout AFTER a 200 was already received, and the resulting
            // TimeoutException drove scheduleRetry to overwrite the just-written SUCCESS row
            // back to PENDING — a duplicate delivery of an already-successful webhook.
            ResponseOutcome outcome = requestSpec.bodyValue(body)
                    .exchangeToMono(response -> {
                        int status = response.statusCode().value();
                        String responseHeaders = buildResponseHeadersJson(response.headers().asHttpHeaders());

                        return response.bodyToMono(String.class)
                                .defaultIfEmpty("")
                                .map(responseBody -> new ResponseOutcome(status, responseBody, responseHeaders));
                    })
                    .timeout(Duration.ofSeconds(clampTimeout(delivery.getTimeoutSeconds())))
                    .block();

            if (outcome != null) {
                sample.stop(timerForStatus(outcome.status()));
                handleResponse(delivery, outcome.status(), outcome.responseBody(), outcome.responseHeaders(),
                        requestHeaders, body, (int) (System.currentTimeMillis() - startTime));
            }
        } catch (UrlValidator.InvalidUrlException e) {
            log.error("SSRF protection: invalid URL for delivery {}: {}", delivery.getId(), e.getMessage());
            saveAttempt(delivery, null, null, null, null, null, "SSRF_PROTECTION: " + e.getMessage(),
                    (int) (System.currentTimeMillis() - startTime));
            markAsFailed(delivery, "SSRF_PROTECTION: " + e.getMessage());
        } catch (PayloadTransformException e) {
            // A configured transformation that fails to apply must never result in the
            // raw payload leaving the platform. Fail this attempt as retryable (same as an
            // HTTP-level failure) so it goes through the normal retry ladder and eventually
            // DLQs if the template stays broken — see scheduleRetry/handleError below.
            transformFailedCounter.increment();
            String message = "TRANSFORM_FAILED: " + e.getMessage();
            log.error("Payload transform failed for delivery {}, refusing to send the raw payload: {}",
                    delivery.getId(), message);
            handleError(delivery, new PayloadTransformException(message, e), requestHeaders, body,
                    (int) (System.currentTimeMillis() - startTime));
        } catch (Exception e) {
            log.error("HTTP request failed for delivery {}: {}", delivery.getId(), e.getMessage());
            handleError(delivery, e, requestHeaders, body,
                    (int) (System.currentTimeMillis() - startTime));
        } finally {
            concurrencyControlService.release(endpoint.getId());
        }
    }

    private record ResponseOutcome(int status, String responseBody, String responseHeaders) {
    }

    private void handleResponse(Delivery delivery, int statusCode, String responseBody,
            String responseHeaders, String requestHeaders, String requestBody, int durationMs) {
        String result = (statusCode >= 200 && statusCode < 300) ? "success" : "failure";
        if ("success".equals(result)) {
            deliverySuccessCounter.increment();
        } else {
            deliveryFailureCounter.increment();
        }

        saveAttempt(delivery, statusCode, responseBody, responseHeaders, requestHeaders, requestBody, null, durationMs);

        if (statusCode >= 200 && statusCode < 300) {
            circuitBreakerService.recordSuccess(delivery.getEndpointId(), durationMs);
            markAsSuccess(delivery);
        } else if (RetryPolicy.isRetryable(statusCode)) {
            circuitBreakerService.recordFailure(delivery.getEndpointId(),
                    new RuntimeException("HTTP " + statusCode));
            scheduleRetry(delivery);
        } else {
            circuitBreakerService.recordFailure(delivery.getEndpointId(),
                    new RuntimeException("Non-retryable HTTP " + statusCode));
            markAsFailed(delivery, "Non-retryable status code: " + statusCode);
        }
    }

    private void handleError(Delivery delivery, Throwable error, String requestHeaders,
            String requestBody, int durationMs) {
        deliveryErrorCounter.increment();

        circuitBreakerService.recordFailure(delivery.getEndpointId(), error);
        saveAttempt(delivery, null, null, null, requestHeaders, requestBody, error.getMessage(), durationMs);
        scheduleRetry(delivery);
    }

    private Timer timerForStatus(int statusCode) {
        if (statusCode >= 200 && statusCode < 300)
            return deliveryLatency2xx;
        if (statusCode >= 400 && statusCode < 500)
            return deliveryLatency4xx;
        return deliveryLatency5xx;
    }

    /**
     * True when {@code fresh} is still the same claim {@code claimed} was read under.
     *
     * <p>Every finalizer below re-reads the row before writing, and guarding that re-read on
     * {@code status == PROCESSING} alone is not enough: a claim can be swept away as abandoned
     * by {@link StuckDeliveryRecoveryService} and the row reclaimed by a different attempt, at
     * which point it is PROCESSING again — for somebody else. A late response belonging to the
     * abandoned attempt would then finalize a row it no longer owns, and the attempt that
     * actually holds the claim never reaches the endpoint. Comparing the fencing token stamped
     * at claim time closes that window (V055__delivery_claim_token.sql).
     *
     * <p>Nulls decide the rolling-deploy case. A row still carrying no token was claimed by
     * an instance running the pre-V055 code, and refusing to finalize it would strand every
     * in-flight delivery of the older instances until the stuck sweep caught up — so an
     * untokened row read by an attempt that also holds no token is accepted, which is exactly
     * the status-only behaviour that preceded this. What must be rejected is the mismatch: a
     * row that now carries a token the attempt does not hold has been reclaimed by somebody
     * else, whether or not this attempt ever had one.
     */
    private boolean stillHoldsClaim(Delivery fresh, Delivery claimed) {
        UUID currentToken = fresh.getClaimToken();
        UUID heldToken = claimed.getClaimToken();
        return currentToken == null ? heldToken == null : currentToken.equals(heldToken);
    }

    private void scheduleRetry(Delivery delivery) {
        // Use transactionTemplate.execute to return whether DLQ was triggered
        Delivery dlqDelivery = transactionTemplate.execute(tx -> {
            // Re-read to get fresh version after async gap
            Delivery fresh = deliveryRepository.findById(delivery.getId()).orElse(null);
            if (fresh == null) {
                log.warn("Delivery {} disappeared during retry scheduling", delivery.getId());
                return null;
            }

            // A terminal state reached via another path (e.g. markAsSuccess already committed
            // SUCCESS) must never be clobbered back to PENDING/DLQ by a late-arriving error
            // handler.
            if (fresh.getStatus() != Delivery.DeliveryStatus.PROCESSING) {
                log.debug("Delivery {} no longer PROCESSING (status={}), skipping retry scheduling " +
                        "— already reached a terminal state via another path", fresh.getId(), fresh.getStatus());
                return null;
            }
            if (!stillHoldsClaim(fresh, delivery)) {
                log.warn("Delivery {} was reclaimed by another attempt, skipping retry scheduling "
                        + "for the attempt this call belongs to", fresh.getId());
                return null;
            }

            if (fresh.getAttemptCount() >= fresh.getMaxAttempts()) {
                log.warn("Max attempts reached for delivery {}, moving to DLQ", fresh.getId());
                fresh.setStatus(Delivery.DeliveryStatus.DLQ);
                fresh.setFailedAt(Instant.now());
                fresh.setUpdatedAt(Instant.now());
                deliveryRepository.save(fresh);
                return fresh;
            } else {
                fresh.setStatus(Delivery.DeliveryStatus.PENDING);
                fresh.setClaimToken(null);
                fresh.setNextRetryAt(RetryPolicy.calculateNextRetry(fresh.getAttemptCount(), fresh.getRetryDelays()));
                log.info("Scheduled retry {} for delivery {} at {}",
                        fresh.getAttemptCount(), fresh.getId(), fresh.getNextRetryAt());
                fresh.setUpdatedAt(Instant.now());
                deliveryRepository.save(fresh);
                return null;
            }
        });

        // Outside the transaction: ordering-buffer release and the DLQ Kafka notification are
        // both fire-and-forget — a Kafka/Redis failure here must not roll back the DLQ write
        // that already committed above.
        if (dlqDelivery != null) {
            if (Boolean.TRUE.equals(dlqDelivery.getOrderingEnabled()) && dlqDelivery.getSequenceNumber() != null) {
                try {
                    orderingBufferService.removeFromBuffer(dlqDelivery.getEndpointId(), dlqDelivery.getId());
                    orderingBufferService.markDelivered(dlqDelivery.getEndpointId(), dlqDelivery.getSequenceNumber());
                    triggerBufferedDeliveries(dlqDelivery.getEndpointId());
                } catch (Exception e) {
                    log.error("Failed to release ordering buffer for DLQ delivery {}: {}",
                            dlqDelivery.getId(), e.getMessage(), e);
                }
            }
            publishDlqEvent(dlqDelivery);
        }
    }

    private void publishDlqEvent(Delivery delivery) {
        try {
            DeliveryMessage dlqMessage = DeliveryMessage.builder()
                    .deliveryId(delivery.getId())
                    .eventId(delivery.getEventId())
                    .endpointId(delivery.getEndpointId())
                    .subscriptionId(delivery.getSubscriptionId())
                    .status(Delivery.DeliveryStatus.DLQ.name())
                    .attemptCount(delivery.getAttemptCount())
                    .sequenceNumber(delivery.getSequenceNumber())
                    .orderingEnabled(delivery.getOrderingEnabled())
                    .build();

            kafkaTemplate.send(KafkaTopics.DELIVERIES_DLQ, delivery.getEndpointId().toString(), dlqMessage);
            log.info("Published DLQ event for delivery {} to {}", delivery.getId(), KafkaTopics.DELIVERIES_DLQ);
        } catch (Exception e) {
            // Best-effort: DB is source of truth, Kafka DLQ is a notification
            log.error("Failed to publish DLQ event for delivery {}: {}", delivery.getId(), e.getMessage(), e);
        }
    }

    private void rescheduleDelivery(UUID deliveryId, Instant nextRetryAt) {
        transactionTemplate.executeWithoutResult(tx -> {
            Delivery fresh = deliveryRepository.findById(deliveryId).orElse(null);
            if (fresh == null) {
                log.warn("Delivery {} disappeared during reschedule", deliveryId);
                return;
            }
            fresh.setStatus(Delivery.DeliveryStatus.PENDING);
            fresh.setClaimToken(null);
            fresh.setNextRetryAt(nextRetryAt);
            fresh.setUpdatedAt(Instant.now());
            deliveryRepository.save(fresh);
        });
    }

    private void markAsSuccess(Delivery delivery) {
        AtomicBoolean transitioned = new AtomicBoolean(false);
        transactionTemplate.executeWithoutResult(tx -> {
            // Re-read to get fresh version after async gap
            Delivery fresh = deliveryRepository.findById(delivery.getId()).orElse(null);
            if (fresh == null) {
                log.warn("Delivery {} disappeared during success marking", delivery.getId());
                return;
            }
            // A late writer for this same delivery (e.g. a retry/failure path that lost the
            // race) must never clobber a terminal state that's already been written.
            if (fresh.getStatus() != Delivery.DeliveryStatus.PROCESSING) {
                log.debug("Delivery {} no longer PROCESSING (status={}), skipping success marking",
                        fresh.getId(), fresh.getStatus());
                return;
            }
            if (!stillHoldsClaim(fresh, delivery)) {
                log.warn("Delivery {} was reclaimed by another attempt, skipping success marking "
                        + "for this attempt's late response", fresh.getId());
                return;
            }
            fresh.setStatus(Delivery.DeliveryStatus.SUCCESS);
            fresh.setSucceededAt(Instant.now());
            fresh.setUpdatedAt(Instant.now());
            deliveryRepository.save(fresh);
            log.info("Delivery {} succeeded after {} attempts", fresh.getId(), fresh.getAttemptCount());
            transitioned.set(true);
        });

        if (!transitioned.get()) {
            return;
        }

        // Outside the transaction: a Kafka/Redis failure releasing the ordering buffer must
        // not roll back the SUCCESS write that already committed above.
        if (Boolean.TRUE.equals(delivery.getOrderingEnabled()) && delivery.getSequenceNumber() != null) {
            try {
                orderingBufferService.markDelivered(delivery.getEndpointId(), delivery.getSequenceNumber());
                triggerBufferedDeliveries(delivery.getEndpointId());
            } catch (Exception e) {
                log.error("Failed to release ordering buffer after success for delivery {}: {}",
                        delivery.getId(), e.getMessage(), e);
            }
        }
    }

    /**
     * Checks if a delivery can proceed based on ordering constraints.
     * Returns true if delivery can proceed, false if it was buffered/rescheduled.
     */
    private boolean canDeliverWithOrdering(Delivery delivery) {
        UUID endpointId = delivery.getEndpointId();
        long sequenceNumber = delivery.getSequenceNumber();

        if (orderingBufferService.canDeliver(endpointId, sequenceNumber)) {
            return true;
        }

        // Check the *whole* missing range, not just sequenceNumber - 1: a
        // single-sequence check meant a delivery several sequences ahead of an outstanding
        // one would sail through the moment the immediately-preceding sequence happened to
        // already be terminal, even though something further back in the gap was still
        // genuinely outstanding.
        Long lastDelivered = orderingBufferService.getLastDeliveredSequence(endpointId);
        long rangeStart = (lastDelivered == null ? 0 : lastDelivered) + 1;
        long rangeEnd = sequenceNumber - 1;

        Instant oldestPendingInRange = rangeStart <= rangeEnd
                ? deliveryRepository.findOldestPendingCreatedAt(endpointId, rangeStart, rangeEnd)
                : null;

        if (oldestPendingInRange == null) {
            // Nothing left outstanding in the gap (already delivered/terminal, or a sequence
            // number that will simply never arrive, e.g. one burned by a rolled-back ingest) —
            // no reason to wait at all.
            log.info("No outstanding deliveries in gap [{}, {}] for endpoint {}, proceeding with seq={}",
                    rangeStart, rangeEnd, endpointId, sequenceNumber);
            return true;
        }

        // Something in the gap is genuinely still outstanding. How long has *this* delivery
        // been waiting on it? Measured from when it was first buffered, not from the blocking
        // row's ingest createdAt — that timestamp is unrelated to how long we've
        // actually been stuck, and using it made isGapTimedOut trivially true for an entire
        // backlog older than the timeout.
        if (orderingBufferService.isGapTimedOut(delivery.getOrderingFirstBufferedAt())) {
            log.warn("Gap timeout for endpoint {}, proceeding with seq={} despite outstanding range [{}, {}]",
                    endpointId, sequenceNumber, rangeStart, rangeEnd);
            // Single counting site for webhook_ordering_gap_timeout_total -- OrderingBufferService
            // no longer increments it too.
            orderingGapTimeoutCounter.increment();
            return true;
        }

        // Buffer the delivery and reschedule; stamp when we first started waiting.
        if (delivery.getOrderingFirstBufferedAt() == null) {
            delivery.setOrderingFirstBufferedAt(Instant.now());
        }
        log.info("Buffering delivery {} (seq={}) waiting for range [{}, {}]",
                delivery.getId(), sequenceNumber, rangeStart, rangeEnd);
        orderingBufferService.bufferDelivery(endpointId, delivery.getId(), sequenceNumber);

        delivery.setStatus(Delivery.DeliveryStatus.PENDING);
        delivery.setNextRetryAt(Instant.now().plusSeconds(orderingBufferRescheduleDelaySeconds));
        // Parking the delivery hands the row back to the retry ladder, so the claim this
        // attempt held is over — clear the token rather than leave a stale one that a later
        // writer could still match.
        delivery.setClaimToken(null);
        delivery.setUpdatedAt(Instant.now());
        try {
            deliveryRepository.save(delivery);
        } catch (OptimisticLockingFailureException e) {
            // Someone else advanced this row while we were deciding to park it. Their
            // view is the newer one, and the Redis buffer entry above is already in
            // place, so the delivery is not lost — it comes back through the buffer
            // trigger or the retry poll. Swallowing this is deliberate: letting it
            // propagate fails the consumer task, and BoundedAsyncExecutor then does not
            // ack, which stalls the whole partition until a restart or rebalance. A lost
            // race on a row we are about to hand back is not worth a stalled partition.
            log.warn("Delivery {} (seq={}) was updated concurrently while being buffered; "
                            + "leaving the other writer's state in place",
                    delivery.getId(), sequenceNumber);
        }

        return false;
    }

    /**
     * Triggers buffered deliveries that are now ready after a sequence was
     * delivered.
     */
    private void triggerBufferedDeliveries(UUID endpointId) {
        List<UUID> readyDeliveries = orderingBufferService.getReadyDeliveries(endpointId);
        if (readyDeliveries.isEmpty()) {
            return;
        }

        List<Delivery> deliveries = deliveryRepository.findAllById(readyDeliveries);
        
        for (Delivery delivery : deliveries) {
            DeliveryMessage message = DeliveryMessage.builder()
                    .deliveryId(delivery.getId())
                    .eventId(delivery.getEventId())
                    .endpointId(delivery.getEndpointId())
                    .subscriptionId(delivery.getSubscriptionId())
                    .status(delivery.getStatus().name())
                    .attemptCount(delivery.getAttemptCount())
                    .sequenceNumber(delivery.getSequenceNumber())
                    .orderingEnabled(delivery.getOrderingEnabled())
                    .build();

            kafkaTemplate.send(KafkaTopics.DELIVERIES_DISPATCH, endpointId.toString(), message);
            log.info("Triggered buffered delivery {} (seq={}) for endpoint {}",
                    delivery.getId(), delivery.getSequenceNumber(), endpointId);
        }
    }

    private void markAsFailed(Delivery delivery, String reason) {
        AtomicBoolean transitioned = new AtomicBoolean(false);
        transactionTemplate.executeWithoutResult(tx -> {
            // Re-read to get fresh version after async gap
            Delivery fresh = deliveryRepository.findById(delivery.getId()).orElse(null);
            if (fresh == null) {
                log.warn("Delivery {} disappeared during failure marking", delivery.getId());
                return;
            }
            // A late writer for this same delivery must never clobber a terminal state that's
            // already been written.
            if (fresh.getStatus() != Delivery.DeliveryStatus.PROCESSING) {
                log.debug("Delivery {} no longer PROCESSING (status={}), skipping failure marking",
                        fresh.getId(), fresh.getStatus());
                return;
            }
            if (!stillHoldsClaim(fresh, delivery)) {
                log.warn("Delivery {} was reclaimed by another attempt, skipping failure marking "
                        + "for this attempt", fresh.getId());
                return;
            }
            fresh.setStatus(Delivery.DeliveryStatus.FAILED);
            fresh.setFailedAt(Instant.now());
            fresh.setUpdatedAt(Instant.now());
            deliveryRepository.save(fresh);
            log.error("Delivery {} failed: {}", fresh.getId(), reason);
            transitioned.set(true);
        });

        if (!transitioned.get()) {
            return;
        }

        // Outside the transaction: a Kafka/Redis failure releasing the ordering buffer must
        // not roll back the FAILED write that already committed above.
        if (Boolean.TRUE.equals(delivery.getOrderingEnabled()) && delivery.getSequenceNumber() != null) {
            try {
                orderingBufferService.removeFromBuffer(delivery.getEndpointId(), delivery.getId());
                orderingBufferService.markDelivered(delivery.getEndpointId(), delivery.getSequenceNumber());
                triggerBufferedDeliveries(delivery.getEndpointId());
            } catch (Exception e) {
                log.error("Failed to release ordering buffer after failure for delivery {}: {}",
                        delivery.getId(), e.getMessage(), e);
            }
        }
    }

    private void saveAttempt(Delivery delivery, Integer statusCode, String responseBody,
            String responseHeaders, String requestHeaders, String requestBody,
            String errorMessage, int durationMs) {
        // Differential truncation: 2KB for success, 10KB for errors
        // Rationale: success responses are less interesting, errors need full context for debugging
        boolean isSuccess = statusCode != null && statusCode >= 200 && statusCode < 300;
        int responseBodyLimit = isSuccess ? 2048 : 10240; // 2KB vs 10KB
        int requestBodyLimit = 10240; // Always keep 10KB of request for debugging
        
        DeliveryAttempt attempt = DeliveryAttempt.builder()
                .deliveryId(delivery.getId())
                .attemptNumber(delivery.getAttemptCount())
                .requestHeaders(requestHeaders)
                .requestBody(truncate(requestBody, requestBodyLimit))
                .httpStatusCode(statusCode)
                .responseHeaders(responseHeaders)
                .responseBody(truncate(responseBody, responseBodyLimit))
                .errorMessage(errorMessage)
                .durationMs(durationMs)
                .build();
        deliveryAttemptRepository.save(attempt);
    }

    private static final String TRUNCATION_MARKER = "\n...[truncated]";

    private String truncate(String str, int maxLength) {
        if (str == null || str.length() <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength) + TRUNCATION_MARKER;
    }

    private String buildRequestHeadersJson(String signature, String eventId, String deliveryId, String timestamp) {
        String maskedSignature = HeaderSanitizer.maskSignature(signature);
        return String.format(
                "{\"Content-Type\":\"application/json\",\"X-Signature\":\"%s\",\"X-Event-Id\":\"%s\",\"X-Delivery-Id\":\"%s\",\"X-Timestamp\":\"%s\",\"User-Agent\":\"WebhookPlatform/1.0\"}",
                maskedSignature, eventId, deliveryId, timestamp);
    }

    private String buildResponseHeadersJson(HttpHeaders headers) {
        try {
            Map<String, String> headerMap = new HashMap<>();
            headers.forEach((key, values) -> {
                if (values != null && !values.isEmpty()) {
                    headerMap.put(key, values.get(0));
                }
            });
            Map<String, String> sanitized = HeaderSanitizer.sanitize(headerMap);
            return objectMapper.writeValueAsString(sanitized);
        } catch (Exception e) {
            log.warn("Failed to serialize response headers: {}", e.getMessage());
            return "{}";
        }
    }

    private String decryptSecret(Endpoint endpoint) {
        try {
            return encryptionKeyRegistry.decryptWithFallback(
                    endpoint.getSecretEncrypted(),
                    endpoint.getSecretIv(),
                    endpoint.getEncryptionKeyVersion());
        } catch (Exception e) {
            throw new RuntimeException("Failed to decrypt secret for endpoint " + endpoint.getId() +
                    ". Check WEBHOOK_ENCRYPTION_KEY configuration.", e);
        }
    }

    @SuppressWarnings("unchecked")
    private void addCustomHeaders(WebClient.RequestBodySpec requestSpec, String customHeadersJson) {
        if (customHeadersJson == null || customHeadersJson.isBlank()) {
            return;
        }
        try {
            Map<String, String> headers = objectMapper.readValue(customHeadersJson, Map.class);
            headers.forEach((key, value) -> {
                if (key != null && value != null && !key.isBlank()) {
                    // Skip headers that could cause security issues
                    String keyLower = key.toLowerCase();
                    if (!keyLower.equals("host") && !keyLower.equals("content-length")
                            && !keyLower.equals("transfer-encoding")) {
                        requestSpec.header(key, value);
                    }
                }
            });
        } catch (Exception e) {
            log.warn("Failed to parse custom headers: {}", e.getMessage());
        }
    }

    private String resolveTransformTemplate(Delivery delivery) {
        if (delivery.getTransformationId() != null) {
            // A transformationId is an explicit choice — if it's gone or disabled, that's a
            // configuration failure, not "no transform configured". Falling back to whatever
            // the inline payloadTemplate happens to be (often null, i.e. raw payload) would
            // silently ship data the customer configured a transform specifically to strip
            // so this must fail the attempt instead of falling through.
            String template = transformationCacheService.findEnabledTemplate(delivery.getTransformationId());
            if (template == null) {
                throw new PayloadTransformException(
                        "Configured transformation " + delivery.getTransformationId()
                                + " not found or disabled for delivery " + delivery.getId());
            }
            return template;
        }
        return delivery.getPayloadTemplate();
    }

    private int clampTimeout(Integer timeoutSeconds) {
        if (timeoutSeconds == null) {
            return 30;
        }
        return Math.max(1, Math.min(60, timeoutSeconds));
    }
}
