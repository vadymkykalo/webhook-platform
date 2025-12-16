package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Delivery;
import com.webhook.platform.api.domain.entity.DeliveryAttempt;
import com.webhook.platform.api.domain.entity.Event;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import java.time.Instant;
import com.webhook.platform.api.domain.repository.DeliveryAttemptRepository;
import com.webhook.platform.api.domain.repository.DeliveryRepository;
import com.webhook.platform.api.domain.repository.EventRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.domain.specification.DeliverySpecification;
import com.webhook.platform.api.dto.DeliveryAttemptResponse;
import com.webhook.platform.api.dto.DeliveryResponse;
import org.springframework.data.jpa.domain.Specification;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class DeliveryService {

    private final DeliveryRepository deliveryRepository;
    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final OutboxMessageRepository outboxMessageRepository;
    private final EventRepository eventRepository;
    private final ProjectRepository projectRepository;
    private final ObjectMapper objectMapper;

    public DeliveryService(
            DeliveryRepository deliveryRepository,
            DeliveryAttemptRepository deliveryAttemptRepository,
            OutboxMessageRepository outboxMessageRepository,
            EventRepository eventRepository,
            ProjectRepository projectRepository,
            ObjectMapper objectMapper) {
        this.deliveryRepository = deliveryRepository;
        this.deliveryAttemptRepository = deliveryAttemptRepository;
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

    public Page<DeliveryResponse> listDeliveriesByProject(
            UUID projectId,
            UUID organizationId,
            DeliveryStatus status,
            UUID endpointId,
            Instant fromDate,
            Instant toDate,
            Pageable pageable
    ) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("Project not found"));

        if (!project.getOrganizationId().equals(organizationId)) {
            throw new RuntimeException("Access denied");
        }

        List<UUID> eventIds = eventRepository.findByProjectId(projectId)
                .stream()
                .map(Event::getId)
                .toList();

        if (eventIds.isEmpty()) {
            return new PageImpl<>(List.of(), pageable, 0);
        }

        Specification<Delivery> spec = Specification
                .where(DeliverySpecification.hasEventIds(eventIds))
                .and(DeliverySpecification.hasStatus(status))
                .and(DeliverySpecification.hasEndpointId(endpointId))
                .and(DeliverySpecification.createdAfter(fromDate))
                .and(DeliverySpecification.createdBefore(toDate));

        Page<Delivery> deliveries = deliveryRepository.findAll(spec, pageable);

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

    public List<DeliveryAttemptResponse> getDeliveryAttempts(UUID deliveryId, UUID organizationId) {
        Delivery delivery = deliveryRepository.findById(deliveryId)
                .orElseThrow(() -> new RuntimeException("Delivery not found"));
        validateDeliveryAccess(delivery, organizationId);
        
        List<DeliveryAttempt> attempts = deliveryAttemptRepository
                .findByDeliveryIdOrderByAttemptNumberAsc(deliveryId);
        
        return attempts.stream()
                .map(this::mapAttemptToResponse)
                .toList();
    }

    @Transactional
    public int bulkReplayDeliveries(List<UUID> deliveryIds, DeliveryStatus statusFilter, 
                                     UUID endpointIdFilter, UUID projectIdFilter, UUID organizationId) {
        List<Delivery> deliveriesToReplay;
        
        if (deliveryIds != null && !deliveryIds.isEmpty()) {
            List<Delivery> collected = new ArrayList<>();
            for (UUID deliveryId : deliveryIds) {
                try {
                    Delivery delivery = deliveryRepository.findById(deliveryId).orElse(null);
                    if (delivery != null) {
                        validateDeliveryAccess(delivery, organizationId);
                        if (delivery.getStatus() != DeliveryStatus.SUCCESS) {
                            collected.add(delivery);
                        }
                    }
                } catch (Exception e) {
                    log.warn("Skipping delivery {} - access denied or invalid", deliveryId);
                }
            }
            deliveriesToReplay = collected;
        } else if (projectIdFilter != null) {
            Project project = projectRepository.findById(projectIdFilter)
                    .orElseThrow(() -> new RuntimeException("Project not found"));
            
            if (!project.getOrganizationId().equals(organizationId)) {
                throw new RuntimeException("Access denied");
            }
            
            List<UUID> eventIds = eventRepository.findByProjectId(projectIdFilter)
                    .stream()
                    .map(Event::getId)
                    .toList();
            
            if (!eventIds.isEmpty()) {
                Specification<Delivery> spec = Specification
                        .where(DeliverySpecification.hasEventIds(eventIds))
                        .and(DeliverySpecification.hasStatus(statusFilter))
                        .and(DeliverySpecification.hasEndpointId(endpointIdFilter));
                
                deliveriesToReplay = deliveryRepository.findAll(spec);
            } else {
                deliveriesToReplay = new ArrayList<>();
            }
        } else {
            deliveriesToReplay = new ArrayList<>();
        }
        
        int replayedCount = 0;
        for (Delivery delivery : deliveriesToReplay) {
            if (delivery.getStatus() == DeliveryStatus.SUCCESS) {
                continue;
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
                        .eventType("DeliveryBulkReplayed")
                        .payload(payload)
                        .kafkaTopic(KafkaTopics.DELIVERIES_DISPATCH)
                        .kafkaKey(delivery.getEndpointId().toString())
                        .status(OutboxStatus.PENDING)
                        .retryCount(0)
                        .build();
                
                outboxMessageRepository.save(outboxMessage);
                replayedCount++;
            } catch (Exception e) {
                log.error("Failed to create bulk replay outbox message for delivery {}", delivery.getId(), e);
            }
        }
        
        log.info("Bulk replayed {} deliveries", replayedCount);
        return replayedCount;
    }

    private DeliveryAttemptResponse mapAttemptToResponse(DeliveryAttempt attempt) {
        return DeliveryAttemptResponse.builder()
                .id(attempt.getId())
                .deliveryId(attempt.getDeliveryId())
                .attemptNumber(attempt.getAttemptNumber())
                .httpStatusCode(attempt.getHttpStatusCode())
                .responseBody(attempt.getResponseBody())
                .errorMessage(attempt.getErrorMessage())
                .durationMs(attempt.getDurationMs())
                .createdAt(attempt.getCreatedAt())
                .build();
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
