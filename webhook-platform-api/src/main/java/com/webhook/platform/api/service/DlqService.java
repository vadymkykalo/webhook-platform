package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.Delivery;
import com.webhook.platform.api.domain.entity.DeliveryAttempt;
import com.webhook.platform.api.domain.entity.Endpoint;
import com.webhook.platform.api.domain.entity.Event;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.DeliveryAttemptRepository;
import com.webhook.platform.api.domain.repository.DeliveryRepository;
import com.webhook.platform.api.domain.repository.EventRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.DlqItemResponse;
import com.webhook.platform.api.dto.DlqStatsResponse;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class DlqService {

    private final DeliveryRepository deliveryRepository;
    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final EventRepository eventRepository;
    private final ProjectRepository projectRepository;
    private final OutboxMessageRepository outboxMessageRepository;
    private final ObjectMapper objectMapper;

    public void validateProjectOwnership(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
    }

    @Transactional(readOnly = true)
    public Page<DlqItemResponse> listDlqItems(UUID projectId, UUID endpointId, Pageable pageable) {
        Page<Delivery> deliveries;
        if (endpointId != null) {
            deliveries = deliveryRepository.findDlqByProjectIdAndEndpointId(projectId, endpointId, pageable);
        } else {
            deliveries = deliveryRepository.findDlqByProjectId(projectId, pageable);
        }

        // Batch-load last delivery attempts in 1 query instead of N
        List<UUID> deliveryIds = deliveries.getContent().stream()
                .map(Delivery::getId).collect(Collectors.toList());
        Map<UUID, DeliveryAttempt> lastAttempts = Map.of();
        if (!deliveryIds.isEmpty()) {
            lastAttempts = deliveryAttemptRepository.findLatestAttemptsByDeliveryIds(deliveryIds)
                    .stream()
                    .collect(Collectors.toMap(DeliveryAttempt::getDeliveryId, a -> a));
        }

        Map<UUID, DeliveryAttempt> finalLastAttempts = lastAttempts;
        return deliveries.map(d -> mapToResponse(d, finalLastAttempts.get(d.getId())));
    }

    @Transactional(readOnly = true)
    public DlqItemResponse getDlqItem(UUID projectId, UUID deliveryId, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        Delivery delivery = deliveryRepository.findById(deliveryId)
                .orElseThrow(() -> new NotFoundException("Delivery not found"));
        
        if (delivery.getStatus() != DeliveryStatus.DLQ) {
            throw new IllegalArgumentException("Delivery is not in DLQ");
        }
        
        Optional<DeliveryAttempt> lastAttempt = deliveryAttemptRepository
                .findTopByDeliveryIdOrderByAttemptNumberDesc(delivery.getId());
        return mapToResponse(delivery, lastAttempt.orElse(null));
    }

    public DlqStatsResponse getDlqStats(UUID projectId) {
        long total = deliveryRepository.countDlqByProjectId(projectId);
        long last24h = deliveryRepository.countDlqByProjectIdSince(projectId, Instant.now().minus(24, ChronoUnit.HOURS));
        long last7d = deliveryRepository.countDlqByProjectIdSince(projectId, Instant.now().minus(7, ChronoUnit.DAYS));
        
        return DlqStatsResponse.builder()
                .totalItems(total)
                .last24Hours(last24h)
                .last7Days(last7d)
                .build();
    }

    @Transactional
    public int retryDeliveries(UUID projectId, List<UUID> deliveryIds, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        
        List<Delivery> deliveries = deliveryRepository.findByIdInAndStatus(deliveryIds, DeliveryStatus.DLQ);
        int retried = 0;
        
        for (Delivery delivery : deliveries) {
            // Verify delivery belongs to the project
            Event event = eventRepository.findById(delivery.getEventId()).orElse(null);
            if (event == null || !event.getProjectId().equals(projectId)) {
                continue;
            }
            
            // Reset delivery for retry
            delivery.setStatus(DeliveryStatus.PENDING);
            delivery.setAttemptCount(0);
            delivery.setNextRetryAt(null);
            delivery.setFailedAt(null);
            deliveryRepository.save(delivery);
            
            // Create outbox message for redelivery
            createOutboxMessage(delivery);
            
            log.info("Retrying DLQ delivery: {}", delivery.getId());
            retried++;
        }
        
        return retried;
    }

    @Transactional
    public int purgeAllDlq(UUID projectId, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        
        long count = deliveryRepository.countDlqByProjectId(projectId);
        deliveryRepository.deleteDlqByProjectId(projectId);
        
        log.info("Purged {} DLQ items for project: {}", count, projectId);
        return (int) count;
    }

    private DlqItemResponse mapToResponse(Delivery delivery, DeliveryAttempt lastAttempt) {
        // Use already-fetched relations from JOIN FETCH (no extra queries)
        Event event = delivery.getEvent();
        Endpoint endpoint = delivery.getEndpoint();

        String lastError = null;
        if (lastAttempt != null) {
            lastError = lastAttempt.getErrorMessage();
            if (lastError == null && lastAttempt.getHttpStatusCode() != null) {
                lastError = "HTTP " + lastAttempt.getHttpStatusCode();
            }
        }
        
        return DlqItemResponse.builder()
                .deliveryId(delivery.getId())
                .eventId(delivery.getEventId())
                .endpointId(delivery.getEndpointId())
                .subscriptionId(delivery.getSubscriptionId())
                .eventType(event != null ? event.getEventType() : null)
                .endpointUrl(endpoint != null ? endpoint.getUrl() : null)
                .attemptCount(delivery.getAttemptCount())
                .maxAttempts(delivery.getMaxAttempts())
                .lastError(lastError)
                .failedAt(delivery.getFailedAt())
                .createdAt(delivery.getCreatedAt())
                .build();
    }

    private void createOutboxMessage(Delivery delivery) {
        try {
            DeliveryMessage deliveryMessage = DeliveryMessage.builder()
                    .deliveryId(delivery.getId())
                    .eventId(delivery.getEventId())
                    .endpointId(delivery.getEndpointId())
                    .subscriptionId(delivery.getSubscriptionId())
                    .status(delivery.getStatus().name())
                    .attemptCount(delivery.getAttemptCount())
                    .sequenceNumber(delivery.getSequenceNumber())
                    .orderingEnabled(delivery.getOrderingEnabled())
                    .build();
            
            String payload = objectMapper.writeValueAsString(deliveryMessage);
            OutboxMessage outboxMessage = OutboxMessage.builder()
                    .aggregateType("Delivery")
                    .aggregateId(delivery.getId())
                    .eventType("DeliveryRetry")
                    .payload(payload)
                    .kafkaTopic(KafkaTopics.DELIVERIES_DISPATCH)
                    .kafkaKey(delivery.getEndpointId().toString())
                    .status(OutboxStatus.PENDING)
                    .retryCount(0)
                    .build();
            outboxMessageRepository.save(outboxMessage);
        } catch (Exception e) {
            throw new RuntimeException("Failed to create outbox message for retry", e);
        }
    }
}
