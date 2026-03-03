package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.entity.UsageDaily;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.repository.*;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class UsageDailyAggregator {

    private final ProjectRepository projectRepository;
    private final EventRepository eventRepository;
    private final DeliveryRepository deliveryRepository;
    private final UsageDailyRepository usageDailyRepository;

    @Scheduled(cron = "0 5 0 * * *")
    @SchedulerLock(name = "usage-daily-aggregator", lockAtLeastFor = "PT1M", lockAtMostFor = "PT30M")
    public void aggregateYesterday() {
        LocalDate yesterday = LocalDate.now().minusDays(1);
        log.info("Starting daily usage aggregation for {}", yesterday);

        List<Project> projects = projectRepository.findAll();
        int count = 0;

        for (Project project : projects) {
            try {
                aggregateForProject(project.getId(), yesterday);
                count++;
            } catch (Exception e) {
                log.error("Failed to aggregate usage for project {} on {}", project.getId(), yesterday, e);
            }
        }

        log.info("Daily usage aggregation complete: {} projects processed for {}", count, yesterday);
    }

    @Transactional
    public void aggregateForProject(UUID projectId, LocalDate date) {
        if (usageDailyRepository.findByProjectIdAndDate(projectId, date).isPresent()) {
            return;
        }

        Instant dayStart = date.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant dayEnd = date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();

        long eventsCount = eventRepository.countByProjectIdAndCreatedAtBetween(projectId, dayStart, dayEnd);
        long deliveriesCount = deliveryRepository.countByProjectIdAndCreatedAtBetween(projectId, dayStart, dayEnd);
        long successCount = deliveryRepository.countByProjectIdAndStatusAndCreatedAtBetween(projectId, DeliveryStatus.SUCCESS, dayStart, dayEnd);
        long failedCount = deliveryRepository.countByProjectIdAndStatusAndCreatedAtBetween(projectId, DeliveryStatus.FAILED, dayStart, dayEnd);
        long dlqCount = deliveryRepository.countByProjectIdAndStatusAndCreatedAtBetween(projectId, DeliveryStatus.DLQ, dayStart, dayEnd);

        UsageDaily usage = UsageDaily.builder()
                .projectId(projectId)
                .date(date)
                .eventsCount(eventsCount)
                .deliveriesCount(deliveriesCount)
                .successfulDeliveries(successCount)
                .failedDeliveries(failedCount)
                .dlqCount(dlqCount)
                .incomingEventsCount(0L)
                .incomingForwardsCount(0L)
                .build();

        usageDailyRepository.save(usage);
        log.debug("Aggregated usage for project {} on {}: events={}, deliveries={}", projectId, date, eventsCount, deliveriesCount);
    }
}
