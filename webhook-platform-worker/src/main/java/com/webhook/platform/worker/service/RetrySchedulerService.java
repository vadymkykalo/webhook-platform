package com.webhook.platform.worker.service;

import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.worker.domain.entity.Delivery;
import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
@Slf4j
public class RetrySchedulerService {

    private final DeliveryRepository deliveryRepository;
    private final KafkaTemplate<String, DeliveryMessage> kafkaTemplate;
    private final int batchSize;

    public RetrySchedulerService(
            DeliveryRepository deliveryRepository,
            KafkaTemplate<String, DeliveryMessage> kafkaTemplate,
            @Value("${retry.scheduler.batch-size:100}") int batchSize) {
        this.deliveryRepository = deliveryRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${retry.scheduler.poll-interval-ms:10000}")
    @Transactional
    public void scheduleRetries() {
        Instant now = Instant.now();
        
        // Use efficient DB query with pagination and row-level locking
        List<Delivery> pendingRetries = deliveryRepository.findPendingRetriesForUpdate(
                Delivery.DeliveryStatus.PENDING,
                now,
                PageRequest.of(0, batchSize)
        );

        if (pendingRetries.isEmpty()) {
            return;
        }

        log.info("Found {} deliveries ready for retry (batch size: {})", pendingRetries.size(), batchSize);

        for (Delivery delivery : pendingRetries) {
            try {
                String topic = getRetryTopic(delivery.getAttemptCount());
                
                DeliveryMessage message = DeliveryMessage.builder()
                        .deliveryId(delivery.getId())
                        .eventId(delivery.getEventId())
                        .endpointId(delivery.getEndpointId())
                        .subscriptionId(delivery.getSubscriptionId())
                        .status(delivery.getStatus().name())
                        .attemptCount(delivery.getAttemptCount())
                        .build();

                kafkaTemplate.send(topic, delivery.getEndpointId().toString(), message);
                
                delivery.setNextRetryAt(null);
                deliveryRepository.save(delivery);
                
                log.info("Scheduled retry for delivery {} to topic {}", delivery.getId(), topic);
            } catch (Exception e) {
                log.error("Failed to schedule retry for delivery {}: {}", delivery.getId(), e.getMessage(), e);
            }
        }
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
