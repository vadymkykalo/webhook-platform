package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Endpoint;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.repository.DeliveryRepository;
import com.webhook.platform.api.domain.repository.EndpointRepository;
import com.webhook.platform.api.domain.repository.EventRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.DashboardStatsResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class DashboardService {
    
    private final ProjectRepository projectRepository;
    private final EventRepository eventRepository;
    private final DeliveryRepository deliveryRepository;
    private final EndpointRepository endpointRepository;
    
    public DashboardService(
            ProjectRepository projectRepository,
            EventRepository eventRepository,
            DeliveryRepository deliveryRepository,
            EndpointRepository endpointRepository) {
        this.projectRepository = projectRepository;
        this.eventRepository = eventRepository;
        this.deliveryRepository = deliveryRepository;
        this.endpointRepository = endpointRepository;
    }
    
    public DashboardStatsResponse getProjectStats(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
        
        // Calculate delivery stats using DB-level counts
        DashboardStatsResponse.DeliveryStats deliveryStats = calculateDeliveryStats(projectId);
        
        // Get recent events (last 10) with delivery counts
        List<DashboardStatsResponse.RecentEventSummary> recentEvents = getRecentEvents(projectId);
        
        // Get endpoint health
        List<DashboardStatsResponse.EndpointHealthSummary> endpointHealth = getEndpointHealth(projectId);
        
        return new DashboardStatsResponse(deliveryStats, recentEvents, endpointHealth);
    }
    
    private DashboardStatsResponse.DeliveryStats calculateDeliveryStats(UUID projectId) {
        List<Object[]> statusCounts = deliveryRepository.countByProjectIdGroupByStatus(projectId);
        
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
    
    private List<DashboardStatsResponse.EndpointHealthSummary> getEndpointHealth(UUID projectId) {
        List<Endpoint> endpoints = endpointRepository.findByProjectId(projectId);
        
        if (endpoints.isEmpty()) {
            return new ArrayList<>();
        }
        
        List<UUID> endpointIds = endpoints.stream().map(Endpoint::getId).collect(Collectors.toList());
        List<Object[]> stats = deliveryRepository.countByEndpointIdsGroupByEndpointAndStatus(endpointIds);
        
        // Build lookup: endpointId -> {status -> count}
        Map<UUID, Map<String, Long>> statsMap = new HashMap<>();
        for (Object[] row : stats) {
            UUID eid = (UUID) row[0];
            String status = (String) row[1];
            long count = ((Number) row[2]).longValue();
            statsMap.computeIfAbsent(eid, k -> new HashMap<>()).put(status, count);
        }
        
        return endpoints.stream()
                .filter(e -> e.getDeletedAt() == null)
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
