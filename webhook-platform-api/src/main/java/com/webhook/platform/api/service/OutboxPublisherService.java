package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.api.filter.CorrelationIdFilter;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.internals.RecordHeader;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

@Service
@Slf4j
public class OutboxPublisherService {

    private final OutboxMessageRepository outboxMessageRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final int batchSize;
    private final int maxRetries;
    private final int deadRetentionDays;
    private final Timer publishLatency;
    private final TransactionTemplate txTemplate;

    public OutboxPublisherService(
            OutboxMessageRepository outboxMessageRepository,
            KafkaTemplate<String, Object> kafkaTemplate,
            ObjectMapper objectMapper,
            MeterRegistry meterRegistry,
            PlatformTransactionManager txManager,
            @Value("${outbox.publisher.batch-size:100}") int batchSize,
            @Value("${outbox.publisher.max-retries:5}") int maxRetries,
            @Value("${outbox.publisher.dead-retention-days:90}") int deadRetentionDays) {
        this.outboxMessageRepository = outboxMessageRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.batchSize = batchSize;
        this.maxRetries = maxRetries;
        this.deadRetentionDays = deadRetentionDays;
        this.txTemplate = new TransactionTemplate(txManager);

        this.publishLatency = Timer.builder("outbox_publish_latency")
                .description("Time to publish a batch of outbox messages to Kafka")
                .register(meterRegistry);

        Gauge.builder("outbox_queue_depth", outboxMessageRepository,
                        repo -> repo.countByStatus(OutboxStatus.PENDING))
                .description("Number of outbox messages by status")
                .tag("status", "pending")
                .register(meterRegistry);

        Gauge.builder("outbox_queue_depth", outboxMessageRepository,
                        repo -> repo.countByStatus(OutboxStatus.FAILED))
                .description("Number of outbox messages by status")
                .tag("status", "failed")
                .register(meterRegistry);

        Gauge.builder("outbox_queue_depth", outboxMessageRepository,
                        repo -> repo.countByStatus(OutboxStatus.DEAD))
                .description("Number of outbox messages by status")
                .tag("status", "dead")
                .register(meterRegistry);

        Gauge.builder("outbox_oldest_pending_age_seconds", outboxMessageRepository, repo -> {
                    Instant oldest = repo.findOldestPendingCreatedAt();
                    return oldest != null ? java.time.Duration.between(oldest, Instant.now()).getSeconds() : 0;
                })
                .description("Age in seconds of the oldest PENDING outbox message")
                .register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${outbox.publisher.poll-interval-ms:1000}")
    @SchedulerLock(name = "outbox-publisher", lockAtLeastFor = "PT1S", lockAtMostFor = "PT30S")
    public void publishPendingMessages() {
        // Phase 1: fast claim — SELECT FOR UPDATE + mark SENDING, commit immediately
        List<OutboxMessage> claimed = txTemplate.execute(status -> {
            List<OutboxMessage> batch = outboxMessageRepository
                    .findPendingBatchForUpdate(OutboxStatus.PENDING.name(), batchSize, 10);
            for (OutboxMessage msg : batch) {
                msg.setStatus(OutboxStatus.SENDING);
            }
            return batch.isEmpty() ? batch : outboxMessageRepository.saveAll(batch);
        });

        if (claimed == null || claimed.isEmpty()) {
            return;
        }

        // Phase 2: publish to Kafka outside transaction — no DB locks held
        log.info("Publishing {} pending outbox messages", claimed.size());
        publishBatchAsync(claimed, false);
    }

    @Scheduled(fixedDelayString = "${outbox.publisher.retry-interval-ms:30000}")
    @SchedulerLock(name = "outbox-publisher-retry", lockAtLeastFor = "PT5S", lockAtMostFor = "PT2M")
    public void retryFailedMessages() {
        // Phase 1: claim inside short transaction — SELECT FOR UPDATE + mark SENDING, commit immediately
        List<OutboxMessage> messagesToRetry = txTemplate.execute(status -> {
            List<OutboxMessage> failedMessages = outboxMessageRepository
                    .findFailedMessagesForRetry(OutboxStatus.FAILED.name(), maxRetries, batchSize, 10);

            if (failedMessages.isEmpty()) {
                return List.<OutboxMessage>of();
            }

            List<OutboxMessage> eligible = new ArrayList<>();
            for (OutboxMessage message : failedMessages) {
                long backoffSeconds = calculateBackoff(message.getRetryCount());
                Instant baseTime = message.getLastAttemptAt() != null ? message.getLastAttemptAt() : message.getCreatedAt();
                Instant nextRetryTime = baseTime.plusSeconds(backoffSeconds);

                if (Instant.now().isBefore(nextRetryTime)) {
                    log.debug("Skipping message {} - backoff not expired (retry at {})",
                            message.getId(), nextRetryTime);
                    continue;
                }
                message.setStatus(OutboxStatus.SENDING);
                eligible.add(message);
            }
            return eligible.isEmpty() ? eligible : outboxMessageRepository.saveAll(eligible);
        });

        if (messagesToRetry == null || messagesToRetry.isEmpty()) {
            return;
        }

        // Phase 2: publish to Kafka outside transaction — no DB locks held
        log.info("Retrying {} failed outbox messages", messagesToRetry.size());
        publishBatchAsync(messagesToRetry, true);
    }

    @Scheduled(fixedDelayString = "${outbox.publisher.cleanup-interval-ms:3600000}")
    @SchedulerLock(name = "outbox-cleanup", lockAtLeastFor = "PT30S", lockAtMostFor = "PT10M")
    @Transactional
    public void cleanupOldMessages() {
        // Recover stuck SENDING messages (claimed but app crashed before publish)
        Instant sendingCutoff = Instant.now().minusSeconds(120);
        int recovered = outboxMessageRepository.recoverStuckSendingMessages(sendingCutoff);
        if (recovered > 0) {
            log.warn("Recovered {} stuck SENDING outbox messages back to PENDING", recovered);
        }

        Instant publishedCutoff = Instant.now().minus(Duration.ofDays(3));
        int deletedPublished = outboxMessageRepository.deleteOldPublishedMessages(
                OutboxStatus.PUBLISHED.name(), publishedCutoff, 5000);

        Instant deadCutoff = Instant.now().minus(Duration.ofDays(deadRetentionDays));
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
        
        if (message.getRetryCount() >= maxRetries) {
            message.setStatus(OutboxStatus.DEAD);
            log.error("Outbox message {} exceeded max retries, moved to DEAD. Topic: {}, Key: {}, Error: {}",
                    message.getId(), message.getKafkaTopic(), message.getKafkaKey(), errorMessage);
        }
        
        outboxMessageRepository.save(message);
    }

    private void publishBatchAsync(List<OutboxMessage> messages, boolean isRetry) {
        Timer.Sample sample = Timer.start();
        List<CompletableFuture<Void>> completionFutures = new ArrayList<>();

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

                // Use handle() callback to mark status based on the ACTUAL Kafka outcome.
                // This prevents the previous bug where get(0ms) after a batch timeout
                // would mark in-flight (but eventually successful) sends as FAILED,
                // causing duplicate dispatch on retry.
                CompletableFuture<Void> done = kafkaTemplate.send(record)
                        .<Void>handle((result, ex) -> {
                            try {
                                if (ex != null) {
                                    log.error("Failed to publish outbox message {}: {}",
                                            message.getId(), ex.getMessage());
                                    if (isRetry) {
                                        incrementRetryCount(message, ex.getMessage());
                                    } else {
                                        markAsFailed(message, ex.getMessage());
                                    }
                                } else {
                                    markAsPublished(message);
                                    if (isRetry) {
                                        log.info("Successfully retried outbox message: {}",
                                                message.getId());
                                    }
                                }
                            } catch (Exception dbEx) {
                                log.error("Failed to update outbox status for message {}: {}",
                                        message.getId(), dbEx.getMessage());
                            }
                            return null;
                        });
                completionFutures.add(done);
            } catch (Exception e) {
                log.error("Failed to prepare outbox message {}: {}", message.getId(), e.getMessage());
                if (isRetry) {
                    incrementRetryCount(message, e.getMessage());
                } else {
                    markAsFailed(message, e.getMessage());
                }
            }
        }

        if (completionFutures.isEmpty()) return;

        // Wait for all send callbacks to complete (bounded).
        // Messages still in-flight after timeout stay SENDING —
        // cleanupOldMessages() recovers them back to PENDING after 120s.
        try {
            CompletableFuture.allOf(completionFutures.toArray(new CompletableFuture[0]))
                    .get(30, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("Batch Kafka send did not fully complete within 30s: {} — " +
                    "in-flight messages remain SENDING and will be recovered by cleanup",
                    e.getMessage());
        }

        sample.stop(publishLatency);
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
