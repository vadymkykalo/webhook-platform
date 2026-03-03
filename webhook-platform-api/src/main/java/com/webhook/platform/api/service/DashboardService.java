package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Endpoint;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.repository.*;
import com.webhook.platform.api.dto.DashboardStatsResponse;
import com.webhook.platform.api.dto.OnboardingStatusResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class DashboardService {
    
    private final ProjectRepository projectRepository;
    private final EventRepository eventRepository;
    private final DeliveryRepository deliveryRepository;
    private final EndpointRepository endpointRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final ApiKeyRepository apiKeyRepository;
    private final IncomingSourceRepository incomingSourceRepository;
    private final IncomingDestinationRepository incomingDestinationRepository;
    
    public DashboardService(
            ProjectRepository projectRepository,
            EventRepository eventRepository,
            DeliveryRepository deliveryRepository,
            EndpointRepository endpointRepository,
            SubscriptionRepository subscriptionRepository,
            ApiKeyRepository apiKeyRepository,
            IncomingSourceRepository incomingSourceRepository,
            IncomingDestinationRepository incomingDestinationRepository) {
        this.projectRepository = projectRepository;
        this.eventRepository = eventRepository;
        this.deliveryRepository = deliveryRepository;
        this.endpointRepository = endpointRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.apiKeyRepository = apiKeyRepository;
        this.incomingSourceRepository = incomingSourceRepository;
        this.incomingDestinationRepository = incomingDestinationRepository;
    }
    
    public OnboardingStatusResponse getOnboardingStatus(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
        return OnboardingStatusResponse.builder()
                .hasEndpoints(endpointRepository.existsByProjectIdAndDeletedAtIsNull(projectId))
                .hasSubscriptions(subscriptionRepository.existsByProjectId(projectId))
                .hasApiKeys(apiKeyRepository.existsByProjectIdAndRevokedAtIsNull(projectId))
                .hasEvents(eventRepository.existsByProjectId(projectId))
                .hasDeliveries(deliveryRepository.existsByProjectId(projectId))
                .hasIncomingSources(incomingSourceRepository.existsByProjectId(projectId))
                .hasIncomingDestinations(incomingDestinationRepository.existsByProjectId(projectId))
                .build();
    }

    public DashboardStatsResponse getProjectStats(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
        
        Instant since = Instant.now().minus(30, ChronoUnit.DAYS);
        
        // Calculate delivery stats using DB-level counts (last 30 days)
        DashboardStatsResponse.DeliveryStats deliveryStats = calculateDeliveryStats(projectId, since);
        
        // Get recent events (last 10) with delivery counts
        List<DashboardStatsResponse.RecentEventSummary> recentEvents = getRecentEvents(projectId);
        
        // Get endpoint health (last 30 days)
        List<DashboardStatsResponse.EndpointHealthSummary> endpointHealth = getEndpointHealth(projectId, since);
        
        return new DashboardStatsResponse(deliveryStats, recentEvents, endpointHealth);
    }
    
    private DashboardStatsResponse.DeliveryStats calculateDeliveryStats(UUID projectId, Instant since) {
        List<Object[]> statusCounts = deliveryRepository.countByProjectIdGroupByStatus(projectId, since);
        
        long total = 0, successful = 0, failed = 0, dlq = 0, pending = 0;
        for (Object[] row : statusCounts) {
            String status = (String) row[0];
            long count = ((Number) row[1]).longValue();
            total += count;
            switch (status) {
                case "SUCCESS": successful = count; break;
                case "FAILED": failed = count; break;
                case "DLQ": dlq = count; break;
                case "PENDING": case "PROCESSING": pending += count; break;
            }
        }
        
        double successRate = total > 0 ? (successful * 100.0 / total) : 0.0;
        
        return new DashboardStatsResponse.DeliveryStats(
                total,
                successful,
                failed,
                pending,
                dlq,
                Math.round(successRate * 100.0) / 100.0
        );
    }
    
    private List<DashboardStatsResponse.RecentEventSummary> getRecentEvents(UUID projectId) {
        List<Object[]> rows = eventRepository.findRecentEventsWithDeliveryCount(projectId);
        
        return rows.stream()
                .map(row -> new DashboardStatsResponse.RecentEventSummary(
                        row[0].toString(),
                        (String) row[1],
                        row[2].toString(),
                        ((Number) row[3]).intValue()
                ))
                .collect(Collectors.toList());
    }
    
    private List<DashboardStatsResponse.EndpointHealthSummary> getEndpointHealth(UUID projectId, Instant since) {
        List<Endpoint> endpoints = endpointRepository.findByProjectIdAndDeletedAtIsNull(projectId,
                org.springframework.data.domain.PageRequest.of(0, 100)).getContent();
        
        if (endpoints.isEmpty()) {
            return new ArrayList<>();
        }
        
        List<UUID> endpointIds = endpoints.stream().map(Endpoint::getId).collect(Collectors.toList());
        List<Object[]> stats = deliveryRepository.countByEndpointIdsGroupByEndpointAndStatus(endpointIds, since);
        
        // Build lookup: endpointId -> {status -> count}
        Map<UUID, Map<String, Long>> statsMap = new HashMap<>();
        for (Object[] row : stats) {
            UUID eid = (UUID) row[0];
            String status = (String) row[1];
            long count = ((Number) row[2]).longValue();
            statsMap.computeIfAbsent(eid, k -> new HashMap<>()).put(status, count);
        }
        
        return endpoints.stream()
                .map(endpoint -> {
                    Map<String, Long> counts = statsMap.getOrDefault(endpoint.getId(), Map.of());
                    long successful = counts.getOrDefault("SUCCESS", 0L);
                    long total = counts.values().stream().mapToLong(Long::longValue).sum();
                    double successRate = total > 0 ? (successful * 100.0 / total) : 0.0;
                    
                    return new DashboardStatsResponse.EndpointHealthSummary(
                            endpoint.getId().toString(),
                            endpoint.getUrl(),
                            endpoint.getEnabled(),
                            total,
                            successful,
                            Math.round(successRate * 100.0) / 100.0
                    );
                })
                .sorted(Comparator.comparingLong(DashboardStatsResponse.EndpointHealthSummary::getTotalDeliveries).reversed())
                .limit(10)
                .collect(Collectors.toList());
    }
}
