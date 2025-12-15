package com.webhook.platform.worker.service;

import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.worker.domain.entity.Delivery;
import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import lombok.extern.slf4j.Slf4j;
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

    public RetrySchedulerService(
            DeliveryRepository deliveryRepository,
            KafkaTemplate<String, DeliveryMessage> kafkaTemplate) {
        this.deliveryRepository = deliveryRepository;
        this.kafkaTemplate = kafkaTemplate;
    }

    @Scheduled(fixedDelayString = "${retry.scheduler.poll-interval-ms:10000}")
    @Transactional
    public void scheduleRetries() {
        List<Delivery> pendingRetries = deliveryRepository.findAll().stream()
                .filter(d -> d.getStatus() == Delivery.DeliveryStatus.PENDING)
                .filter(d -> d.getNextRetryAt() != null)
                .filter(d -> d.getNextRetryAt().isBefore(Instant.now()))
                .toList();

        if (pendingRetries.isEmpty()) {
            return;
        }

        log.info("Found {} deliveries ready for retry", pendingRetries.size());

        for (Delivery delivery : pendingRetries) {
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
