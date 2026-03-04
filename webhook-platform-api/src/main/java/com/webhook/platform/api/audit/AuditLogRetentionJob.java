package com.webhook.platform.api.audit;

import com.webhook.platform.api.domain.repository.AuditLogRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Slf4j
@Component
public class AuditLogRetentionJob {

    private final AuditLogRepository auditLogRepository;
    private final int retentionDays;

    public AuditLogRetentionJob(
            AuditLogRepository auditLogRepository,
            @Value("${audit.retention-days:90}") int retentionDays) {
        this.auditLogRepository = auditLogRepository;
        this.retentionDays = retentionDays;
    }

    @Scheduled(cron = "${audit.retention-cron:0 0 3 * * *}")
    @Transactional
    public void purgeOldAuditLogs() {
        Instant cutoff = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
        int deleted = auditLogRepository.deleteByCreatedAtBefore(cutoff);
        if (deleted > 0) {
            log.info("Audit log retention: deleted {} entries older than {} days", deleted, retentionDays);
        }
    }
}
