package com.webhook.platform.worker.service;

import com.webhook.platform.common.http.SsrfProtectionCustomizer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.common.security.EncryptionKeyRegistry;
import com.webhook.platform.worker.attempt.AttemptMetrics;
import com.webhook.platform.worker.attempt.AttemptRunner;
import com.webhook.platform.worker.attempt.OutgoingAttemptStore;
import com.webhook.platform.worker.domain.entity.Delivery;
import com.webhook.platform.worker.domain.repository.DeliveryAttemptRepository;
import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import com.webhook.platform.worker.domain.repository.EndpointRepository;
import com.webhook.platform.worker.domain.repository.EventRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;
import reactor.netty.resources.ConnectionProvider;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The Outgoing half of the pipeline. What is left here is the Spring wiring, the metric
 * names, graceful-shutdown bookkeeping, and the backpressure hand-back — everything else is
 * behind the seam.
 *
 * <p>Claiming, admission, sending, classification and finalisation all moved to the Runner;
 * everything specific to how Outgoing stores an Attempt — the {@code claim_token} fence, the
 * FIFO ordering gate, HMAC signing, the {@code delivery_attempts} log, the DLQ notification —
 * moved to {@link OutgoingAttemptStore}.
 */
@Service
@Slf4j
public class WebhookDeliveryService {

    private final DeliveryRepository deliveryRepository;
    private final EndpointRepository endpointRepository;
    private final EventRepository eventRepository;
    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final TransactionTemplate transactionTemplate;
    private final AttemptRunner attemptRunner;
    private final OrderingBufferService orderingBufferService;
    private final KafkaTemplate<String, DeliveryMessage> kafkaTemplate;
    private final EncryptionKeyRegistry encryptionKeyRegistry;
    private final MtlsWebClientFactory mtlsWebClientFactory;
    private final TransformationCacheService transformationCacheService;
    private final PayloadTransformService payloadTransformService;
    private final ObjectMapper objectMapper;
    private final WebClient defaultWebClient;
    private final Counter orderingGapTimeoutCounter;
    private final AttemptMetrics metrics;

    /**
     * How long a Delivery blocked behind an outstanding sequence waits before it is re-polled.
     * This is the fallback path only: the fast path republishes buffered Deliveries the moment
     * the sequence ahead of them completes. The fallback still matters when a Delivery reaches
     * the buffer <em>after</em> the trigger for its predecessor already fired — the chain is
     * broken at that point and nothing but this poll restarts it.
     *
     * <p>Configurable rather than hardcoded because it sets the floor on how long an
     * out-of-order burst takes to drain, which is a deployment-shaped trade-off.
     */
    private final int orderingBufferRescheduleDelaySeconds;

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
            MeterRegistry meterRegistry,
            ObjectMapper objectMapper,
            OrderingBufferService orderingBufferService,
            KafkaTemplate<String, DeliveryMessage> kafkaTemplate,
            PayloadTransformService payloadTransformService,
            TransactionTemplate transactionTemplate,
            TransformationCacheService transformationCacheService,
            ConnectionProvider webhookConnectionProvider,
            AttemptRunner attemptRunner,
            @Value("${ordering.buffer-reschedule-delay-seconds:5}") int orderingBufferRescheduleDelaySeconds) {
        this.deliveryRepository = deliveryRepository;
        this.endpointRepository = endpointRepository;
        this.eventRepository = eventRepository;
        this.deliveryAttemptRepository = deliveryAttemptRepository;
        this.mtlsWebClientFactory = mtlsWebClientFactory;
        this.encryptionKeyRegistry = encryptionKeyRegistry;
        this.orderingBufferService = orderingBufferService;
        this.kafkaTemplate = kafkaTemplate;
        this.payloadTransformService = payloadTransformService;
        this.objectMapper = objectMapper;
        this.transactionTemplate = transactionTemplate;
        this.transformationCacheService = transformationCacheService;
        this.attemptRunner = attemptRunner;
        this.orderingBufferRescheduleDelaySeconds = orderingBufferRescheduleDelaySeconds;

        HttpClient ssrfSafeHttpClient =
                SsrfProtectionCustomizer.createHttpClient(webhookConnectionProvider, allowPrivateIps);
        this.defaultWebClient = webClientBuilder
                .clientConnector(new ReactorClientHttpConnector(ssrfSafeHttpClient))
                .defaultHeader("User-Agent", "WebhookPlatform/1.0")
                .build();

        this.orderingGapTimeoutCounter = Counter.builder("webhook_ordering_gap_timeout_total")
                .register(meterRegistry);
        this.metrics = new DeliveryMetrics(meterRegistry);
    }

    /**
     * Metric names are unchanged from before the Runner existed — same reasoning as on
     * IncomingForwardService. Renaming a family inside a refactor breaks dashboards and alert
     * rules, so the names stay here and the Runner reaches them through {@link AttemptMetrics}.
     */
    private static final class DeliveryMetrics implements AttemptMetrics {
        private final Counter successCounter;
        private final Counter failureCounter;
        private final Counter errorCounter;
        private final Counter transformFailedCounter;
        private final Timer latency2xx;
        private final Timer latency4xx;
        private final Timer latency5xx;

        DeliveryMetrics(MeterRegistry registry) {
            this.successCounter = Counter.builder("webhook_delivery_attempts_total")
                    .tag("result", "success").tag("status_class", "2xx").register(registry);
            this.failureCounter = Counter.builder("webhook_delivery_attempts_total")
                    .tag("result", "failure").tag("status_class", "non_2xx").register(registry);
            this.errorCounter = Counter.builder("webhook_delivery_attempts_total")
                    .tag("result", "error").tag("status_class", "none").register(registry);
            this.transformFailedCounter = Counter.builder("transform_failed_total")
                    .tag("component", "outgoing_delivery").register(registry);
            this.latency2xx = Timer.builder("webhook_delivery_latency_ms")
                    .tag("status_class", "2xx").register(registry);
            this.latency4xx = Timer.builder("webhook_delivery_latency_ms")
                    .tag("status_class", "4xx").register(registry);
            this.latency5xx = Timer.builder("webhook_delivery_latency_ms")
                    .tag("status_class", "5xx").register(registry);
        }

        @Override
        public void success(int statusCode, int durationMs) {
            successCounter.increment();
            timerFor(statusCode).record(Duration.ofMillis(durationMs));
        }

        @Override
        public void failure(int statusCode, int durationMs) {
            failureCounter.increment();
            timerFor(statusCode).record(Duration.ofMillis(durationMs));
        }

        @Override
        public void error(int durationMs) {
            errorCounter.increment();
        }

        @Override
        public void transformFailed() {
            transformFailedCounter.increment();
        }

        private Timer timerFor(int statusCode) {
            if (statusCode >= 200 && statusCode < 300) {
                return latency2xx;
            }
            if (statusCode >= 400 && statusCode < 500) {
                return latency4xx;
            }
            return latency5xx;
        }
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
     * Resolving the Endpoint and the Event, and every reason a Delivery must not be attempted,
     * moved into {@link OutgoingAttemptStore#claim()}. Two reasons: those terminal failures are
     * now written under the fencing token like every other finalisation, and a Delivery parked
     * behind an outstanding sequence no longer reads both rows on every re-poll just to
     * discover it is still blocked.
     */
    public void processDelivery(DeliveryMessage message, boolean isRetry) {
        inFlightCount.incrementAndGet();
        try {
            attemptRunner.run(newStore(message, isRetry), metrics);
        } catch (Exception e) {
            log.error("Unexpected error in delivery {}: {}", message.getDeliveryId(), e.getMessage(), e);
        } finally {
            inFlightCount.decrementAndGet();
        }
    }

    private OutgoingAttemptStore newStore(DeliveryMessage message, boolean isRetry) {
        return new OutgoingAttemptStore(
                deliveryRepository, deliveryAttemptRepository, endpointRepository, eventRepository,
                transactionTemplate, orderingBufferService, kafkaTemplate, encryptionKeyRegistry,
                mtlsWebClientFactory, transformationCacheService, payloadTransformService,
                objectMapper, defaultWebClient, orderingGapTimeoutCounter,
                orderingBufferRescheduleDelaySeconds, message, isRetry);
    }

    /**
     * Called by DeliveryConsumer when the async executor pool is full and this record cannot
     * even be submitted.
     *
     * <p>With MANUAL acks a non-ack is not redelivered until a rebalance or restart, and since
     * commits are deferred until every lower offset is acked, leaving this record unacked
     * would stall the whole partition rather than merely delay it. Kafka's job for this record
     * is done either way — the retry ladder, not Kafka redelivery, drives reprocessing — so
     * reschedule the row explicitly and let the caller ack.
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
}
