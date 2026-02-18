package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.*;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.*;
import com.webhook.platform.api.dto.EventIngestRequest;
import com.webhook.platform.api.dto.EventIngestResponse;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class EventIngestService {

    private final EventRepository eventRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final DeliveryRepository deliveryRepository;
    private final OutboxMessageRepository outboxMessageRepository;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meterRegistry;
    private final SequenceGeneratorService sequenceGeneratorService;

    public EventIngestService(
            EventRepository eventRepository,
            SubscriptionRepository subscriptionRepository,
            DeliveryRepository deliveryRepository,
            OutboxMessageRepository outboxMessageRepository,
            ObjectMapper objectMapper,
            MeterRegistry meterRegistry,
            SequenceGeneratorService sequenceGeneratorService) {
        this.eventRepository = eventRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.deliveryRepository = deliveryRepository;
        this.outboxMessageRepository = outboxMessageRepository;
        this.objectMapper = objectMapper;
        this.meterRegistry = meterRegistry;
        this.sequenceGeneratorService = sequenceGeneratorService;
    }

    @Transactional
    public EventIngestResponse ingestEvent(UUID projectId, EventIngestRequest request, String idempotencyKey) {
        if (idempotencyKey != null) {
            var existingEvent = eventRepository.findByProjectIdAndIdempotencyKey(projectId, idempotencyKey);
            if (existingEvent.isPresent()) {
                Event event = existingEvent.get();
                log.info("Duplicate event detected, returning existing event: {}", event.getId());
                Counter.builder("events_duplicate_total").tag("event_type", request.getType()).register(meterRegistry).increment();
                return buildResponse(event, 0);
            }
        }

        Event event = createEvent(projectId, request, idempotencyKey);
        event = eventRepository.saveAndFlush(event);
        Counter.builder("events_ingested_total").tag("event_type", request.getType()).register(meterRegistry).increment();
        log.info("Created event: {} for project: {}", event.getId(), projectId);

        List<Subscription> subscriptions = subscriptionRepository
                .findByProjectIdAndEventTypeAndEnabledTrue(projectId, request.getType());
        log.info("Found {} active subscriptions for event type: {}", subscriptions.size(), request.getType());

        int deliveriesCreated = 0;
        for (Subscription subscription : subscriptions) {
            Long sequenceNumber = null;
            boolean orderingEnabled = Boolean.TRUE.equals(subscription.getOrderingEnabled());
            
            if (orderingEnabled) {
                sequenceNumber = sequenceGeneratorService.nextSequence(subscription.getEndpointId());
                log.debug("Generated sequence {} for endpoint {}", sequenceNumber, subscription.getEndpointId());
            }
            
            Delivery delivery = createDelivery(event, subscription, sequenceNumber, orderingEnabled);
            deliveryRepository.save(delivery);

            OutboxMessage outboxMessage = createOutboxMessage(delivery);
            outboxMessageRepository.save(outboxMessage);

            deliveriesCreated++;
        }
        Counter.builder("deliveries_created_total").tag("project_id", projectId.toString()).register(meterRegistry).increment(deliveriesCreated);

        log.info("Created {} deliveries for event: {}", deliveriesCreated, event.getId());
        return buildResponse(event, deliveriesCreated);
    }

    private Event createEvent(UUID projectId, EventIngestRequest request, String idempotencyKey) {
        try {
            String payload = objectMapper.writeValueAsString(request.getData());
            return Event.builder()
                    .projectId(projectId)
                    .eventType(request.getType())
                    .idempotencyKey(idempotencyKey)
                    .payload(payload)
                    .build();
        } catch (Exception e) {
            throw new RuntimeException("Failed to serialize event payload", e);
        }
    }

    private Delivery createDelivery(Event event, Subscription subscription, Long sequenceNumber, boolean orderingEnabled) {
        return Delivery.builder()
                .eventId(event.getId())
                .endpointId(subscription.getEndpointId())
                .subscriptionId(subscription.getId())
                .status(DeliveryStatus.PENDING)
                .attemptCount(0)
                .maxAttempts(subscription.getMaxAttempts() != null ? subscription.getMaxAttempts() : 7)
                .sequenceNumber(sequenceNumber)
                .orderingEnabled(orderingEnabled)
                .timeoutSeconds(subscription.getTimeoutSeconds() != null ? subscription.getTimeoutSeconds() : 30)
                .retryDelays(subscription.getRetryDelays() != null ? subscription.getRetryDelays() : "60,300,900,3600,21600,86400")
                .payloadTemplate(subscription.getPayloadTemplate())
                .customHeaders(subscription.getCustomHeaders())
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
                    .sequenceNumber(delivery.getSequenceNumber())
                    .orderingEnabled(delivery.getOrderingEnabled())
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

    private EventIngestResponse buildResponse(Event event, int deliveriesCreated) {
        return EventIngestResponse.builder()
                .eventId(event.getId())
                .type(event.getEventType())
                .createdAt(event.getCreatedAt())
                .deliveriesCreated(deliveriesCreated)
                .build();
    }
}
