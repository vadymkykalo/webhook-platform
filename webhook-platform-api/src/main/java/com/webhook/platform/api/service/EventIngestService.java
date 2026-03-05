package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.*;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.enums.IdempotencyPolicy;
import com.webhook.platform.api.domain.enums.SchemaValidationPolicy;
import com.webhook.platform.api.domain.repository.*;
import com.webhook.platform.api.dto.EventIngestRequest;
import com.webhook.platform.api.dto.EventIngestResponse;
import com.webhook.platform.api.service.rules.CompiledRule;
import com.webhook.platform.api.service.rules.RuleEngineService;
import com.webhook.platform.api.service.workflow.WorkflowTriggerService;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.util.EventTypeMatcher;
import com.webhook.platform.common.dto.DeliveryMessage;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
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
    private final SchemaRegistryService schemaRegistryService;
    private final ProjectRepository projectRepository;
    private final RuleEngineService ruleEngineService;
    private final WorkflowTriggerService workflowTriggerService;
    private final TransactionTemplate transactionTemplate;
    private final long maxPayloadSizeBytes;

    public EventIngestService(
            EventRepository eventRepository,
            SubscriptionRepository subscriptionRepository,
            DeliveryRepository deliveryRepository,
            OutboxMessageRepository outboxMessageRepository,
            ObjectMapper objectMapper,
            MeterRegistry meterRegistry,
            SequenceGeneratorService sequenceGeneratorService,
            SchemaRegistryService schemaRegistryService,
            ProjectRepository projectRepository,
            RuleEngineService ruleEngineService,
            WorkflowTriggerService workflowTriggerService,
            PlatformTransactionManager transactionManager,
            @Value("${webhook.max-payload-size-bytes:262144}") long maxPayloadSizeBytes) {
        this.eventRepository = eventRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.deliveryRepository = deliveryRepository;
        this.outboxMessageRepository = outboxMessageRepository;
        this.objectMapper = objectMapper;
        this.meterRegistry = meterRegistry;
        this.sequenceGeneratorService = sequenceGeneratorService;
        this.schemaRegistryService = schemaRegistryService;
        this.projectRepository = projectRepository;
        this.ruleEngineService = ruleEngineService;
        this.workflowTriggerService = workflowTriggerService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.maxPayloadSizeBytes = maxPayloadSizeBytes;
    }

    /** Carries event data out of the transaction for post-commit workflow triggering. */
    private record IngestResult(EventIngestResponse response, UUID eventId, String eventType, String eventPayload) {}

    public EventIngestResponse ingestEvent(UUID projectId, EventIngestRequest request, String idempotencyKey) {
        IngestResult result;
        try {
            result = transactionTemplate.execute(status -> doIngestEvent(projectId, request, idempotencyKey));
        } catch (DataIntegrityViolationException e) {
            if (idempotencyKey != null) {
                var existingEvent = eventRepository.findByProjectIdAndIdempotencyKey(projectId, idempotencyKey);
                if (existingEvent.isPresent()) {
                    log.info("Idempotency race resolved, returning existing event: {}", existingEvent.get().getId());
                    Counter.builder("events_duplicate_total").tag("event_type", request.getType()).register(meterRegistry).increment();
                    return buildResponse(existingEvent.get(), 0);
                }
            }
            throw e;
        }

        // ── Workflow automation — AFTER transaction commit ────────────────
        // DB connection is released. Even if workflow pool is overloaded and task
        // is discarded, the event + deliveries are already safely committed.
        if (result != null && result.eventId() != null) {
            try {
                int depth = WorkflowTriggerService.getCurrentDepth() + 1;
                workflowTriggerService.triggerWorkflows(
                        projectId, result.eventId(), result.eventType(), result.eventPayload(), depth);
            } catch (Exception e) {
                log.warn("Failed to trigger workflows for event {} (event is committed, workflows skipped): {}",
                        result.eventId(), e.getMessage());
            }
        }

        return result != null ? result.response() : null;
    }

    private IngestResult doIngestEvent(UUID projectId, EventIngestRequest request, String idempotencyKey) {
        // Enforce idempotency policy
        Project project = projectRepository.findById(projectId).orElse(null);
        if (project != null && project.getIdempotencyPolicy() == IdempotencyPolicy.REQUIRED && idempotencyKey == null) {
            throw new IllegalArgumentException(
                    "Idempotency-Key header is required for this project (policy: REQUIRED)");
        }
        if (project != null && project.getIdempotencyPolicy() == IdempotencyPolicy.AUTO && idempotencyKey == null) {
            idempotencyKey = UUID.randomUUID().toString();
            log.debug("Auto-generated idempotency key: {} for project: {}", idempotencyKey, projectId);
        }

        if (idempotencyKey != null) {
            var existingEvent = eventRepository.findByProjectIdAndIdempotencyKey(projectId, idempotencyKey);
            if (existingEvent.isPresent()) {
                Event event = existingEvent.get();
                log.info("Duplicate event detected, returning existing event: {}", event.getId());
                Counter.builder("events_duplicate_total").tag("event_type", request.getType()).register(meterRegistry).increment();
                return new IngestResult(buildResponse(event, 0), null, null, null);
            }
        }

        // Schema validation BEFORE saving event
        if (project != null && Boolean.TRUE.equals(project.getSchemaValidationEnabled())) {
            String payloadJson;
            try {
                payloadJson = objectMapper.writeValueAsString(request.getData());
            } catch (Exception e) {
                throw new RuntimeException("Failed to serialize event payload", e);
            }

            schemaRegistryService.autoDiscover(projectId, request.getType(), payloadJson);

            List<String> validationErrors = schemaRegistryService.validatePayload(
                    projectId, request.getType(), payloadJson);
            if (!validationErrors.isEmpty()) {
                log.warn("Schema validation failed for event type '{}': {}",
                        request.getType(), validationErrors);
                if (project.getSchemaValidationPolicy() == SchemaValidationPolicy.BLOCK) {
                    throw new IllegalArgumentException(
                            "Schema validation failed: " + String.join("; ", validationErrors));
                }
            }
        }

        Event event = createEvent(projectId, request, idempotencyKey);
        event = eventRepository.saveAndFlush(event);
        Counter.builder("events_ingested_total").tag("event_type", request.getType()).register(meterRegistry).increment();
        log.info("Created event: {} for project: {}", event.getId(), projectId);

        // ── Rules Engine evaluation ────────────────────────────────────
        JsonNode eventJson = null;
        List<RuleEngineService.RuleMatch> ruleMatches = List.of();
        boolean dropEvent = false;
        Set<UUID> ruleRouteEndpoints = new HashSet<>();
        UUID ruleTransformationId = null;

        try {
            eventJson = objectMapper.readTree(event.getPayload());
            ruleMatches = ruleEngineService.evaluate(projectId, request.getType(), eventJson, event.getId());

            for (RuleEngineService.RuleMatch match : ruleMatches) {
                if (match.hasDrop()) {
                    dropEvent = true;
                    log.info("Rule '{}' DROP action — skipping deliveries for event {}",
                            match.rule().getName(), event.getId());
                    Counter.builder("rules_drop_total").tag("project_id", projectId.toString()).register(meterRegistry).increment();
                    break;
                }
                for (CompiledRule.CompiledAction action : match.getRouteActions()) {
                    ruleRouteEndpoints.add(action.getEndpointId());
                }
                for (CompiledRule.CompiledAction action : match.getTransformActions()) {
                    if (action.getTransformationId() != null) {
                        ruleTransformationId = action.getTransformationId();
                    }
                }
            }

            if (!ruleMatches.isEmpty()) {
                Counter.builder("rules_matched_total").tag("project_id", projectId.toString())
                        .register(meterRegistry).increment(ruleMatches.size());
            }
        } catch (Exception e) {
            log.warn("Rules engine evaluation failed for event {}: {} — proceeding without rules",
                    event.getId(), e.getMessage());
        }

        if (dropEvent) {
            return new IngestResult(buildResponse(event, 0), null, null, null);
        }

        // ── Subscription-based deliveries ──────────────────────────────
        List<Subscription> subscriptions = subscriptionRepository
                .findByProjectIdAndEnabledTrue(projectId).stream()
                .filter(s -> EventTypeMatcher.matches(s.getEventType(), request.getType()))
                .toList();
        log.info("Found {} matching subscriptions for event type: {}", subscriptions.size(), request.getType());

        Set<UUID> deliveredEndpoints = new HashSet<>();
        List<Delivery> deliveriesToSave = new ArrayList<>(subscriptions.size() + ruleRouteEndpoints.size());

        for (Subscription subscription : subscriptions) {
            Long sequenceNumber = null;
            boolean orderingEnabled = Boolean.TRUE.equals(subscription.getOrderingEnabled());

            if (orderingEnabled) {
                sequenceNumber = sequenceGeneratorService.nextSequence(subscription.getEndpointId());
                log.debug("Generated sequence {} for endpoint {}", sequenceNumber, subscription.getEndpointId());
            }

            // Apply rule transformation override if present
            UUID effectiveTransformId = ruleTransformationId != null
                    ? ruleTransformationId
                    : subscription.getTransformationId();

            Delivery delivery = createDelivery(event, subscription, sequenceNumber, orderingEnabled);
            if (effectiveTransformId != null) {
                delivery.setTransformationId(effectiveTransformId);
            }
            deliveriesToSave.add(delivery);
            deliveredEndpoints.add(subscription.getEndpointId());
        }

        // ── Rule ROUTE actions — additional endpoints ──────────────────
        for (UUID routeEndpointId : ruleRouteEndpoints) {
            if (deliveredEndpoints.contains(routeEndpointId)) {
                continue; // already delivered via subscription
            }
            deliveriesToSave.add(createRuleRouteDelivery(event, routeEndpointId, ruleTransformationId));
            deliveredEndpoints.add(routeEndpointId);
            log.debug("Rule ROUTE: added delivery to endpoint {} for event {}", routeEndpointId, event.getId());
        }

        List<Delivery> savedDeliveries = deliveryRepository.saveAll(deliveriesToSave);

        List<OutboxMessage> outboxMessages = new ArrayList<>(savedDeliveries.size());
        for (Delivery delivery : savedDeliveries) {
            outboxMessages.add(createOutboxMessage(delivery));
        }
        outboxMessageRepository.saveAll(outboxMessages);

        int deliveriesCreated = savedDeliveries.size();
        Counter.builder("deliveries_created_total").tag("project_id", projectId.toString()).register(meterRegistry).increment(deliveriesCreated);

        log.info("Created {} deliveries for event: {} (rules matched: {})",
                deliveriesCreated, event.getId(), ruleMatches.size());

        return new IngestResult(
                buildResponse(event, deliveriesCreated),
                event.getId(), request.getType(), event.getPayload());
    }

    private Event createEvent(UUID projectId, EventIngestRequest request, String idempotencyKey) {
        try {
            String payload = objectMapper.writeValueAsString(request.getData());

            long payloadBytes = payload.getBytes(StandardCharsets.UTF_8).length;
            if (payloadBytes > maxPayloadSizeBytes) {
                throw new IllegalArgumentException(
                        "Event payload size (" + payloadBytes + " bytes) exceeds maximum allowed size ("
                                + maxPayloadSizeBytes + " bytes)");
            }

            return Event.builder()
                    .projectId(projectId)
                    .eventType(request.getType())
                    .idempotencyKey(idempotencyKey)
                    .payload(payload)
                    .build();
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Failed to serialize event payload", e);
        }
    }

    private Delivery createDelivery(Event event, Subscription subscription, Long sequenceNumber, boolean orderingEnabled) {
        String deliveryIdempotencyKey = event.getIdempotencyKey() != null
                ? event.getIdempotencyKey() + "-" + subscription.getEndpointId()
                : null;

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
                .transformationId(subscription.getTransformationId())
                .idempotencyKey(deliveryIdempotencyKey)
                .build();
    }

    private Delivery createRuleRouteDelivery(Event event, UUID endpointId, UUID transformationId) {
        String deliveryIdempotencyKey = event.getIdempotencyKey() != null
                ? event.getIdempotencyKey() + "-rule-" + endpointId
                : null;

        return Delivery.builder()
                .eventId(event.getId())
                .endpointId(endpointId)
                .status(DeliveryStatus.PENDING)
                .attemptCount(0)
                .maxAttempts(7)
                .orderingEnabled(false)
                .timeoutSeconds(30)
                .retryDelays("60,300,900,3600,21600,86400")
                .transformationId(transformationId)
                .idempotencyKey(deliveryIdempotencyKey)
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
