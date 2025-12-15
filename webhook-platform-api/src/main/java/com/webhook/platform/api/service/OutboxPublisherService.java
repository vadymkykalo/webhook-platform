package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.common.dto.DeliveryMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Service
@Slf4j
public class OutboxPublisherService {

    private final OutboxMessageRepository outboxMessageRepository;
    private final KafkaTemplate<String, DeliveryMessage> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final int batchSize;

    public OutboxPublisherService(
            OutboxMessageRepository outboxMessageRepository,
            KafkaTemplate<String, DeliveryMessage> kafkaTemplate,
            ObjectMapper objectMapper,
            @Value("${outbox.publisher.batch-size:100}") int batchSize) {
        this.outboxMessageRepository = outboxMessageRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${outbox.publisher.poll-interval-ms:1000}")
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void publishPendingMessages() {
        List<OutboxMessage> pendingMessages = outboxMessageRepository
                .findPendingBatchForUpdate(OutboxStatus.PENDING.name(), batchSize);

        if (pendingMessages.isEmpty()) {
            return;
        }

        log.info("Publishing {} pending outbox messages", pendingMessages.size());

        for (OutboxMessage message : pendingMessages) {
            try {
                publishMessageSynchronously(message);
                markAsPublished(message);
            } catch (Exception e) {
                log.error("Failed to publish outbox message: {}", message.getId(), e);
                markAsFailed(message, e.getMessage());
            }
        }
    }

    private void publishMessageSynchronously(OutboxMessage message) throws Exception {
        DeliveryMessage deliveryMessage = objectMapper.readValue(
                message.getPayload(),
                DeliveryMessage.class
        );

        kafkaTemplate.send(message.getKafkaTopic(), message.getKafkaKey(), deliveryMessage)
                .get(10, TimeUnit.SECONDS);
        
        log.debug("Published message {} to topic {} with key {}",
                message.getId(), message.getKafkaTopic(), message.getKafkaKey());
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
