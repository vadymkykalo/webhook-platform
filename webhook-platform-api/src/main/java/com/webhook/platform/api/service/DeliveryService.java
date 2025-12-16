package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Delivery;
import com.webhook.platform.api.domain.entity.Event;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.DeliveryRepository;
import com.webhook.platform.api.domain.repository.EventRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.DeliveryResponse;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Slf4j
public class DeliveryService {

    private final DeliveryRepository deliveryRepository;
    private final OutboxMessageRepository outboxMessageRepository;
    private final EventRepository eventRepository;
    private final ProjectRepository projectRepository;
    private final ObjectMapper objectMapper;

    public DeliveryService(
            DeliveryRepository deliveryRepository,
            OutboxMessageRepository outboxMessageRepository,
            EventRepository eventRepository,
            ProjectRepository projectRepository,
            ObjectMapper objectMapper) {
        this.deliveryRepository = deliveryRepository;
        this.outboxMessageRepository = outboxMessageRepository;
        this.eventRepository = eventRepository;
        this.projectRepository = projectRepository;
        this.objectMapper = objectMapper;
    }

    private void validateDeliveryAccess(Delivery delivery, UUID organizationId) {
        Event event = eventRepository.findById(delivery.getEventId())
                .orElseThrow(() -> new RuntimeException("Event not found"));
        Project project = projectRepository.findById(event.getProjectId())
                .orElseThrow(() -> new RuntimeException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new RuntimeException("Access denied");
        }
    }

    public DeliveryResponse getDelivery(UUID id, UUID organizationId) {
        Delivery delivery = deliveryRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Delivery not found"));
        validateDeliveryAccess(delivery, organizationId);
        return mapToResponse(delivery);
    }

    public Page<DeliveryResponse> listDeliveries(UUID eventId, UUID organizationId, Pageable pageable) {
        Page<Delivery> deliveries;
        if (eventId != null) {
            Event event = eventRepository.findById(eventId)
                    .orElseThrow(() -> new RuntimeException("Event not found"));
            Project project = projectRepository.findById(event.getProjectId())
                    .orElseThrow(() -> new RuntimeException("Project not found"));
            if (!project.getOrganizationId().equals(organizationId)) {
                throw new RuntimeException("Access denied");
            }
            deliveries = deliveryRepository.findByEventId(eventId, pageable);
        } else {
            throw new RuntimeException("eventId parameter is required");
        }
        return deliveries.map(this::mapToResponse);
    }

    public Page<DeliveryResponse> listDeliveriesByProject(UUID projectId, UUID organizationId, Pageable pageable) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new RuntimeException("Access denied");
        }
        
        List<Event> events = eventRepository.findByProjectId(projectId);
        List<UUID> eventIds = events.stream().map(Event::getId).collect(Collectors.toList());
        
        Page<Delivery> deliveries = deliveryRepository.findByEventIdIn(eventIds, pageable);
        return deliveries.map(this::mapToResponse);
    }

    @Transactional
    public void replayDelivery(UUID deliveryId, UUID organizationId) {
        Delivery delivery = deliveryRepository.findById(deliveryId)
                .orElseThrow(() -> new RuntimeException("Delivery not found"));
        validateDeliveryAccess(delivery, organizationId);
        
        if (delivery.getStatus() == DeliveryStatus.SUCCESS) {
            throw new RuntimeException("Cannot replay successful delivery");
        }
        
        delivery.setStatus(DeliveryStatus.PENDING);
        delivery.setAttemptCount(0);
        delivery.setNextRetryAt(null);
        delivery.setLastAttemptAt(null);
        delivery.setFailedAt(null);
        deliveryRepository.save(delivery);
        
        DeliveryMessage message = DeliveryMessage.builder()
                .deliveryId(delivery.getId())
                .eventId(delivery.getEventId())
                .endpointId(delivery.getEndpointId())
                .subscriptionId(delivery.getSubscriptionId())
                .status(delivery.getStatus().name())
                .attemptCount(delivery.getAttemptCount())
                .build();
        
        try {
            String payload = objectMapper.writeValueAsString(message);
            OutboxMessage outboxMessage = OutboxMessage.builder()
                    .aggregateType("Delivery")
                    .aggregateId(delivery.getId())
                    .eventType("DeliveryReplayed")
                    .payload(payload)
                    .kafkaTopic(KafkaTopics.DELIVERIES_DISPATCH)
                    .kafkaKey(delivery.getEndpointId().toString())
                    .status(OutboxStatus.PENDING)
                    .retryCount(0)
                    .build();
            
            outboxMessageRepository.save(outboxMessage);
            log.info("Replayed delivery: {}", deliveryId);
        } catch (Exception e) {
            throw new RuntimeException("Failed to create replay outbox message", e);
        }
    }

    private DeliveryResponse mapToResponse(Delivery delivery) {
        return DeliveryResponse.builder()
                .id(delivery.getId())
                .eventId(delivery.getEventId())
                .endpointId(delivery.getEndpointId())
                .subscriptionId(delivery.getSubscriptionId())
                .status(delivery.getStatus().name())
                .attemptCount(delivery.getAttemptCount())
                .maxAttempts(delivery.getMaxAttempts())
                .nextRetryAt(delivery.getNextRetryAt())
                .lastAttemptAt(delivery.getLastAttemptAt())
                .succeededAt(delivery.getSucceededAt())
                .failedAt(delivery.getFailedAt())
                .createdAt(delivery.getCreatedAt())
                .build();
    }
}
