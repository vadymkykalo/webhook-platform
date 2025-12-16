package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Delivery;
import com.webhook.platform.api.domain.entity.Endpoint;
import com.webhook.platform.api.domain.entity.Event;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.repository.DeliveryRepository;
import com.webhook.platform.api.domain.repository.EndpointRepository;
import com.webhook.platform.api.domain.repository.EventRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.DashboardStatsResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

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
                .orElseThrow(() -> new RuntimeException("Project not found"));
        
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new RuntimeException("Access denied");
        }
        
        // Get all events for this project
        List<Event> events = eventRepository.findByProjectId(projectId);
        List<UUID> eventIds = events.stream().map(Event::getId).collect(Collectors.toList());
        
        if (eventIds.isEmpty()) {
            return createEmptyStats();
        }
        
        // Get all deliveries for these events
        List<Delivery> allDeliveries = deliveryRepository.findByEventIdIn(eventIds, org.springframework.data.domain.Pageable.unpaged()).getContent();
        
        // Calculate delivery stats
        DashboardStatsResponse.DeliveryStats deliveryStats = calculateDeliveryStats(allDeliveries);
        
        // Get recent events (last 10)
        List<DashboardStatsResponse.RecentEventSummary> recentEvents = getRecentEvents(events, allDeliveries);
        
        // Get endpoint health
        List<DashboardStatsResponse.EndpointHealthSummary> endpointHealth = getEndpointHealth(projectId, allDeliveries);
        
        return new DashboardStatsResponse(deliveryStats, recentEvents, endpointHealth);
    }
    
    private DashboardStatsResponse createEmptyStats() {
        return new DashboardStatsResponse(
                new DashboardStatsResponse.DeliveryStats(0, 0, 0, 0, 0, 0.0),
                new ArrayList<>(),
                new ArrayList<>()
        );
    }
    
    private DashboardStatsResponse.DeliveryStats calculateDeliveryStats(List<Delivery> deliveries) {
        long total = deliveries.size();
        long successful = deliveries.stream()
                .filter(d -> d.getStatus() == DeliveryStatus.SUCCESS)
                .count();
        long failed = deliveries.stream()
                .filter(d -> d.getStatus() == DeliveryStatus.FAILED)
                .count();
        long dlq = deliveries.stream()
                .filter(d -> d.getStatus() == DeliveryStatus.DLQ)
                .count();
        long pending = deliveries.stream()
                .filter(d -> d.getStatus() == DeliveryStatus.PENDING || d.getStatus() == DeliveryStatus.PROCESSING)
                .count();
        
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
    
    private List<DashboardStatsResponse.RecentEventSummary> getRecentEvents(List<Event> events, List<Delivery> allDeliveries) {
        // Group deliveries by event
        Map<UUID, Long> deliveryCountByEvent = allDeliveries.stream()
                .collect(Collectors.groupingBy(Delivery::getEventId, Collectors.counting()));
        
        return events.stream()
                .sorted(Comparator.comparing(Event::getCreatedAt).reversed())
                .limit(10)
                .map(event -> new DashboardStatsResponse.RecentEventSummary(
                        event.getId().toString(),
                        event.getEventType(),
                        event.getCreatedAt().toString(),
                        deliveryCountByEvent.getOrDefault(event.getId(), 0L).intValue()
                ))
                .collect(Collectors.toList());
    }
    
    private List<DashboardStatsResponse.EndpointHealthSummary> getEndpointHealth(UUID projectId, List<Delivery> allDeliveries) {
        List<Endpoint> endpoints = endpointRepository.findByProjectId(projectId);
        
        // Group deliveries by endpoint
        Map<UUID, List<Delivery>> deliveriesByEndpoint = allDeliveries.stream()
                .collect(Collectors.groupingBy(Delivery::getEndpointId));
        
        return endpoints.stream()
                .map(endpoint -> {
                    List<Delivery> endpointDeliveries = deliveriesByEndpoint.getOrDefault(endpoint.getId(), new ArrayList<>());
                    long total = endpointDeliveries.size();
                    long successful = endpointDeliveries.stream()
                            .filter(d -> d.getStatus() == DeliveryStatus.SUCCESS)
                            .count();
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
