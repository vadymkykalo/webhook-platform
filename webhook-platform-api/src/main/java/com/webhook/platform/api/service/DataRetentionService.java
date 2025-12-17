package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.repository.DeliveryAttemptRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

@Service
@Slf4j
public class DataRetentionService {

    private final OutboxMessageRepository outboxMessageRepository;
    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final MeterRegistry meterRegistry;
    private final int outboxRetentionDays;
    private final int deliveryAttemptsRetentionDays;
    private final int maxAttemptsPerDelivery;
    private final int batchSize;
    private final AtomicLong totalAttemptsCount = new AtomicLong(0);

    public DataRetentionService(
            OutboxMessageRepository outboxMessageRepository,
            DeliveryAttemptRepository deliveryAttemptRepository,
            MeterRegistry meterRegistry,
            @Value("${data-retention.outbox-retention-days:7}") int outboxRetentionDays,
            @Value("${data-retention.delivery-attempts-retention-days:90}") int deliveryAttemptsRetentionDays,
            @Value("${data-retention.max-attempts-per-delivery:10}") int maxAttemptsPerDelivery,
            @Value("${data-retention.batch-size:1000}") int batchSize) {
        this.outboxMessageRepository = outboxMessageRepository;
        this.deliveryAttemptRepository = deliveryAttemptRepository;
        this.meterRegistry = meterRegistry;
        this.outboxRetentionDays = outboxRetentionDays;
        this.deliveryAttemptsRetentionDays = deliveryAttemptsRetentionDays;
        this.maxAttemptsPerDelivery = maxAttemptsPerDelivery;
        this.batchSize = batchSize;
        
        Gauge.builder("delivery_attempts_total", totalAttemptsCount, AtomicLong::get)
                .description("Total number of delivery attempts in storage")
                .register(meterRegistry);
        
        log.info("Data retention configured: outbox={}d, attempts={}d, maxPerDelivery={}, batchSize={}", 
                outboxRetentionDays, deliveryAttemptsRetentionDays, maxAttemptsPerDelivery, batchSize);
    }

    @Scheduled(cron = "${data-retention.cleanup-cron:0 0 2 * * *}")
    @SchedulerLock(name = "cleanupPublishedOutboxMessages", lockAtMostFor = "9m", lockAtLeastFor = "1m")
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
    @SchedulerLock(name = "cleanupOldDeliveryAttempts", lockAtMostFor = "9m", lockAtLeastFor = "1m")
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
            Counter.builder("delivery_attempts_cleanup_total")
                    .tag("type", "age_based")
                    .register(meterRegistry)
                    .increment(totalDeleted);
            log.info("Age-based cleanup: deleted {} delivery attempts", totalDeleted);
        } else {
            log.debug("Delivery attempts cleanup: no old attempts to delete");
        }
        
        updateMetrics();
    }
    
    @Scheduled(cron = "${data-retention.limit-enforcement-cron:0 */30 * * * *}")
    @SchedulerLock(name = "enforcePerDeliveryAttemptLimits", lockAtMostFor = "29m", lockAtLeastFor = "1m")
    @Transactional
    public void enforcePerDeliveryAttemptLimits() {
        log.info("Starting per-delivery attempt limit enforcement (max {} per delivery)", maxAttemptsPerDelivery);
        
        int totalDeleted = 0;
        int deletedInBatch;
        
        do {
            deletedInBatch = deliveryAttemptRepository.deleteExcessAttemptsPerDelivery(maxAttemptsPerDelivery, batchSize);
            totalDeleted += deletedInBatch;
            
            if (deletedInBatch > 0) {
                log.debug("Deleted {} excess attempts in batch", deletedInBatch);
            }
        } while (deletedInBatch >= batchSize);
        
        if (totalDeleted > 0) {
            Counter.builder("delivery_attempts_cleanup_total")
                    .tag("type", "limit_based")
                    .register(meterRegistry)
                    .increment(totalDeleted);
            log.info("Limit-based cleanup: deleted {} excess attempts (keeping last {} per delivery)", 
                    totalDeleted, maxAttemptsPerDelivery);
        } else {
            log.debug("Per-delivery limit enforcement: no excess attempts to delete");
        }
        
        updateMetrics();
    }
    
    private void updateMetrics() {
        try {
            long count = deliveryAttemptRepository.countAllAttempts();
            totalAttemptsCount.set(count);
        } catch (Exception e) {
            log.warn("Failed to update delivery attempts metrics: {}", e.getMessage());
        }
    }
}
