package com.webhook.platform.api.service;

import com.webhook.platform.common.retry.RetryLadderDefaults;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.*;
import com.webhook.platform.api.domain.enums.DeliveryOrigin;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.enums.IdempotencyPolicy;
import com.webhook.platform.api.domain.enums.SchemaValidationPolicy;
import com.webhook.platform.api.domain.repository.*;
import com.webhook.platform.api.dto.EventIngestRequest;
import com.webhook.platform.api.dto.EventIngestResponse;
import com.webhook.platform.api.service.billing.EntitlementService;
import com.webhook.platform.api.service.billing.QuotaCounterService;
import com.webhook.platform.api.service.rules.CompiledRule;
import com.webhook.platform.api.service.rules.RuleEngineService;
import com.webhook.platform.api.service.workflow.WorkflowTriggerService;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.util.PayloadCompressionUtil;
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
import java.util.concurrent.atomic.AtomicReference;

@Service
@Slf4j
public class EventIngestService {

    private final EventRepository eventRepository;
    private final SubscriptionMatchingCache subscriptionMatchingCache;
    private final DeliveryRepository deliveryRepository;
    private final OutboxMessageRepository outboxMessageRepository;
    private final WorkflowTriggerOutboxRepository workflowTriggerOutboxRepository;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meterRegistry;
    private final SequenceGeneratorService sequenceGeneratorService;
    private final SchemaRegistryService schemaRegistryService;
    private final ProjectRepository projectRepository;
    private final RuleEngineService ruleEngineService;
    private final QuotaCounterService quotaCounterService;
    private final EntitlementService entitlementService;
    private final TransactionTemplate transactionTemplate;
    private final long maxPayloadSizeBytes;
    private final int compressionThresholdBytes;

    public EventIngestService(
            EventRepository eventRepository,
            SubscriptionMatchingCache subscriptionMatchingCache,
            DeliveryRepository deliveryRepository,
            OutboxMessageRepository outboxMessageRepository,
            WorkflowTriggerOutboxRepository workflowTriggerOutboxRepository,
            ObjectMapper objectMapper,
            MeterRegistry meterRegistry,
            SequenceGeneratorService sequenceGeneratorService,
            SchemaRegistryService schemaRegistryService,
            ProjectRepository projectRepository,
            RuleEngineService ruleEngineService,
            QuotaCounterService quotaCounterService,
            EntitlementService entitlementService,
            PlatformTransactionManager transactionManager,
            @Value("${webhook.max-payload-size-bytes:262144}") long maxPayloadSizeBytes,
            @Value("${webhook.payload-compression-threshold-bytes:1024}") int compressionThresholdBytes) {
        this.eventRepository = eventRepository;
        this.subscriptionMatchingCache = subscriptionMatchingCache;
        this.deliveryRepository = deliveryRepository;
        this.outboxMessageRepository = outboxMessageRepository;
        this.workflowTriggerOutboxRepository = workflowTriggerOutboxRepository;
        this.objectMapper = objectMapper;
        this.meterRegistry = meterRegistry;
        this.sequenceGeneratorService = sequenceGeneratorService;
        this.schemaRegistryService = schemaRegistryService;
        this.projectRepository = projectRepository;
        this.ruleEngineService = ruleEngineService;
        this.quotaCounterService = quotaCounterService;
        this.entitlementService = entitlementService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.maxPayloadSizeBytes = maxPayloadSizeBytes;
        this.compressionThresholdBytes = compressionThresholdBytes;
    }

    public EventIngestResponse ingestEvent(UUID projectId, EventIngestRequest request, String idempotencyKey) {
        // Populated by doIngestEvent() with ordering-enabled deliveries that were saved
        // *without* a sequence number. Deliberately generated and assigned only after this
        // method's transaction has committed (see assignSequenceNumbersPostCommit) so that a
        // rollback here -- including the DataIntegrityViolationException idempotency-race path
        // below -- can never burn a sequence number that no delivery ends up carrying.
        List<Delivery> pendingSequenceAssignment = new ArrayList<>();
        // Set by doIngestEvent() to the Organization that should be charged for this Event,
        // and left null when nothing new was stored — a duplicate resolved by idempotency
        // must not be charged twice. Applied only after the commit, for exactly the reason
        // the sequence numbers are: this counter lives in Redis and is not rolled back with
        // the transaction, so incrementing it inside meant a rolled-back ingest still
        // consumed quota. Every abort did it, including the idempotency-race path below.
        AtomicReference<UUID> organizationToCharge = new AtomicReference<>();
        EventIngestResponse response;
        try {
            response = transactionTemplate.execute(status ->
                    doIngestEvent(projectId, request, idempotencyKey, pendingSequenceAssignment,
                            organizationToCharge));
        } catch (DataIntegrityViolationException e) {
            if (idempotencyKey != null) {
                var existingEvent = eventRepository.findByProjectIdAndIdempotencyKey(projectId, idempotencyKey);
                if (existingEvent.isPresent()) {
                    log.info("Idempotency race resolved, returning existing event: {}", existingEvent.get().getId());
                    Counter.builder("events_duplicate_total").register(meterRegistry).increment();
                    return buildResponse(existingEvent.get(), 0);
                }
            }
            throw e;
        }
        chargeQuotaPostCommit(organizationToCharge.get());
        assignSequenceNumbersPostCommit(pendingSequenceAssignment);
        return response;
    }

    /**
     * Charges the Organization for the Event the transaction just committed.
     *
     * <p>Deliberately fire-and-forget and deliberately after the commit: the counter is an
     * approximate Redis value, so failing to charge is better than failing an ingest that has
     * already been accepted — but charging for one that never happened is a customer-visible
     * defect, which is what running this inside the transaction produced.
     */
    private void chargeQuotaPostCommit(UUID organizationId) {
        if (organizationId == null) {
            return;
        }
        try {
            quotaCounterService.increment(organizationId);
        } catch (Exception e) {
            log.error("Failed to charge quota for organization {} after a committed ingest: {}",
                    organizationId, e.getMessage(), e);
        }
    }

    /**
     * Generates and persists sequence numbers for ordering-enabled deliveries created by the
     * ingest transaction that just committed. Each delivery is handled independently: a
     * failure generating or backfilling one does not affect the others, and simply means that
     * one delivery proceeds without ordering enforcement (degrades gracefully) rather than
     * blocking or losing the delivery itself, which was already committed.
     */
    private void assignSequenceNumbersPostCommit(List<Delivery> deliveries) {
        for (Delivery delivery : deliveries) {
            try {
                long sequenceNumber = sequenceGeneratorService.nextSequence(delivery.getEndpointId());
                int updated = deliveryRepository.updateSequenceNumber(delivery.getId(), sequenceNumber);
                if (updated == 0) {
                    log.warn("Delivery {} disappeared before post-commit sequence backfill (seq {} for endpoint {} left unused)",
                            delivery.getId(), sequenceNumber, delivery.getEndpointId());
                } else {
                    log.debug("Assigned sequence {} to delivery {} (endpoint {}) post-commit",
                            sequenceNumber, delivery.getId(), delivery.getEndpointId());
                }
            } catch (Exception e) {
                log.error("Failed to assign post-commit sequence number for delivery {} (endpoint {}): {} -- "
                                + "delivery will proceed without ordering enforcement",
                        delivery.getId(), delivery.getEndpointId(), e.getMessage(), e);
                Counter.builder("webhook_sequence_assignment_failed_total").register(meterRegistry).increment();
            }
        }
    }

    private EventIngestResponse doIngestEvent(UUID projectId, EventIngestRequest request, String idempotencyKey,
            List<Delivery> pendingSequenceAssignment, AtomicReference<UUID> organizationToCharge) {
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
                Counter.builder("events_duplicate_total").register(meterRegistry).increment();
                return buildResponse(event, 0);
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
        Counter.builder("events_ingested_total").register(meterRegistry).increment();
        // Recorded here, charged after the commit — see chargeQuotaPostCommit.
        if (project != null) {
            organizationToCharge.set(project.getOrganizationId());
        }
        log.info("Created event: {} for project: {}", event.getId(), projectId);

        // ── Rules Engine evaluation ────────────────────────────────────
        JsonNode eventJson = null;
        List<RuleEngineService.RuleMatch> ruleMatches = List.of();
        boolean dropEvent = false;
        Set<UUID> ruleRouteEndpoints = new HashSet<>();
        UUID ruleTransformationId = null;

        try {
            eventJson = objectMapper.readTree(event.getDecompressedPayload());
            ruleMatches = ruleEngineService.evaluate(projectId, request.getType(), eventJson, event.getId());

            for (RuleEngineService.RuleMatch match : ruleMatches) {
                if (match.hasDrop()) {
                    dropEvent = true;
                    log.info("Rule '{}' DROP action — skipping deliveries for event {}",
                            match.rule().getName(), event.getId());
                    Counter.builder("rules_drop_total").register(meterRegistry).increment();
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
                Counter.builder("rules_matched_total")
                        .register(meterRegistry).increment(ruleMatches.size());
            }
        } catch (Exception e) {
            log.warn("Rules engine evaluation failed for event {}: {} — proceeding without rules",
                    event.getId(), e.getMessage());
        }

        if (dropEvent) {
            return buildResponse(event, 0);
        }

        // ── Subscription-based deliveries (cached: O(1) exact + O(W) wildcard, zero DB on hit) ──
        List<Subscription> subscriptions = subscriptionMatchingCache.findMatching(projectId, request.getType());
        log.info("Found {} matching subscriptions for event type: {}",
                subscriptions.size(), request.getType());

        // ── Fanout limit — prevent queue flood from 1 event → N deliveries ─
        int totalFanout = subscriptions.size() + ruleRouteEndpoints.size();
        int maxFanout = entitlementService.getMaxFanoutForProject(projectId);
        if (totalFanout > maxFanout) {
            log.warn("Fanout limit exceeded for event type '{}' in project {}: {} targets > max {}",
                    request.getType(), projectId, totalFanout, maxFanout);
            Counter.builder("events_fanout_limited_total")
                    .register(meterRegistry).increment();
            throw new IllegalArgumentException(
                    "Fanout limit exceeded: event would create " + totalFanout +
                    " deliveries (max " + maxFanout + "). Reduce subscriptions or contact support.");
        }

        Set<UUID> deliveredEndpoints = new HashSet<>();
        List<Delivery> deliveriesToSave = new ArrayList<>(subscriptions.size() + ruleRouteEndpoints.size());

        for (Subscription subscription : subscriptions) {
            // Ordering-enabled deliveries are saved without a sequence number here — it is
            // generated and backfilled only after this transaction commits, see
            // assignSequenceNumbersPostCommit. sequenceNumber stays null until then; the
            // worker only enforces ordering once both orderingEnabled and sequenceNumber are
            // set, so a delivery is simply delivered unordered in the narrow window before
            // that backfill lands.
            boolean orderingEnabled = Boolean.TRUE.equals(subscription.getOrderingEnabled());

            // Apply rule transformation override if present
            UUID effectiveTransformId = ruleTransformationId != null
                    ? ruleTransformationId
                    : subscription.getTransformationId();

            Delivery delivery = createDelivery(event, subscription, null, orderingEnabled);
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

        for (Delivery delivery : savedDeliveries) {
            if (Boolean.TRUE.equals(delivery.getOrderingEnabled())) {
                pendingSequenceAssignment.add(delivery);
            }
        }

        List<OutboxMessage> outboxMessages = new ArrayList<>(savedDeliveries.size());
        for (Delivery delivery : savedDeliveries) {
            outboxMessages.add(createOutboxMessage(delivery, projectId));
        }
        outboxMessageRepository.saveAll(outboxMessages);

        int deliveriesCreated = savedDeliveries.size();
        Counter.builder("deliveries_created_total").register(meterRegistry).increment(deliveriesCreated);

        log.info("Created {} deliveries for event: {} (rules matched: {})",
                deliveriesCreated, event.getId(), ruleMatches.size());

        // ── Workflow trigger outbox — durable, same TX as event + deliveries ──
        int depth = WorkflowTriggerService.getCurrentDepth() + 1;
        workflowTriggerOutboxRepository.save(WorkflowTriggerOutbox.builder()
                .projectId(projectId)
                .eventId(event.getId())
                .eventType(request.getType())
                .eventPayload(event.getDecompressedPayload())
                .depth(depth)
                .build());

        return buildResponse(event, deliveriesCreated);
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

            // Compress large payloads to reduce DB storage
            PayloadCompressionUtil.CompressionResult compression = 
                    PayloadCompressionUtil.compress(payload, compressionThresholdBytes);
            
            return Event.builder()
                    .projectId(projectId)
                    .eventType(request.getType())
                    .idempotencyKey(idempotencyKey)
                    .payload(compression.payload())
                    .payloadCompressed(compression.compressed())
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
                .retryDelays(subscription.getRetryDelays() != null ? subscription.getRetryDelays()
                        : RetryLadderDefaults.OUTGOING_DELAYS)
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
                .deliveryOrigin(DeliveryOrigin.RULE)
                .status(DeliveryStatus.PENDING)
                .attemptCount(0)
                .maxAttempts(7)
                .orderingEnabled(false)
                .timeoutSeconds(30)
                .retryDelays(RetryLadderDefaults.OUTGOING_DELAYS)
                .transformationId(transformationId)
                .idempotencyKey(deliveryIdempotencyKey)
                .build();
    }

    private OutboxMessage createOutboxMessage(Delivery delivery, UUID projectId) {
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
            String correlationId = org.slf4j.MDC.get("correlationId");
            
            return OutboxMessage.builder()
                    .aggregateType("Delivery")
                    .aggregateId(delivery.getId())
                    .eventType("DeliveryCreated")
                    .payload(payload)
                    .kafkaTopic(KafkaTopics.DELIVERIES_DISPATCH)
                    .kafkaKey(delivery.getEndpointId().toString())
                    .projectId(projectId)
                    .correlationId(correlationId)
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
