package com.webhook.platform.worker.service;

import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.worker.domain.entity.Delivery;
import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.producer.RecordMetadata;
import org.springframework.kafka.support.SendResult;

@Service
@Slf4j
public class RetrySchedulerService {

    private final DeliveryRepository deliveryRepository;
    private final KafkaTemplate<String, DeliveryMessage> kafkaTemplate;
    private final TransactionTemplate transactionTemplate;
    private final int batchSize;
    private final long sendTimeoutSeconds;
    private final long rescheduleDelaySeconds;

    public RetrySchedulerService(
            DeliveryRepository deliveryRepository,
            KafkaTemplate<String, DeliveryMessage> kafkaTemplate,
            TransactionTemplate transactionTemplate,
            @Value("${retry.scheduler.batch-size:100}") int batchSize,
            @Value("${retry.scheduler.send-timeout-seconds:30}") long sendTimeoutSeconds,
            @Value("${retry.scheduler.reschedule-delay-seconds:60}") long rescheduleDelaySeconds) {
        this.deliveryRepository = deliveryRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.transactionTemplate = transactionTemplate;
        this.batchSize = batchSize;
        this.sendTimeoutSeconds = sendTimeoutSeconds;
        this.rescheduleDelaySeconds = rescheduleDelaySeconds;
    }

    @Scheduled(fixedDelayString = "${retry.scheduler.poll-interval-ms:10000}")
    public void scheduleRetries() {
        // ── Phase 1: Short transaction — claim candidates ──
        List<Delivery> claimed = transactionTemplate.execute(tx -> {
            Instant now = Instant.now();

            List<UUID> candidateIds = deliveryRepository.findPendingRetryIds(
                    Delivery.DeliveryStatus.PENDING, now, batchSize, 10);
            if (candidateIds.isEmpty()) {
                return List.<Delivery>of();
            }

            // FOR UPDATE SKIP LOCKED — only lock rows not already held
            List<Delivery> locked = deliveryRepository.lockByIds(candidateIds);
            if (locked.isEmpty()) {
                return List.<Delivery>of();
            }

            // Nullify nextRetryAt to prevent re-pick by another scheduler instance
            for (Delivery d : locked) {
                d.setNextRetryAt(null);
                d.setUpdatedAt(Instant.now());
            }
            deliveryRepository.saveAll(locked);

            return locked;
        });

        if (claimed == null || claimed.isEmpty()) {
            return;
        }

        log.info("Claimed {} deliveries for retry dispatch", claimed.size());

        // ── Phase 2: Outside transaction — Kafka I/O ──
        Map<UUID, CompletableFuture<SendResult<String, DeliveryMessage>>> futures = new HashMap<>();
        Map<UUID, String> deliveryTopics = new HashMap<>();

        for (Delivery delivery : claimed) {
            try {
                String topic = getRetryTopic(delivery.getAttemptCount());
                deliveryTopics.put(delivery.getId(), topic);

                DeliveryMessage message = DeliveryMessage.builder()
                        .deliveryId(delivery.getId())
                        .eventId(delivery.getEventId())
                        .endpointId(delivery.getEndpointId())
                        .subscriptionId(delivery.getSubscriptionId())
                        .status(delivery.getStatus().name())
                        .attemptCount(delivery.getAttemptCount())
                        .build();

                CompletableFuture<SendResult<String, DeliveryMessage>> future = kafkaTemplate.send(topic,
                        delivery.getEndpointId().toString(), message);
                futures.put(delivery.getId(), future);
            } catch (Exception e) {
                log.error("Failed to initiate send for delivery {}: {}", delivery.getId(), e.getMessage(), e);
            }
        }

        if (futures.isEmpty()) {
            // All sends failed to initiate, reschedule everything
            rescheduleAll(claimed, "Send not initiated");
            return;
        }

        // Wait for all futures with timeout (batch confirmation)
        try {
            CompletableFuture.allOf(futures.values().toArray(new CompletableFuture[0]))
                    .get(sendTimeoutSeconds, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("Batch send timeout or error, will check individual results: {}", e.getMessage());
        }

        // ── Phase 3: Short transaction — update results ──
        List<Delivery> successfulDeliveries = new ArrayList<>();
        List<Delivery> failedDeliveries = new ArrayList<>();

        for (Delivery delivery : claimed) {
            CompletableFuture<SendResult<String, DeliveryMessage>> future = futures.get(delivery.getId());
            if (future == null) {
                rescheduleDelivery(delivery, "Send not initiated");
                failedDeliveries.add(delivery);
                continue;
            }

            try {
                if (!future.isDone()) {
                    rescheduleDelivery(delivery, "Send confirmation timeout");
                    failedDeliveries.add(delivery);
                    continue;
                }
                SendResult<String, DeliveryMessage> result = future.get();
                RecordMetadata metadata = result.getRecordMetadata();
                // nextRetryAt already null from Phase 1
                successfulDeliveries.add(delivery);

                log.info("Scheduled retry for delivery {} to topic {} partition {} offset {}",
                        delivery.getId(),
                        deliveryTopics.get(delivery.getId()),
                        metadata.partition(),
                        metadata.offset());
            } catch (Exception e) {
                rescheduleDelivery(delivery, e.getMessage());
                failedDeliveries.add(delivery);

                log.error("Kafka send failed for delivery {} eventId={} endpointId={}: {}",
                        delivery.getId(),
                        delivery.getEventId(),
                        delivery.getEndpointId(),
                        e.getMessage(), e);
            }
        }

        // Batch save in a short transaction
        transactionTemplate.executeWithoutResult(tx -> {
            if (!successfulDeliveries.isEmpty()) {
                deliveryRepository.saveAll(successfulDeliveries);
            }
            if (!failedDeliveries.isEmpty()) {
                deliveryRepository.saveAll(failedDeliveries);
            }
        });

        log.info("Retry scheduling complete: {} successful, {} failed/rescheduled",
                successfulDeliveries.size(), failedDeliveries.size());
    }

    private void rescheduleAll(List<Delivery> deliveries, String reason) {
        for (Delivery d : deliveries) {
            rescheduleDelivery(d, reason);
        }
        transactionTemplate.executeWithoutResult(tx -> deliveryRepository.saveAll(deliveries));
    }

    private void rescheduleDelivery(Delivery delivery, String reason) {
        Instant rescheduleTime = Instant.now().plusSeconds(rescheduleDelaySeconds);
        delivery.setNextRetryAt(rescheduleTime);
        delivery.setUpdatedAt(Instant.now());

        log.warn("Rescheduling delivery {} to {} due to: {}",
                delivery.getId(), rescheduleTime, reason);
    }

    private String getRetryTopic(int attemptCount) {
        return switch (attemptCount) {
            case 1 -> KafkaTopics.DELIVERIES_RETRY_1M;
            case 2 -> KafkaTopics.DELIVERIES_RETRY_5M;
            case 3 -> KafkaTopics.DELIVERIES_RETRY_15M;
            case 4 -> KafkaTopics.DELIVERIES_RETRY_1H;
            case 5 -> KafkaTopics.DELIVERIES_RETRY_6H;
            default -> KafkaTopics.DELIVERIES_RETRY_24H;
        };
    }
}
