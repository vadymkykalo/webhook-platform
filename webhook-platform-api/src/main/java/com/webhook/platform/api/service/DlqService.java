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
import com.webhook.platform.api.domain.repository.EndpointRepository;
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

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class DlqService {

    private final DeliveryRepository deliveryRepository;
    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final EndpointRepository endpointRepository;
    private final EventRepository eventRepository;
    private final ProjectRepository projectRepository;
    private final OutboxMessageRepository outboxMessageRepository;
    private final ObjectMapper objectMapper;

    public void validateProjectOwnership(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new RuntimeException("Access denied");
        }
    }

    public Page<DlqItemResponse> listDlqItems(UUID projectId, UUID endpointId, Pageable pageable) {
        Page<Delivery> deliveries;
        if (endpointId != null) {
            deliveries = deliveryRepository.findDlqByProjectIdAndEndpointId(projectId, endpointId, pageable);
        } else {
            deliveries = deliveryRepository.findDlqByProjectId(projectId, pageable);
        }
        return deliveries.map(this::mapToResponse);
    }

    public DlqItemResponse getDlqItem(UUID projectId, UUID deliveryId, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        Delivery delivery = deliveryRepository.findById(deliveryId)
                .orElseThrow(() -> new RuntimeException("Delivery not found"));
        
        if (delivery.getStatus() != DeliveryStatus.DLQ) {
            throw new RuntimeException("Delivery is not in DLQ");
        }
        
        return mapToResponse(delivery);
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

    private DlqItemResponse mapToResponse(Delivery delivery) {
        Event event = eventRepository.findById(delivery.getEventId()).orElse(null);
        Endpoint endpoint = endpointRepository.findById(delivery.getEndpointId()).orElse(null);
        
        // Get last error from most recent attempt
        String lastError = null;
        Optional<DeliveryAttempt> lastAttempt = deliveryAttemptRepository
                .findTopByDeliveryIdOrderByAttemptNumberDesc(delivery.getId());
        if (lastAttempt.isPresent()) {
            lastError = lastAttempt.get().getErrorMessage();
            if (lastError == null && lastAttempt.get().getHttpStatusCode() != null) {
                lastError = "HTTP " + lastAttempt.get().getHttpStatusCode();
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
