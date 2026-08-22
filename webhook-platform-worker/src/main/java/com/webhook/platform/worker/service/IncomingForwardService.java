package com.webhook.platform.worker.service;

import com.webhook.platform.common.http.SsrfProtectionCustomizer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.common.security.EncryptionKeyRegistry;
import com.webhook.platform.worker.attempt.AttemptMetrics;
import com.webhook.platform.worker.attempt.AttemptRunner;
import com.webhook.platform.worker.attempt.IncomingAttemptStore;
import com.webhook.platform.worker.domain.entity.IncomingDestination;
import com.webhook.platform.worker.domain.entity.IncomingEvent;
import com.webhook.platform.worker.domain.entity.IncomingForwardAttempt;
import com.webhook.platform.worker.domain.repository.IncomingDestinationRepository;
import com.webhook.platform.worker.domain.repository.IncomingEventRepository;
import com.webhook.platform.worker.domain.repository.IncomingForwardAttemptRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
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
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * The Incoming half of the pipeline: resolve the Event and the Destination, then hand the
 * Attempt to {@link AttemptRunner}.
 *
 * <p>Everything about how an Attempt is claimed, admitted, sent, classified and finalised
 * moved to the Runner and {@link IncomingAttemptStore}. What is left here is what is
 * genuinely this direction's own: loading the pair of rows, and deciding when a Forward
 * should not be attempted at all.
 *
 * <p>Before that move this class and {@link WebhookDeliveryService} were near-copies, and
 * commit {@code 2070d30} had to hand-port four separate fixes from one to the other. See
 * {@code docs/adr/0011-one-attempt-runner-for-both-directions.md}.
 */
@Service
@Slf4j
public class IncomingForwardService {

    private final IncomingEventRepository eventRepository;
    private final IncomingDestinationRepository destinationRepository;
    private final IncomingForwardAttemptRepository attemptRepository;
    private final TransformationCacheService transformationCacheService;
    private final PayloadTransformService payloadTransformService;
    private final EncryptionKeyRegistry encryptionKeyRegistry;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;
    private final AttemptRunner attemptRunner;
    private final WebClient webClient;
    private final KafkaTemplate<String, IncomingForwardMessage> kafkaTemplate;
    private final boolean allowPrivateIps;
    private final List<String> allowedHosts;
    private final AttemptMetrics metrics;

    public IncomingForwardService(
            IncomingEventRepository eventRepository,
            IncomingDestinationRepository destinationRepository,
            IncomingForwardAttemptRepository attemptRepository,
            TransformationCacheService transformationCacheService,
            PayloadTransformService payloadTransformService,
            WebClient.Builder webClientBuilder,
            ObjectMapper objectMapper,
            EncryptionKeyRegistry encryptionKeyRegistry,
            @Value("${webhook.url-validation.allow-private-ips:false}") boolean allowPrivateIps,
            @Value("${webhook.url-validation.allowed-hosts:}") List<String> allowedHosts,
            MeterRegistry meterRegistry,
            TransactionTemplate transactionTemplate,
            ConnectionProvider webhookConnectionProvider,
            AttemptRunner attemptRunner,
            @Qualifier("incomingForwardKafkaTemplate")
            KafkaTemplate<String, IncomingForwardMessage> kafkaTemplate) {
        this.eventRepository = eventRepository;
        this.destinationRepository = destinationRepository;
        this.attemptRepository = attemptRepository;
        this.transformationCacheService = transformationCacheService;
        this.payloadTransformService = payloadTransformService;
        this.objectMapper = objectMapper;
        this.encryptionKeyRegistry = encryptionKeyRegistry;
        this.transactionTemplate = transactionTemplate;
        this.attemptRunner = attemptRunner;
        this.kafkaTemplate = kafkaTemplate;
        this.allowPrivateIps = allowPrivateIps;
        this.allowedHosts = allowedHosts;

        HttpClient ssrfSafeHttpClient =
                SsrfProtectionCustomizer.createHttpClient(webhookConnectionProvider, allowPrivateIps);
        this.webClient = webClientBuilder
                .clientConnector(new ReactorClientHttpConnector(ssrfSafeHttpClient))
                .build();

        this.metrics = new ForwardMetrics(meterRegistry);
    }

    /**
     * Metric names are unchanged from before the Runner existed. Renaming a family inside a
     * refactor would break dashboards and alert rules, which is the one place a refactor must
     * not surprise an operator — so the names stay here and the Runner reaches them through
     * {@link AttemptMetrics}.
     */
    private static final class ForwardMetrics implements AttemptMetrics {
        private final Counter successCounter;
        private final Counter failureCounter;
        private final Counter errorCounter;
        private final Counter transformFailedCounter;
        private final Timer latency;

        ForwardMetrics(MeterRegistry registry) {
            this.successCounter = Counter.builder("incoming_forward_attempts_total")
                    .tag("result", "success").register(registry);
            this.failureCounter = Counter.builder("incoming_forward_attempts_total")
                    .tag("result", "failure").register(registry);
            this.errorCounter = Counter.builder("incoming_forward_attempts_total")
                    .tag("result", "error").register(registry);
            this.transformFailedCounter = Counter.builder("transform_failed_total")
                    .tag("component", "incoming_forward").register(registry);
            this.latency = Timer.builder("incoming_forward_latency_ms").register(registry);
        }

        @Override
        public void success(int statusCode, int durationMs) {
            successCounter.increment();
            latency.record(Duration.ofMillis(durationMs));
        }

        @Override
        public void failure(int statusCode, int durationMs) {
            failureCounter.increment();
            latency.record(Duration.ofMillis(durationMs));
        }

        @Override
        public void error(int durationMs) {
            errorCounter.increment();
        }

        @Override
        public void transformFailed() {
            transformFailedCounter.increment();
        }
    }

    public void processForward(IncomingForwardMessage message) {
        UUID eventId = message.getIncomingEventId();
        UUID destinationId = message.getDestinationId();
        int attemptNumber = resolveAttemptNumber(message);

        Optional<IncomingEvent> eventOpt = eventRepository.findById(eventId);
        if (eventOpt.isEmpty()) {
            log.error("Incoming event not found: {}", eventId);
            markAttemptFailedIfExists(eventId, destinationId, attemptNumber, "Incoming event not found");
            return;
        }

        Optional<IncomingDestination> destOpt = destinationRepository.findById(destinationId);
        if (destOpt.isEmpty()) {
            log.error("Incoming destination not found: {}", destinationId);
            markAttemptFailedIfExists(eventId, destinationId, attemptNumber, "Incoming destination not found");
            return;
        }

        IncomingEvent event = eventOpt.get();
        IncomingDestination destination = destOpt.get();

        if (!destination.getEnabled()) {
            log.warn("Destination {} is disabled, skipping forward for event {}", destinationId, eventId);
            markAttemptFailedIfExists(eventId, destinationId, attemptNumber, "Destination is disabled");
            return;
        }

        // URL validation is the Runner's, deliberately. Doing it here would mark the row
        // FAILED without holding a Claim on it, which is looser than every other terminal
        // path; the Runner validates after claiming and finalises under the fence.
        attemptRunner.run(
                new IncomingAttemptStore(
                        attemptRepository, transactionTemplate, transformationCacheService,
                        payloadTransformService, encryptionKeyRegistry, objectMapper, webClient,
                        kafkaTemplate, message, event, destination),
                metrics);
    }

    /**
     * Hands a forward attempt back to the retry ladder when the executor pool is full, so the
     * consumer can ack instead of leaving the record unacked.
     *
     * <p>The incoming listener factory sets {@code asyncAcks(true)}, under which an unacked
     * record is not redelivered until a rebalance and — because a later offset may already be
     * acked — blocks this partition's offset commits rather than merely delaying one message.
     * Kafka's job for this record is done either way: IncomingForwardRetryScheduler, not Kafka
     * redelivery, drives reprocessing.
     *
     * <p>Both entry states are handed back the same way: a dispatch row is still PENDING and a
     * retry row is already PROCESSING. Either way {@code next_retry_at} must be set — the
     * scheduler's claim query ignores rows where it is null, so acking a fresh dispatch row
     * without stamping it would strand the forward.
     */
    public void rescheduleForBackpressure(IncomingForwardMessage message) {
        UUID eventId = message.getIncomingEventId();
        UUID destinationId = message.getDestinationId();
        int attemptNumber = resolveAttemptNumber(message);

        transactionTemplate.executeWithoutResult(tx -> {
            IncomingForwardAttempt attempt = findAttempt(eventId, destinationId, attemptNumber);
            if (attempt == null) {
                log.debug("Forward attempt {} for eventId={}, destId={} disappeared before backpressure reschedule",
                        attemptNumber, eventId, destinationId);
                return;
            }
            if (attempt.getStatus() != ForwardAttemptStatus.PENDING
                    && attempt.getStatus() != ForwardAttemptStatus.PROCESSING) {
                log.debug("Forward attempt {} for eventId={}, destId={} is already {} — skipping backpressure reschedule",
                        attemptNumber, eventId, destinationId, attempt.getStatus());
                return;
            }
            long delaySec = ThreadLocalRandom.current().nextLong(5, 16);
            attempt.setStatus(ForwardAttemptStatus.PENDING);
            attempt.setStartedAt(null);
            attempt.setNextRetryAt(Instant.now().plusSeconds(delaySec));
            attemptRepository.save(attempt);
            log.warn("Executor pool full, rescheduled forward eventId={}, destId={} via retry ladder in {}s "
                    + "instead of leaving it unacked", eventId, destinationId, delaySec);
        });
    }

    private int resolveAttemptNumber(IncomingForwardMessage message) {
        return message.getAttemptCount() != null && message.getAttemptCount() > 0
                ? message.getAttemptCount()
                : 1;
    }

    private void markAttemptFailedIfExists(UUID eventId, UUID destinationId, int attemptNumber, String reason) {
        transactionTemplate.executeWithoutResult(tx -> {
            List<IncomingForwardAttempt> attempts = attemptRepository
                    .findByIncomingEventIdAndDestinationIdOrderByAttemptNumberDesc(eventId, destinationId);

            IncomingForwardAttempt attempt = attempts.stream()
                    .filter(a -> a.getAttemptNumber() == attemptNumber)
                    .findFirst()
                    .orElseGet(() -> attempts.stream()
                            .filter(a -> a.getStatus() == ForwardAttemptStatus.PENDING
                                    || a.getStatus() == ForwardAttemptStatus.PROCESSING)
                            .findFirst()
                            .orElse(null));

            if (attempt == null) {
                log.warn("No attempt row found to mark failed: eventId={}, destId={}, attempt={}",
                        eventId, destinationId, attemptNumber);
                return;
            }

            attempt.setStatus(ForwardAttemptStatus.FAILED);
            attempt.setFinishedAt(Instant.now());
            attempt.setErrorMessage(reason);
            attempt.setNextRetryAt(null);
            attemptRepository.save(attempt);
        });
    }

    private IncomingForwardAttempt findAttempt(UUID eventId, UUID destinationId, int attemptNumber) {
        return attemptRepository
                .findByIncomingEventIdAndDestinationIdOrderByAttemptNumberDesc(eventId, destinationId)
                .stream()
                .filter(a -> a.getAttemptNumber() == attemptNumber)
                .findFirst()
                .orElse(null);
    }
}
