package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.*;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.*;
import com.webhook.platform.api.dto.EventIngestRequest;
import com.webhook.platform.api.dto.EventResponse;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class EventService {

    private final EventRepository eventRepository;
    private final ProjectRepository projectRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final DeliveryRepository deliveryRepository;
    private final OutboxMessageRepository outboxMessageRepository;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meterRegistry;

    public EventService(
            EventRepository eventRepository,
            ProjectRepository projectRepository,
            SubscriptionRepository subscriptionRepository,
            DeliveryRepository deliveryRepository,
            OutboxMessageRepository outboxMessageRepository,
            ObjectMapper objectMapper,
            MeterRegistry meterRegistry) {
        this.eventRepository = eventRepository;
        this.projectRepository = projectRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.deliveryRepository = deliveryRepository;
        this.outboxMessageRepository = outboxMessageRepository;
        this.objectMapper = objectMapper;
        this.meterRegistry = meterRegistry;
    }

    public Page<EventResponse> listEvents(UUID projectId, UUID organizationId, Pageable pageable) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new RuntimeException("Access denied");
        }
        
        Page<Event> events = eventRepository.findByProjectId(projectId, pageable);
        return events.map(this::mapToResponse);
    }

    public EventResponse getEvent(UUID projectId, UUID eventId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new RuntimeException("Access denied");
        }
        
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new RuntimeException("Event not found"));
        if (!event.getProjectId().equals(projectId)) {
            throw new RuntimeException("Event does not belong to this project");
        }
        
        return mapToResponse(event);
    }

    @Transactional
    public EventResponse sendTestEvent(UUID projectId, EventIngestRequest request, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new RuntimeException("Access denied");
        }

        Event event = createEvent(projectId, request);
        eventRepository.save(event);
        log.info("Created test event: {} for project: {}", event.getId(), projectId);

        List<Subscription> subscriptions = subscriptionRepository
                .findByProjectIdAndEventTypeAndEnabledTrue(projectId, request.getType());
        log.info("Found {} active subscriptions for event type: {}", subscriptions.size(), request.getType());

        int deliveriesCreated = 0;
        for (Subscription subscription : subscriptions) {
            Delivery delivery = createDelivery(event, subscription);
            deliveryRepository.save(delivery);

            OutboxMessage outboxMessage = createOutboxMessage(delivery);
            outboxMessageRepository.save(outboxMessage);

            deliveriesCreated++;
        }

        log.info("Created {} deliveries for test event: {}", deliveriesCreated, event.getId());
        return mapToResponseWithDeliveries(event, deliveriesCreated);
    }

    private Event createEvent(UUID projectId, EventIngestRequest request) {
        try {
            String payload = objectMapper.writeValueAsString(request.getData());
            return Event.builder()
                    .projectId(projectId)
                    .eventType(request.getType())
                    .payload(payload)
                    .build();
        } catch (Exception e) {
            throw new RuntimeException("Failed to serialize event payload", e);
        }
    }

    private Delivery createDelivery(Event event, Subscription subscription) {
        return Delivery.builder()
                .eventId(event.getId())
                .endpointId(subscription.getEndpointId())
                .subscriptionId(subscription.getId())
                .status(DeliveryStatus.PENDING)
                .attemptCount(0)
                .maxAttempts(7)
                .build();
    }

    private OutboxMessage createOutboxMessage(Delivery delivery) {
        try {
            DeliveryMessage deliveryMessage = DeliveryMessage.builder()
                    .deliveryId(delivery.getId())
                    .eventId(delivery.getEventId())
                    .endpointId(delivery.getEndpointId())
                    .subscriptionId(delivery.getSubscriptionId())
                    .status(delivery.getStatus().name())
                    .attemptCount(delivery.getAttemptCount())
                    .build();
            
            String payload = objectMapper.writeValueAsString(deliveryMessage);
            return OutboxMessage.builder()
                    .aggregateType("Delivery")
                    .aggregateId(delivery.getId())
                    .eventType("DeliveryCreated")
                    .payload(payload)
                    .kafkaTopic(KafkaTopics.DELIVERIES_DISPATCH)
                    .kafkaKey(delivery.getEndpointId().toString())
                    .status(OutboxStatus.PENDING)
                    .retryCount(0)
                    .build();
        } catch (Exception e) {
            throw new RuntimeException("Failed to create outbox message", e);
        }
    }

    private EventResponse mapToResponse(Event event) {
        return EventResponse.builder()
                .id(event.getId())
                .projectId(event.getProjectId())
                .eventType(event.getEventType())
                .payload(event.getPayload())
                .createdAt(event.getCreatedAt())
                .build();
    }

    private EventResponse mapToResponseWithDeliveries(Event event, int deliveriesCreated) {
        return EventResponse.builder()
                .id(event.getId())
                .projectId(event.getProjectId())
                .eventType(event.getEventType())
                .payload(event.getPayload())
                .createdAt(event.getCreatedAt())
                .deliveriesCreated(deliveriesCreated)
                .build();
    }
}
