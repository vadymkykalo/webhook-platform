package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Delivery;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.DeliveryRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
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
    private final ObjectMapper objectMapper;

    public DeliveryService(
            DeliveryRepository deliveryRepository,
            OutboxMessageRepository outboxMessageRepository,
            ObjectMapper objectMapper) {
        this.deliveryRepository = deliveryRepository;
        this.outboxMessageRepository = outboxMessageRepository;
        this.objectMapper = objectMapper;
    }

    public DeliveryResponse getDelivery(UUID id) {
        Delivery delivery = deliveryRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Delivery not found"));
        return mapToResponse(delivery);
    }

    public Page<DeliveryResponse> listDeliveries(UUID eventId, Pageable pageable) {
        List<Delivery> deliveries = deliveryRepository.findAll().stream()
                .filter(d -> eventId == null || d.getEventId().equals(eventId))
                .collect(Collectors.toList());
        
        int start = (int) pageable.getOffset();
        int end = Math.min((start + pageable.getPageSize()), deliveries.size());
        
        List<DeliveryResponse> responseList = deliveries.subList(start, end).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
        
        return new PageImpl<>(responseList, pageable, deliveries.size());
    }

    @Transactional
    public void replayDelivery(UUID deliveryId) {
        Delivery delivery = deliveryRepository.findById(deliveryId)
                .orElseThrow(() -> new RuntimeException("Delivery not found"));
        
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
