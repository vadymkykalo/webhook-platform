package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.*;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.enums.ReplaySessionStatus;
import com.webhook.platform.api.domain.repository.*;
import com.webhook.platform.api.dto.ReplayEstimateResponse;
import com.webhook.platform.api.dto.ReplayRequest;
import com.webhook.platform.api.dto.ReplaySessionResponse;
import com.webhook.platform.api.exception.ConflictException;
import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CompletableFuture;

@Service
@Slf4j
public class ReplayService {

    private static final int MAX_CONCURRENT_REPLAYS_PER_PROJECT = 2;
    private static final UUID ZERO_UUID = UUID.fromString("00000000-0000-0000-0000-000000000000");

    private final ReplaySessionRepository replaySessionRepository;
    private final EventRepository eventRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final DeliveryRepository deliveryRepository;
    private final OutboxMessageRepository outboxMessageRepository;
    private final ProjectRepository projectRepository;
    private final ObjectMapper objectMapper;
    private final SequenceGeneratorService sequenceGeneratorService;

    private final Counter replayEventsProcessedCounter;
    private final Counter replayDeliveriesCreatedCounter;
    private final Counter replayErrorsCounter;
    private final Timer replayBatchTimer;

    @Value("${replay.batch-size:200}")
    private int batchSize;

    @Value("${replay.batch-delay-ms:50}")
    private long batchDelayMs;

    @Value("${replay.max-events-per-session:500000}")
    private long maxEventsPerSession;

    public ReplayService(
            ReplaySessionRepository replaySessionRepository,
            EventRepository eventRepository,
            SubscriptionRepository subscriptionRepository,
            DeliveryRepository deliveryRepository,
            OutboxMessageRepository outboxMessageRepository,
            ProjectRepository projectRepository,
            ObjectMapper objectMapper,
            SequenceGeneratorService sequenceGeneratorService,
            MeterRegistry meterRegistry) {
        this.replaySessionRepository = replaySessionRepository;
        this.eventRepository = eventRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.deliveryRepository = deliveryRepository;
        this.outboxMessageRepository = outboxMessageRepository;
        this.projectRepository = projectRepository;
        this.objectMapper = objectMapper;
        this.sequenceGeneratorService = sequenceGeneratorService;

        this.replayEventsProcessedCounter = Counter.builder("replay.events.processed")
                .description("Total events processed by replay").register(meterRegistry);
        this.replayDeliveriesCreatedCounter = Counter.builder("replay.deliveries.created")
                .description("Total deliveries created by replay").register(meterRegistry);
        this.replayErrorsCounter = Counter.builder("replay.errors")
                .description("Total replay batch errors").register(meterRegistry);
        this.replayBatchTimer = Timer.builder("replay.batch.duration")
                .description("Replay batch processing time").register(meterRegistry);
    }

    // ========== Public API ==========

    public ReplayEstimateResponse estimate(UUID projectId, ReplayRequest request, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        validateRequest(request);

        long eventCount = countEvents(projectId, request);
        List<Subscription> subs = findActiveSubscriptions(projectId, request);

        long estimatedDeliveries = eventCount * subs.size();
        String warning = null;
        if (eventCount > maxEventsPerSession) {
            warning = "Event count exceeds maximum of " + maxEventsPerSession +
                      ". Consider narrowing the time range or adding filters.";
        }

        return ReplayEstimateResponse.builder()
                .totalEvents(eventCount)
                .estimatedDeliveries(estimatedDeliveries)
                .activeSubscriptions(subs.size())
                .warning(warning)
                .build();
    }

    @Transactional
    public ReplaySessionResponse create(UUID projectId, ReplayRequest request, UUID organizationId, UUID userId) {
        validateProjectOwnership(projectId, organizationId);
        validateRequest(request);

        long running = replaySessionRepository.countByProjectIdAndStatusIn(
                projectId,
                List.of(ReplaySessionStatus.PENDING, ReplaySessionStatus.RUNNING, ReplaySessionStatus.ESTIMATING));
        if (running >= MAX_CONCURRENT_REPLAYS_PER_PROJECT) {
            throw new ConflictException("Maximum " + MAX_CONCURRENT_REPLAYS_PER_PROJECT +
                    " concurrent replay sessions per project. Wait for existing sessions to complete.");
        }

        long eventCount = countEvents(projectId, request);
        if (eventCount == 0) {
            throw new NotFoundException("No events found matching the specified criteria");
        }
        if (eventCount > maxEventsPerSession) {
            throw new ConflictException("Event count " + eventCount + " exceeds maximum of " +
                    maxEventsPerSession + ". Narrow the time range or add filters.");
        }

        ReplaySession session = ReplaySession.builder()
                .projectId(projectId)
                .createdBy(userId)
                .status(ReplaySessionStatus.PENDING)
                .fromDate(request.getFromDate())
                .toDate(request.getToDate())
                .eventType(request.getEventType())
                .endpointId(request.getEndpointId())
                .sourceStatus(request.getSourceStatus())
                .totalEvents((int) eventCount)
                .build();

        session = replaySessionRepository.saveAndFlush(session);
        log.info("Created replay session {} for project {} — {} events", session.getId(), projectId, eventCount);

        executeReplayAsync(session.getId());

        return mapToResponse(session);
    }

    public ReplaySessionResponse get(UUID projectId, UUID sessionId, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        ReplaySession session = replaySessionRepository.findByIdAndProjectId(sessionId, projectId)
                .orElseThrow(() -> new NotFoundException("Replay session not found"));
        return mapToResponse(session);
    }

    public Page<ReplaySessionResponse> list(UUID projectId, UUID organizationId, Pageable pageable) {
        validateProjectOwnership(projectId, organizationId);
        return replaySessionRepository.findByProjectIdOrderByCreatedAtDesc(projectId, pageable)
                .map(this::mapToResponse);
    }

    @Transactional
    public ReplaySessionResponse cancel(UUID projectId, UUID sessionId, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        ReplaySession session = replaySessionRepository.findByIdAndProjectId(sessionId, projectId)
                .orElseThrow(() -> new NotFoundException("Replay session not found"));

        if (session.getStatus() == ReplaySessionStatus.COMPLETED ||
            session.getStatus() == ReplaySessionStatus.CANCELLED ||
            session.getStatus() == ReplaySessionStatus.FAILED) {
            throw new ConflictException("Cannot cancel session in status " + session.getStatus());
        }

        int updated = replaySessionRepository.cancelSession(
                sessionId,
                ReplaySessionStatus.CANCELLING,
                List.of(ReplaySessionStatus.PENDING, ReplaySessionStatus.RUNNING, ReplaySessionStatus.ESTIMATING));

        if (updated == 0) {
            throw new ConflictException("Session already finished or cancelled");
        }

        log.info("Cancelling replay session {} for project {}", sessionId, projectId);
        return get(projectId, sessionId, organizationId);
    }

    // ========== Async execution ==========

    @Async("replayTaskExecutor")
    public CompletableFuture<Void> executeReplayAsync(UUID sessionId) {
        try {
            executeReplay(sessionId);
        } catch (Exception e) {
            log.error("Replay session {} failed with unexpected error", sessionId, e);
            markFailed(sessionId, e.getMessage());
        }
        return CompletableFuture.completedFuture(null);
    }

    private void executeReplay(UUID sessionId) {
        ReplaySession session = replaySessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalStateException("Replay session not found: " + sessionId));

        // Transition to RUNNING
        session.setStatus(ReplaySessionStatus.RUNNING);
        session.setStartedAt(Instant.now());
        replaySessionRepository.saveAndFlush(session);

        UUID projectId = session.getProjectId();
        List<Subscription> subscriptions = findActiveSubscriptions(projectId, toRequest(session));

        if (subscriptions.isEmpty()) {
            session.setStatus(ReplaySessionStatus.COMPLETED);
            session.setCompletedAt(Instant.now());
            session.setErrorMessage("No active subscriptions found");
            replaySessionRepository.saveAndFlush(session);
            return;
        }

        // Filter subscriptions by endpointId if specified
        if (session.getEndpointId() != null) {
            subscriptions = subscriptions.stream()
                    .filter(s -> s.getEndpointId().equals(session.getEndpointId()))
                    .toList();
        }

        // Cursor-based batch processing
        Instant cursorCreatedAt = session.getFromDate().minusNanos(1);
        UUID cursorId = session.getLastProcessedEventId() != null ? session.getLastProcessedEventId() : ZERO_UUID;

        // If resuming, use the last processed event's timestamp
        if (session.getLastProcessedEventId() != null) {
            Event lastEvent = eventRepository.findById(session.getLastProcessedEventId()).orElse(null);
            if (lastEvent != null) {
                cursorCreatedAt = lastEvent.getCreatedAt();
            }
        }

        int totalProcessed = session.getProcessedEvents();
        int totalDeliveries = session.getDeliveriesCreated();
        int totalErrors = session.getErrors();

        while (true) {
            // Check cancellation
            ReplaySession freshSession = replaySessionRepository.findById(sessionId).orElse(null);
            if (freshSession == null ||
                freshSession.getStatus() == ReplaySessionStatus.CANCELLING ||
                freshSession.getStatus() == ReplaySessionStatus.CANCELLED) {
                log.info("Replay session {} cancelled at event {}/{}", sessionId, totalProcessed, session.getTotalEvents());
                markCancelled(sessionId);
                return;
            }

            // Fetch next batch
            List<Event> batch = fetchBatch(projectId, session, cursorCreatedAt, cursorId);
            if (batch.isEmpty()) {
                break;
            }

            // Process batch in a single transaction
            Timer.Sample sample = Timer.start();
            try {
                BatchResult result = processBatch(batch, subscriptions, sessionId);
                totalProcessed += batch.size();
                totalDeliveries += result.deliveriesCreated;
                totalErrors += result.errors;

                replayEventsProcessedCounter.increment(batch.size());
                replayDeliveriesCreatedCounter.increment(result.deliveriesCreated);
                if (result.errors > 0) {
                    replayErrorsCounter.increment(result.errors);
                }
            } catch (Exception e) {
                totalErrors += batch.size();
                replayErrorsCounter.increment(batch.size());
                log.error("Replay batch failed for session {}", sessionId, e);
            }
            sample.stop(replayBatchTimer);

            // Advance cursor
            Event lastEvent = batch.get(batch.size() - 1);
            cursorCreatedAt = lastEvent.getCreatedAt();
            cursorId = lastEvent.getId();

            // Checkpoint progress (every batch)
            updateProgress(sessionId, totalProcessed, totalDeliveries, totalErrors, lastEvent.getId());

            // Backpressure: pause between batches to avoid overwhelming Kafka/DB
            if (batchDelayMs > 0) {
                sleep(batchDelayMs);
            }
        }

        // Mark completed
        markCompleted(sessionId, totalProcessed, totalDeliveries, totalErrors);
        log.info("Replay session {} completed: {} events → {} deliveries ({} errors)",
                sessionId, totalProcessed, totalDeliveries, totalErrors);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public BatchResult processBatch(List<Event> events, List<Subscription> subscriptions, UUID sessionId) {
        int errors = 0;

        List<Delivery> deliveriesToSave = new ArrayList<>();

        for (Event event : events) {
            for (Subscription subscription : subscriptions) {
                // Match event type to subscription (wildcard or exact)
                if (!matchesEventType(event.getEventType(), subscription.getEventType())) {
                    continue;
                }

                try {
                    Long sequenceNumber = null;
                    boolean orderingEnabled = Boolean.TRUE.equals(subscription.getOrderingEnabled());

                    if (orderingEnabled) {
                        sequenceNumber = sequenceGeneratorService.nextSequence(subscription.getEndpointId());
                    }

                    Delivery delivery = Delivery.builder()
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
                            .replaySessionId(sessionId)
                            .build();

                    deliveriesToSave.add(delivery);
                } catch (Exception e) {
                    errors++;
                    log.warn("Failed to create delivery for event {} subscription {}: {}",
                            event.getId(), subscription.getId(), e.getMessage());
                }
            }
        }

        // Batch save all deliveries (generates IDs)
        List<Delivery> savedDeliveries = deliveryRepository.saveAll(deliveriesToSave);
        deliveryRepository.flush();

        // Batch create and save all outbox messages
        List<OutboxMessage> outboxMessages = new ArrayList<>();
        for (Delivery delivery : savedDeliveries) {
            try {
                outboxMessages.add(createOutboxMessage(delivery));
            } catch (Exception e) {
                errors++;
                log.warn("Failed to create outbox message for delivery {}: {}",
                        delivery.getId(), e.getMessage());
            }
        }
        outboxMessageRepository.saveAll(outboxMessages);
        outboxMessageRepository.flush();

        return new BatchResult(savedDeliveries.size() - errors, errors);
    }

    // ========== Helpers ==========

    private List<Event> fetchBatch(UUID projectId, ReplaySession session, Instant cursorCreatedAt, UUID cursorId) {
        if (session.getEventType() != null && !session.getEventType().isBlank()) {
            return eventRepository.findByCursorForReplayWithEventType(
                    projectId, session.getFromDate(), session.getToDate(),
                    session.getEventType(), cursorCreatedAt, cursorId, batchSize);
        }
        return eventRepository.findByCursorForReplay(
                projectId, session.getFromDate(), session.getToDate(),
                cursorCreatedAt, cursorId, batchSize);
    }

    private long countEvents(UUID projectId, ReplayRequest request) {
        if (request.getEventType() != null && !request.getEventType().isBlank()) {
            return eventRepository.countForReplayWithEventType(
                    projectId, request.getFromDate(), request.getToDate(), request.getEventType());
        }
        return eventRepository.countForReplay(projectId, request.getFromDate(), request.getToDate());
    }

    private List<Subscription> findActiveSubscriptions(UUID projectId, ReplayRequest request) {
        if (request.getEventType() != null && !request.getEventType().isBlank()) {
            return subscriptionRepository.findByProjectIdAndEventTypeAndEnabledTrue(projectId, request.getEventType());
        }
        return subscriptionRepository.findByProjectIdAndEnabledTrue(projectId);
    }

    private boolean matchesEventType(String eventType, String pattern) {
        if ("*".equals(pattern) || pattern.equals(eventType)) {
            return true;
        }
        if (pattern.endsWith(".*")) {
            String prefix = pattern.substring(0, pattern.length() - 2);
            return eventType.startsWith(prefix + ".") || eventType.equals(prefix);
        }
        return false;
    }

    private OutboxMessage createOutboxMessage(Delivery delivery) {
        try {
            DeliveryMessage msg = DeliveryMessage.builder()
                    .deliveryId(delivery.getId())
                    .eventId(delivery.getEventId())
                    .endpointId(delivery.getEndpointId())
                    .subscriptionId(delivery.getSubscriptionId())
                    .status(delivery.getStatus().name())
                    .attemptCount(delivery.getAttemptCount())
                    .sequenceNumber(delivery.getSequenceNumber())
                    .orderingEnabled(delivery.getOrderingEnabled())
                    .build();

            String payload = objectMapper.writeValueAsString(msg);
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
            throw new RuntimeException("Failed to create outbox message for replay delivery", e);
        }
    }

    private void updateProgress(UUID sessionId, int processed, int deliveries, int errors, UUID lastEventId) {
        replaySessionRepository.findById(sessionId).ifPresent(session -> {
            session.setProcessedEvents(processed);
            session.setDeliveriesCreated(deliveries);
            session.setErrors(errors);
            session.setLastProcessedEventId(lastEventId);
            replaySessionRepository.saveAndFlush(session);
        });
    }

    private void markCompleted(UUID sessionId, int processed, int deliveries, int errors) {
        replaySessionRepository.findById(sessionId).ifPresent(session -> {
            session.setStatus(ReplaySessionStatus.COMPLETED);
            session.setProcessedEvents(processed);
            session.setDeliveriesCreated(deliveries);
            session.setErrors(errors);
            session.setCompletedAt(Instant.now());
            replaySessionRepository.saveAndFlush(session);
        });
    }

    private void markFailed(UUID sessionId, String errorMessage) {
        replaySessionRepository.findById(sessionId).ifPresent(session -> {
            session.setStatus(ReplaySessionStatus.FAILED);
            session.setErrorMessage(errorMessage != null ? errorMessage.substring(0, Math.min(errorMessage.length(), 2000)) : "Unknown error");
            session.setCompletedAt(Instant.now());
            replaySessionRepository.saveAndFlush(session);
        });
    }

    private void markCancelled(UUID sessionId) {
        replaySessionRepository.findById(sessionId).ifPresent(session -> {
            session.setStatus(ReplaySessionStatus.CANCELLED);
            session.setCancelledAt(Instant.now());
            replaySessionRepository.saveAndFlush(session);
        });
    }

    private void validateProjectOwnership(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
    }

    private void validateRequest(ReplayRequest request) {
        if (request.getFromDate().isAfter(request.getToDate())) {
            throw new IllegalArgumentException("fromDate must be before toDate");
        }
        Duration range = Duration.between(request.getFromDate(), request.getToDate());
        if (range.toDays() > 90) {
            throw new IllegalArgumentException("Time range cannot exceed 90 days");
        }
    }

    private ReplayRequest toRequest(ReplaySession session) {
        return ReplayRequest.builder()
                .fromDate(session.getFromDate())
                .toDate(session.getToDate())
                .eventType(session.getEventType())
                .endpointId(session.getEndpointId())
                .sourceStatus(session.getSourceStatus())
                .build();
    }

    private ReplaySessionResponse mapToResponse(ReplaySession session) {
        double progressPercent = session.getTotalEvents() > 0
                ? (double) session.getProcessedEvents() / session.getTotalEvents() * 100.0
                : 0.0;

        Long durationMs = null;
        if (session.getStartedAt() != null) {
            Instant end = session.getCompletedAt() != null ? session.getCompletedAt() : Instant.now();
            durationMs = Duration.between(session.getStartedAt(), end).toMillis();
        }

        return ReplaySessionResponse.builder()
                .id(session.getId())
                .projectId(session.getProjectId())
                .createdBy(session.getCreatedBy())
                .status(session.getStatus())
                .fromDate(session.getFromDate())
                .toDate(session.getToDate())
                .eventType(session.getEventType())
                .endpointId(session.getEndpointId())
                .sourceStatus(session.getSourceStatus())
                .totalEvents(session.getTotalEvents())
                .processedEvents(session.getProcessedEvents())
                .deliveriesCreated(session.getDeliveriesCreated())
                .errors(session.getErrors())
                .progressPercent(Math.round(progressPercent * 10.0) / 10.0)
                .errorMessage(session.getErrorMessage())
                .startedAt(session.getStartedAt())
                .completedAt(session.getCompletedAt())
                .cancelledAt(session.getCancelledAt())
                .createdAt(session.getCreatedAt())
                .durationMs(durationMs)
                .build();
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    record BatchResult(int deliveriesCreated, int errors) {}
}
