package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.api.filter.CorrelationIdFilter;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.internals.RecordHeader;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.springframework.kafka.support.SendResult;

@Service
@Slf4j
public class OutboxPublisherService {

    private final OutboxMessageRepository outboxMessageRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final int batchSize;

    public OutboxPublisherService(
            OutboxMessageRepository outboxMessageRepository,
            KafkaTemplate<String, Object> kafkaTemplate,
            ObjectMapper objectMapper,
            @Value("${outbox.publisher.batch-size:100}") int batchSize) {
        this.outboxMessageRepository = outboxMessageRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${outbox.publisher.poll-interval-ms:1000}")
    @SchedulerLock(name = "outbox-publisher", lockAtLeastFor = "PT1S", lockAtMostFor = "PT30S")
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void publishPendingMessages() {
        List<OutboxMessage> pendingMessages = outboxMessageRepository
                .findPendingBatchForUpdate(OutboxStatus.PENDING.name(), batchSize);

        if (pendingMessages.isEmpty()) {
            return;
        }

        log.info("Publishing {} pending outbox messages", pendingMessages.size());
        publishBatchAsync(pendingMessages, false);
    }

    @Scheduled(fixedDelayString = "${outbox.publisher.retry-interval-ms:30000}")
    @SchedulerLock(name = "outbox-publisher-retry", lockAtLeastFor = "PT5S", lockAtMostFor = "PT2M")
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void retryFailedMessages() {
        List<OutboxMessage> failedMessages = outboxMessageRepository
                .findFailedMessagesForRetry(OutboxStatus.FAILED.name(), 5, batchSize);

        if (failedMessages.isEmpty()) {
            return;
        }

        log.info("Retrying {} failed outbox messages", failedMessages.size());

        List<OutboxMessage> messagesToRetry = new ArrayList<>();
        for (OutboxMessage message : failedMessages) {
            long backoffSeconds = calculateBackoff(message.getRetryCount());
            Instant baseTime = message.getLastAttemptAt() != null ? message.getLastAttemptAt() : message.getCreatedAt();
            Instant nextRetryTime = baseTime.plusSeconds(backoffSeconds);
            
            if (Instant.now().isBefore(nextRetryTime)) {
                log.debug("Skipping message {} - backoff not expired (retry at {})", 
                        message.getId(), nextRetryTime);
                continue;
            }
            messagesToRetry.add(message);
        }

        if (!messagesToRetry.isEmpty()) {
            publishBatchAsync(messagesToRetry, true);
        }
    }

    @Scheduled(fixedDelayString = "${outbox.publisher.cleanup-interval-ms:3600000}")
    @SchedulerLock(name = "outbox-cleanup", lockAtLeastFor = "PT30S", lockAtMostFor = "PT10M")
    @Transactional
    public void cleanupOldMessages() {
        Instant publishedCutoff = Instant.now().minus(java.time.Duration.ofDays(3));
        int deletedPublished = outboxMessageRepository.deleteOldPublishedMessages(
                OutboxStatus.PUBLISHED.name(), publishedCutoff, 5000);

        Instant deadCutoff = Instant.now().minus(java.time.Duration.ofDays(7));
        int deletedDead = outboxMessageRepository.deleteOldPublishedMessages(
                OutboxStatus.DEAD.name(), deadCutoff, 1000);

        if (deletedPublished > 0 || deletedDead > 0) {
            log.info("Outbox cleanup: deleted {} published, {} dead messages", deletedPublished, deletedDead);
        }

        long deadCount = outboxMessageRepository.countByStatus(OutboxStatus.DEAD);
        if (deadCount > 0) {
            log.warn("Outbox has {} DEAD messages (exceeded max retries) awaiting purge", deadCount);
        }
    }

    private long calculateBackoff(int retryCount) {
        long base = (long) Math.min(Math.pow(2, retryCount) * 10, 600);
        long jitter = java.util.concurrent.ThreadLocalRandom.current().nextLong(0, base / 4 + 1);
        return base + jitter;
    }

    private void incrementRetryCount(OutboxMessage message, String errorMessage) {
        message.setRetryCount(message.getRetryCount() + 1);
        message.setErrorMessage(errorMessage);
        message.setLastAttemptAt(Instant.now());
        
        if (message.getRetryCount() >= 5) {
            message.setStatus(OutboxStatus.DEAD);
            log.error("Outbox message {} exceeded max retries, moved to DEAD. Topic: {}, Key: {}, Error: {}",
                    message.getId(), message.getKafkaTopic(), message.getKafkaKey(), errorMessage);
        }
        
        outboxMessageRepository.save(message);
    }

    private void publishBatchAsync(List<OutboxMessage> messages, boolean isRetry) {
        Map<UUID, CompletableFuture<SendResult<String, Object>>> futures = new LinkedHashMap<>();
        Map<UUID, OutboxMessage> messageMap = new LinkedHashMap<>();

        for (OutboxMessage message : messages) {
            try {
                Object payload = deserializePayload(message);

                String correlationId = CorrelationIdFilter.getCurrentCorrelationId();
                if (correlationId == null) {
                    correlationId = UUID.randomUUID().toString();
                }

                ProducerRecord<String, Object> record = new ProducerRecord<>(
                        message.getKafkaTopic(),
                        null,
                        message.getKafkaKey(),
                        payload
                );
                record.headers().add(new RecordHeader("X-Correlation-ID", correlationId.getBytes(StandardCharsets.UTF_8)));

                futures.put(message.getId(), kafkaTemplate.send(record));
                messageMap.put(message.getId(), message);
            } catch (Exception e) {
                log.error("Failed to prepare outbox message {}: {}", message.getId(), e.getMessage());
                if (isRetry) {
                    incrementRetryCount(message, e.getMessage());
                } else {
                    markAsFailed(message, e.getMessage());
                }
            }
        }

        if (futures.isEmpty()) return;

        // Wait for all sends to complete
        try {
            CompletableFuture.allOf(futures.values().toArray(new CompletableFuture[0]))
                    .get(30, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("Batch Kafka send did not fully complete within timeout: {}", e.getMessage());
        }

        // Check each future individually
        for (var entry : futures.entrySet()) {
            OutboxMessage message = messageMap.get(entry.getKey());
            CompletableFuture<SendResult<String, Object>> future = entry.getValue();

            try {
                future.get(0, TimeUnit.MILLISECONDS);
                markAsPublished(message);
                if (isRetry) {
                    log.info("Successfully retried outbox message: {}", message.getId());
                }
            } catch (Exception e) {
                log.error("Failed to publish outbox message {}: {}", message.getId(), e.getMessage());
                if (isRetry) {
                    incrementRetryCount(message, e.getMessage());
                } else {
                    markAsFailed(message, e.getMessage());
                }
            }
        }
    }

    private void markAsPublished(OutboxMessage message) {
        message.setStatus(OutboxStatus.PUBLISHED);
        message.setPublishedAt(Instant.now());
        outboxMessageRepository.save(message);
        log.debug("Marked outbox message {} as published", message.getId());
    }

    private Object deserializePayload(OutboxMessage message) throws Exception {
        String aggregateType = message.getAggregateType();
        if ("IncomingForward".equals(aggregateType)) {
            return objectMapper.readValue(message.getPayload(), IncomingForwardMessage.class);
        }
        return objectMapper.readValue(message.getPayload(), DeliveryMessage.class);
    }

    private void markAsFailed(OutboxMessage message, String errorMessage) {
        message.setStatus(OutboxStatus.FAILED);
        message.setRetryCount(message.getRetryCount() + 1);
        message.setErrorMessage(errorMessage);
        message.setLastAttemptAt(Instant.now());
        outboxMessageRepository.save(message);
        log.warn("Marked outbox message {} as failed: {}", message.getId(), errorMessage);
    }
}
