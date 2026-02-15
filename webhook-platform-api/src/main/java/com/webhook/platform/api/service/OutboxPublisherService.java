package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.api.filter.CorrelationIdFilter;
import com.webhook.platform.common.dto.DeliveryMessage;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.internals.RecordHeader;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
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

    @Scheduled(fixedDelayString = "${outbox.publisher.retry-interval-ms:30000}")
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void retryFailedMessages() {
        List<OutboxMessage> failedMessages = outboxMessageRepository
                .findFailedMessagesForRetry(OutboxStatus.FAILED.name(), 5, batchSize);

        if (failedMessages.isEmpty()) {
            return;
        }

        log.info("Retrying {} failed outbox messages", failedMessages.size());

        for (OutboxMessage message : failedMessages) {
            long backoffSeconds = calculateBackoff(message.getRetryCount());
            Instant nextRetryTime = message.getCreatedAt().plusSeconds(backoffSeconds);
            
            if (Instant.now().isBefore(nextRetryTime)) {
                log.debug("Skipping message {} - backoff not expired (retry at {})", 
                        message.getId(), nextRetryTime);
                continue;
            }
            
            try {
                publishMessageSynchronously(message);
                markAsPublished(message);
                log.info("Successfully retried outbox message: {}", message.getId());
            } catch (Exception e) {
                log.error("Failed to retry outbox message {} (attempt {}): {}", 
                        message.getId(), message.getRetryCount() + 1, e.getMessage());
                incrementRetryCount(message, e.getMessage());
            }
        }
    }

    private long calculateBackoff(int retryCount) {
        return (long) Math.min(Math.pow(2, retryCount) * 10, 600);
    }

    private void incrementRetryCount(OutboxMessage message, String errorMessage) {
        message.setRetryCount(message.getRetryCount() + 1);
        message.setErrorMessage(errorMessage);
        
        if (message.getRetryCount() >= 5) {
            log.error("Outbox message {} exceeded max retries, giving up", message.getId());
        }
        
        outboxMessageRepository.save(message);
    }

    private void publishMessageSynchronously(OutboxMessage message) throws Exception {
        DeliveryMessage deliveryMessage = objectMapper.readValue(
                message.getPayload(),
                DeliveryMessage.class
        );

        String correlationId = CorrelationIdFilter.getCurrentCorrelationId();
        if (correlationId == null) {
            correlationId = UUID.randomUUID().toString();
        }

        ProducerRecord<String, DeliveryMessage> record = new ProducerRecord<>(
                message.getKafkaTopic(),
                null,
                message.getKafkaKey(),
                deliveryMessage
        );
        record.headers().add(new RecordHeader("X-Correlation-ID", correlationId.getBytes(StandardCharsets.UTF_8)));

        kafkaTemplate.send(record).get(10, TimeUnit.SECONDS);
        
        log.debug("Published message {} to topic {} with key {} correlationId={}",
                message.getId(), message.getKafkaTopic(), message.getKafkaKey(), correlationId);
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
