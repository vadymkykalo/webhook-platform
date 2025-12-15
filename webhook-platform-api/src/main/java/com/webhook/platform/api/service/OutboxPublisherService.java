package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.common.dto.DeliveryMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
@Slf4j
public class OutboxPublisherService {

    private final OutboxMessageRepository outboxMessageRepository;
    private final KafkaTemplate<String, DeliveryMessage> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public OutboxPublisherService(
            OutboxMessageRepository outboxMessageRepository,
            KafkaTemplate<String, DeliveryMessage> kafkaTemplate,
            ObjectMapper objectMapper) {
        this.outboxMessageRepository = outboxMessageRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
    }

    @Scheduled(fixedDelayString = "${outbox.publisher.poll-interval-ms:1000}")
    @Transactional
    public void publishPendingMessages() {
        List<OutboxMessage> pendingMessages = outboxMessageRepository
                .findByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING);

        if (pendingMessages.isEmpty()) {
            return;
        }

        log.info("Publishing {} pending outbox messages", pendingMessages.size());

        for (OutboxMessage message : pendingMessages) {
            try {
                publishMessage(message);
                markAsPublished(message);
            } catch (Exception e) {
                log.error("Failed to publish outbox message: {}", message.getId(), e);
                markAsFailed(message, e.getMessage());
            }
        }
    }

    private void publishMessage(OutboxMessage message) {
        try {
            DeliveryMessage deliveryMessage = objectMapper.readValue(
                    message.getPayload(),
                    DeliveryMessage.class
            );

            kafkaTemplate.send(message.getKafkaTopic(), message.getKafkaKey(), deliveryMessage)
                    .whenComplete((result, ex) -> {
                        if (ex != null) {
                            log.error("Kafka send failed for message {}: {}", message.getId(), ex.getMessage());
                        } else {
                            log.debug("Published message {} to topic {} with key {}",
                                    message.getId(), message.getKafkaTopic(), message.getKafkaKey());
                        }
                    });
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse delivery message", e);
        }
    }

    private void markAsPublished(OutboxMessage message) {
        message.setStatus(OutboxStatus.PUBLISHED);
        message.setPublishedAt(Instant.now());
        outboxMessageRepository.save(message);
        log.debug("Marked outbox message {} as published", message.getId());
    }

    private void markAsFailed(OutboxMessage message, String errorMessage) {
        message.setStatus(OutboxStatus.FAILED);
        message.setRetryCount(message.getRetryCount() + 1);
        message.setErrorMessage(errorMessage);
        outboxMessageRepository.save(message);
        log.warn("Marked outbox message {} as failed: {}", message.getId(), errorMessage);
    }
}
