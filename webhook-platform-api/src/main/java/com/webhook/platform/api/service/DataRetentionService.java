package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.repository.DeliveryAttemptRepository;
import com.webhook.platform.api.domain.repository.IncomingEventRepository;
import com.webhook.platform.api.domain.repository.TunnelRequestLogRepository;
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

    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final IncomingEventRepository incomingEventRepository;
    private final TunnelRequestLogRepository tunnelRequestLogRepository;
    private final MeterRegistry meterRegistry;
    private final int deliveryAttemptsRetentionDays;
    private final int successfulAttemptsRetentionDays;
    private final int incomingEventsRetentionDays;
    private final int tunnelRequestLogRetentionDays;
    private final int maxAttemptsPerDelivery;
    private final int batchSize;
    private final AtomicLong totalAttemptsCount = new AtomicLong(0);
    private final AtomicLong deliveryAttemptsEstimatedRows = new AtomicLong(0);
    private final AtomicLong incomingEventsEstimatedRows = new AtomicLong(0);

    public DataRetentionService(
            DeliveryAttemptRepository deliveryAttemptRepository,
            IncomingEventRepository incomingEventRepository,
            TunnelRequestLogRepository tunnelRequestLogRepository,
            MeterRegistry meterRegistry,
            @Value("${data-retention.delivery-attempts-retention-days:90}") int deliveryAttemptsRetentionDays,
            @Value("${data-retention.successful-attempts-retention-days:14}") int successfulAttemptsRetentionDays,
            @Value("${data-retention.incoming-events-retention-days:30}") int incomingEventsRetentionDays,
            @Value("${data-retention.tunnel-request-log-retention-days:7}") int tunnelRequestLogRetentionDays,
            @Value("${data-retention.max-attempts-per-delivery:10}") int maxAttemptsPerDelivery,
            @Value("${data-retention.batch-size:1000}") int batchSize) {
        this.deliveryAttemptRepository = deliveryAttemptRepository;
        this.incomingEventRepository = incomingEventRepository;
        this.tunnelRequestLogRepository = tunnelRequestLogRepository;
        this.meterRegistry = meterRegistry;
        this.deliveryAttemptsRetentionDays = deliveryAttemptsRetentionDays;
        this.successfulAttemptsRetentionDays = successfulAttemptsRetentionDays;
        this.incomingEventsRetentionDays = incomingEventsRetentionDays;
        this.tunnelRequestLogRetentionDays = tunnelRequestLogRetentionDays;
        this.maxAttemptsPerDelivery = maxAttemptsPerDelivery;
        this.batchSize = batchSize;
        
        Gauge.builder("delivery_attempts_total", totalAttemptsCount, AtomicLong::get)
                .description("Total number of delivery attempts in storage")
                .register(meterRegistry);
        Gauge.builder("delivery_attempts_table_rows", deliveryAttemptsEstimatedRows, AtomicLong::get)
                .description("Estimated row count in delivery_attempts table")
                .register(meterRegistry);
        Gauge.builder("incoming_events_table_rows", incomingEventsEstimatedRows, AtomicLong::get)
                .description("Estimated row count in incoming_events table")
                .register(meterRegistry);
        
        log.info("Data retention configured: attempts={}d (success={}d), incoming={}d, tunnelLog={}d, maxPerDelivery={}, batchSize={}", 
                deliveryAttemptsRetentionDays, successfulAttemptsRetentionDays, incomingEventsRetentionDays, tunnelRequestLogRetentionDays, maxAttemptsPerDelivery, batchSize);
    }

    // REMOVED: Outbox cleanup is handled by OutboxPublisherService.cleanupOldMessages()
    // to avoid duplicate cleanup logic. DataRetentionService focuses on delivery_attempts,
    // incoming_events, and tunnel_request_log tables.

    @Scheduled(cron = "${data-retention.cleanup-cron:0 0 2 * * *}")
    @SchedulerLock(name = "cleanupOldSuccessfulAttempts", lockAtMostFor = "9m", lockAtLeastFor = "1m")
    @Transactional
    public void cleanupOldSuccessfulAttempts() {
        Instant cutoffTime = Instant.now().minusSeconds(successfulAttemptsRetentionDays * 86400L);
        
        log.info("Starting successful delivery attempts cleanup (2xx status) for attempts older than {}", cutoffTime);
        
        int totalDeleted = 0;
        int deletedInBatch;
        
        do {
            deletedInBatch = deliveryAttemptRepository.deleteOldSuccessfulAttempts(cutoffTime, batchSize);
            totalDeleted += deletedInBatch;
            
            if (deletedInBatch > 0) {
                log.debug("Deleted {} successful attempts in batch", deletedInBatch);
            }
        } while (deletedInBatch >= batchSize);
        
        if (totalDeleted > 0) {
            Counter.builder("delivery_attempts_cleanup_total")
                    .tag("type", "success_age_based")
                    .register(meterRegistry)
                    .increment(totalDeleted);
            log.info("Successful attempts cleanup: deleted {} attempts (older than {}d)", totalDeleted, successfulAttemptsRetentionDays);
        } else {
            log.debug("Successful attempts cleanup: no old attempts to delete");
        }
        
        updateMetrics();
    }
    
    @Scheduled(cron = "${data-retention.cleanup-cron:0 0 2 * * *}")
    @SchedulerLock(name = "cleanupOldDeliveryAttempts", lockAtMostFor = "9m", lockAtLeastFor = "1m")
    @Transactional
    public void cleanupOldDeliveryAttempts() {
        Instant cutoffTime = Instant.now().minusSeconds(deliveryAttemptsRetentionDays * 86400L);
        
        log.info("Starting ALL delivery attempts cleanup (errors + edge cases) for attempts older than {}", cutoffTime);
        
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
            log.info("Age-based cleanup: deleted {} delivery attempts (older than {}d)", totalDeleted, deliveryAttemptsRetentionDays);
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
    
    @Scheduled(cron = "${data-retention.cleanup-cron:0 0 2 * * *}")
    @SchedulerLock(name = "cleanupOldIncomingEvents", lockAtMostFor = "9m", lockAtLeastFor = "1m")
    @Transactional
    public void cleanupOldIncomingEvents() {
        Instant cutoffTime = Instant.now().minusSeconds(incomingEventsRetentionDays * 86400L);

        log.info("Starting incoming events cleanup for events older than {}", cutoffTime);

        int totalDeleted = 0;
        int deletedInBatch;

        do {
            deletedInBatch = incomingEventRepository.deleteOldIncomingEvents(cutoffTime, batchSize);
            totalDeleted += deletedInBatch;

            if (deletedInBatch > 0) {
                log.debug("Deleted {} incoming events in batch", deletedInBatch);
            }
        } while (deletedInBatch >= batchSize);

        if (totalDeleted > 0) {
            Counter.builder("incoming_events_cleanup_total")
                    .register(meterRegistry)
                    .increment(totalDeleted);
            log.info("Incoming events cleanup: deleted {} old events (older than {}d)", totalDeleted, incomingEventsRetentionDays);
        } else {
            log.debug("Incoming events cleanup: no old events to delete");
        }
    }

    @Scheduled(fixedDelayString = "${data-retention.table-metrics-interval-ms:900000}")
    public void refreshTableSizeMetrics() {
        try {
            long attemptsRows = deliveryAttemptRepository.estimatedRowCount();
            deliveryAttemptsEstimatedRows.set(attemptsRows);
            long incomingRows = incomingEventRepository.estimatedRowCount();
            incomingEventsEstimatedRows.set(incomingRows);
            log.debug("Table size metrics refreshed: delivery_attempts≈{}, incoming_events≈{}", attemptsRows, incomingRows);
        } catch (Exception e) {
            log.warn("Failed to refresh table size metrics: {}", e.getMessage());
        }
    }

    @Scheduled(cron = "${data-retention.burst-cleanup-cron:0 0 */4 * * *}")
    @SchedulerLock(name = "burstCleanupSuccessfulAttempts", lockAtMostFor = "9m", lockAtLeastFor = "1m")
    @Transactional
    public void burstCleanupSuccessfulAttempts() {
        Instant cutoffTime = Instant.now().minusSeconds(successfulAttemptsRetentionDays * 86400L);
        int totalDeleted = 0;
        int deletedInBatch;
        do {
            deletedInBatch = deliveryAttemptRepository.deleteOldSuccessfulAttempts(cutoffTime, batchSize);
            totalDeleted += deletedInBatch;
        } while (deletedInBatch >= batchSize);

        if (totalDeleted > 0) {
            Counter.builder("delivery_attempts_cleanup_total")
                    .tag("type", "burst_success")
                    .register(meterRegistry)
                    .increment(totalDeleted);
            log.info("Burst cleanup: deleted {} successful attempts (older than {}d)", totalDeleted, successfulAttemptsRetentionDays);
        }
        updateMetrics();
    }

    @Scheduled(cron = "${data-retention.tunnel-log-cleanup-cron:0 30 2 * * *}")
    @SchedulerLock(name = "cleanupTunnelRequestLog", lockAtMostFor = "9m", lockAtLeastFor = "1m")
    @Transactional
    public void cleanupTunnelRequestLog() {
        Instant cutoff = Instant.now().minusSeconds(tunnelRequestLogRetentionDays * 86400L);
        int deleted = tunnelRequestLogRepository.deleteByCreatedAtBefore(cutoff);
        if (deleted > 0) {
            Counter.builder("tunnel_request_log_cleanup_total")
                    .register(meterRegistry)
                    .increment(deleted);
            log.info("Tunnel request log cleanup: deleted {} entries older than {}d", deleted, tunnelRequestLogRetentionDays);
        }
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
