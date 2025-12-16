package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.repository.DeliveryAttemptRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@Slf4j
public class DataRetentionService {

    private final OutboxMessageRepository outboxMessageRepository;
    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final int outboxRetentionDays;
    private final int deliveryAttemptsRetentionDays;
    private final int batchSize;

    public DataRetentionService(
            OutboxMessageRepository outboxMessageRepository,
            DeliveryAttemptRepository deliveryAttemptRepository,
            @Value("${data-retention.outbox-retention-days:7}") int outboxRetentionDays,
            @Value("${data-retention.delivery-attempts-retention-days:90}") int deliveryAttemptsRetentionDays,
            @Value("${data-retention.batch-size:1000}") int batchSize) {
        this.outboxMessageRepository = outboxMessageRepository;
        this.deliveryAttemptRepository = deliveryAttemptRepository;
        this.outboxRetentionDays = outboxRetentionDays;
        this.deliveryAttemptsRetentionDays = deliveryAttemptsRetentionDays;
        this.batchSize = batchSize;
        
        log.info("Data retention configured: outbox={}d, attempts={}d, batchSize={}", 
                outboxRetentionDays, deliveryAttemptsRetentionDays, batchSize);
    }

    @Scheduled(cron = "${data-retention.cleanup-cron:0 0 2 * * *}")
    @Transactional
    public void cleanupPublishedOutboxMessages() {
        Instant cutoffTime = Instant.now().minusSeconds(outboxRetentionDays * 86400L);
        
        log.info("Starting outbox cleanup for messages older than {}", cutoffTime);
        
        int totalDeleted = 0;
        int deletedInBatch;
        
        do {
            deletedInBatch = outboxMessageRepository.deleteOldPublishedMessages(
                    "PUBLISHED", cutoffTime, batchSize);
            totalDeleted += deletedInBatch;
            
            if (deletedInBatch > 0) {
                log.debug("Deleted {} published outbox messages in batch", deletedInBatch);
            }
        } while (deletedInBatch >= batchSize);
        
        if (totalDeleted > 0) {
            log.info("Cleanup completed: deleted {} published outbox messages", totalDeleted);
        } else {
            log.debug("Outbox cleanup: no old messages to delete");
        }
    }

    @Scheduled(cron = "${data-retention.cleanup-cron:0 0 2 * * *}")
    @Transactional
    public void cleanupOldDeliveryAttempts() {
        Instant cutoffTime = Instant.now().minusSeconds(deliveryAttemptsRetentionDays * 86400L);
        
        log.info("Starting delivery attempts cleanup for attempts older than {}", cutoffTime);
        
        int totalDeleted = 0;
        int deletedInBatch;
        
        do {
            deletedInBatch = deliveryAttemptRepository.deleteOldAttempts(cutoffTime, batchSize);
            totalDeleted += deletedInBatch;
            
            if (deletedInBatch > 0) {
                log.debug("Deleted {} delivery attempts in batch", deletedInBatch);
            }
        } while (deletedInBatch >= batchSize);
        
        if (totalDeleted > 0) {
            log.info("Cleanup completed: deleted {} delivery attempts", totalDeleted);
        } else {
            log.debug("Delivery attempts cleanup: no old attempts to delete");
        }
    }
}
