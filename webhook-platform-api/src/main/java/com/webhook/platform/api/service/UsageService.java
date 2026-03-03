package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.UsageDaily;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.repository.*;
import com.webhook.platform.api.dto.UsageStatsResponse;
import com.webhook.platform.api.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class UsageService {

    private final ProjectRepository projectRepository;
    private final EventRepository eventRepository;
    private final DeliveryRepository deliveryRepository;
    private final EndpointRepository endpointRepository;
    private final IncomingSourceRepository incomingSourceRepository;
    private final AlertRuleRepository alertRuleRepository;
    private final UsageDailyRepository usageDailyRepository;

    @Transactional(readOnly = true)
    public UsageStatsResponse getUsage(UUID projectId, UUID organizationId, int historyDays) {
        projectRepository.findById(projectId)
                .filter(p -> p.getOrganizationId().equals(organizationId))
                .orElseThrow(() -> new NotFoundException("Project not found"));

        historyDays = Math.min(historyDays, 90);

        // Live counts use status-grouped query (bounded by time window, uses partial indexes)
        Instant since30d = Instant.now().minus(30, ChronoUnit.DAYS);
        List<Object[]> statusCounts = deliveryRepository.countByProjectIdGroupByStatus(projectId, since30d);

        long totalDeliveries = 0, successDeliveries = 0, failedDeliveries = 0, dlqDeliveries = 0, pendingDeliveries = 0;
        for (Object[] row : statusCounts) {
            String status = (String) row[0];
            long count = ((Number) row[1]).longValue();
            totalDeliveries += count;
            switch (status) {
                case "SUCCESS" -> successDeliveries = count;
                case "FAILED" -> failedDeliveries = count;
                case "DLQ" -> dlqDeliveries = count;
                case "PENDING", "PROCESSING" -> pendingDeliveries += count;
            }
        }

        Instant since30dEvents = Instant.now().minus(30, ChronoUnit.DAYS);
        long totalEvents = eventRepository.countByProjectIdAndCreatedAtBetween(projectId, since30dEvents, Instant.now());
        long activeEndpoints = endpointRepository.countByProjectIdAndDeletedAtIsNull(projectId);
        long activeSources = incomingSourceRepository.countByProjectId(projectId);
        long activeAlertRules = alertRuleRepository.countByProjectId(projectId);

        UsageStatsResponse.LiveUsage live = UsageStatsResponse.LiveUsage.builder()
                .totalEvents(totalEvents)
                .totalDeliveries(totalDeliveries)
                .successfulDeliveries(successDeliveries)
                .failedDeliveries(failedDeliveries)
                .dlqDeliveries(dlqDeliveries)
                .pendingDeliveries(pendingDeliveries)
                .totalIncomingEvents(0)
                .totalIncomingForwards(0)
                .activeEndpoints(activeEndpoints)
                .activeIncomingSources(activeSources)
                .activeAlertRules(activeAlertRules)
                .build();

        // Historical daily snapshots
        LocalDate today = LocalDate.now();
        LocalDate from = today.minusDays(historyDays);
        List<UsageDaily> dailyRecords = usageDailyRepository
                .findByProjectIdAndDateBetweenOrderByDateDesc(projectId, from, today);

        List<UsageStatsResponse.DailyUsage> history = dailyRecords.stream()
                .map(d -> UsageStatsResponse.DailyUsage.builder()
                        .date(d.getDate().toString())
                        .eventsCount(d.getEventsCount())
                        .deliveriesCount(d.getDeliveriesCount())
                        .successfulDeliveries(d.getSuccessfulDeliveries())
                        .failedDeliveries(d.getFailedDeliveries())
                        .dlqCount(d.getDlqCount())
                        .incomingEventsCount(d.getIncomingEventsCount())
                        .incomingForwardsCount(d.getIncomingForwardsCount())
                        .avgLatencyMs(d.getAvgLatencyMs())
                        .p95LatencyMs(d.getP95LatencyMs())
                        .build())
                .toList();

        return UsageStatsResponse.builder()
                .current(live)
                .history(history)
                .build();
    }
}
