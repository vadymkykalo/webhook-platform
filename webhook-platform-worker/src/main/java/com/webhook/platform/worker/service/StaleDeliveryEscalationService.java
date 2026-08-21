package com.webhook.platform.worker.service;

import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.worker.domain.entity.Delivery;
import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Hard-cap escalation policy for deliveries stuck in PENDING state beyond a configurable threshold.
 *
 * <p>Addresses the scenario where downstream endpoints are degraded for extended periods,
 * causing the retry backlog to grow unboundedly even with governor/circuit-breaker protections.
 *
 * <h3>Behaviour</h3>
 * <ol>
 *   <li>Periodically computes the age of the oldest pending delivery and exports it as a Prometheus gauge
 *       ({@code delivery_oldest_pending_age_seconds}) for alerting.</li>
 *   <li>Finds deliveries in PENDING state whose {@code created_at} is older than the hard-cap threshold
 *       (default 96h — chosen to comfortably exceed the default retry ladder's ~83h worst-case span,
 *       see {@code RetryPolicy#validateLadderFitsCap}, P1-24a) and escalates them to DLQ status.</li>
 *   <li>Publishes a DLQ notification to Kafka for each escalated delivery (best-effort).</li>
 * </ol>
 */
@Service
@Slf4j
public class StaleDeliveryEscalationService {

    private final DeliveryRepository deliveryRepository;
    private final KafkaTemplate<String, DeliveryMessage> kafkaTemplate;
    private final TransactionTemplate transactionTemplate;
    private final Duration hardCapAge;
    private final int escalationBatchSize;
    private final AtomicLong oldestPendingAgeSeconds = new AtomicLong(0);
    private final Counter escalatedCounter;

    public StaleDeliveryEscalationService(
            DeliveryRepository deliveryRepository,
            KafkaTemplate<String, DeliveryMessage> kafkaTemplate,
            TransactionTemplate transactionTemplate,
            MeterRegistry meterRegistry,
            @Value("${delivery.escalation.hard-cap-hours:96}") long hardCapHours,
            @Value("${delivery.escalation.batch-size:100}") int escalationBatchSize) {
        this.deliveryRepository = deliveryRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.transactionTemplate = transactionTemplate;
        this.hardCapAge = Duration.ofHours(hardCapHours);
        this.escalationBatchSize = escalationBatchSize;

        Gauge.builder("delivery_oldest_pending_age_seconds", oldestPendingAgeSeconds, AtomicLong::doubleValue)
                .description("Age in seconds of the oldest delivery in PENDING state")
                .register(meterRegistry);

        this.escalatedCounter = Counter.builder("delivery_escalated_to_dlq_total")
                .description("Deliveries escalated to DLQ by hard-cap policy")
                .register(meterRegistry);

        log.info("Stale delivery escalation initialized: hardCapAge={}h, batchSize={}",
                hardCapHours, escalationBatchSize);
    }

    @Scheduled(fixedDelayString = "${delivery.escalation.interval-ms:300000}")
    public void runEscalation() {
        refreshOldestPendingAge();
        escalateStaleDeliveries();
    }

    private void refreshOldestPendingAge() {
        try {
            Instant oldest = deliveryRepository.findOldestPendingCreatedAtGlobal();
            if (oldest != null) {
                long ageSeconds = Duration.between(oldest, Instant.now()).getSeconds();
                oldestPendingAgeSeconds.set(Math.max(0, ageSeconds));
            } else {
                oldestPendingAgeSeconds.set(0);
            }
        } catch (Exception e) {
            log.warn("Failed to compute oldest pending delivery age: {}", e.getMessage());
        }
    }

    private void escalateStaleDeliveries() {
        try {
            Instant cutoff = Instant.now().minus(hardCapAge);

            List<Delivery> escalated = transactionTemplate.execute(tx -> {
                List<UUID> staleIds = deliveryRepository.findStaleDeliveryIds(cutoff, escalationBatchSize);
                if (staleIds.isEmpty()) {
                    return List.<Delivery>of();
                }

                List<Delivery> stale = deliveryRepository.findAllById(staleIds);
                for (Delivery d : stale) {
                    d.setStatus(Delivery.DeliveryStatus.DLQ);
                    d.setFailedAt(Instant.now());
                    d.setUpdatedAt(Instant.now());
                }
                deliveryRepository.saveAll(stale);

                log.warn("Hard-cap escalation: moved {} stale deliveries (created before {}) to DLQ",
                        stale.size(), cutoff);
                return stale;
            });

            if (escalated == null || escalated.isEmpty()) {
                return;
            }

            escalatedCounter.increment(escalated.size());

            // Best-effort DLQ notifications
            for (Delivery d : escalated) {
                try {
                    DeliveryMessage msg = DeliveryMessage.builder()
                            .deliveryId(d.getId())
                            .eventId(d.getEventId())
                            .endpointId(d.getEndpointId())
                            .subscriptionId(d.getSubscriptionId())
                            .status(Delivery.DeliveryStatus.DLQ.name())
                            .attemptCount(d.getAttemptCount())
                            .sequenceNumber(d.getSequenceNumber())
                            .orderingEnabled(d.getOrderingEnabled())
                            .build();
                    kafkaTemplate.send(KafkaTopics.DELIVERIES_DLQ, d.getEndpointId().toString(), msg);
                } catch (Exception e) {
                    log.error("Failed to publish DLQ notification for escalated delivery {}: {}",
                            d.getId(), e.getMessage());
                }
            }

        } catch (Exception e) {
            log.error("Stale delivery escalation failed: {}", e.getMessage(), e);
        }
    }
}
