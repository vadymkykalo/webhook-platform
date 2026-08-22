package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.IncomingDestination;
import com.webhook.platform.api.domain.entity.IncomingEvent;
import com.webhook.platform.api.domain.entity.IncomingForwardAttempt;
import com.webhook.platform.api.domain.entity.IncomingSource;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.IncomingDestinationRepository;
import com.webhook.platform.api.domain.repository.IncomingEventRepository;
import com.webhook.platform.api.domain.repository.IncomingForwardAttemptRepository;
import com.webhook.platform.api.domain.repository.IncomingSourceRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.IncomingBulkReplayRequest;
import com.webhook.platform.api.dto.IncomingBulkReplayResponse;
import com.webhook.platform.api.dto.IncomingEventResponse;
import com.webhook.platform.api.dto.IncomingForwardAttemptResponse;
import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Slf4j
public class IncomingEventService {

    private static final int BULK_REPLAY_BATCH_SIZE = 100;

    private final IncomingEventRepository eventRepository;
    private final IncomingSourceRepository sourceRepository;
    private final IncomingForwardAttemptRepository forwardAttemptRepository;
    private final IncomingDestinationRepository destinationRepository;
    private final OutboxMessageRepository outboxMessageRepository;
    private final ProjectRepository projectRepository;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate txTemplate;

    public IncomingEventService(
            IncomingEventRepository eventRepository,
            IncomingSourceRepository sourceRepository,
            IncomingForwardAttemptRepository forwardAttemptRepository,
            IncomingDestinationRepository destinationRepository,
            OutboxMessageRepository outboxMessageRepository,
            ProjectRepository projectRepository,
            ObjectMapper objectMapper,
            PlatformTransactionManager txManager) {
        this.eventRepository = eventRepository;
        this.sourceRepository = sourceRepository;
        this.forwardAttemptRepository = forwardAttemptRepository;
        this.destinationRepository = destinationRepository;
        this.outboxMessageRepository = outboxMessageRepository;
        this.projectRepository = projectRepository;
        this.objectMapper = objectMapper;
        this.txTemplate = new TransactionTemplate(txManager);
    }

    /**
     * Defence in depth over the tenant filter, and the reason a bad project id is a 404.
     *
     * <p>It no longer compares organizations: {@code Project} carries {@code @TenantId}, so this
     * lookup only ever sees projects inside the caller's organization (ADR-0006). What is left is
     * turning "no such project here" into a {@link NotFoundException} rather than letting the
     * caller get an empty list back.
     *
     * <p>Another organization's project is now a 404 rather than the 403 it used to be. That is
     * the intended consequence: the old answer told a caller that a project id it had no access to
     * existed.
     */
    private void validateProjectOwnership(UUID projectId) {
        projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));
    }

    private void validateEventAccess(IncomingEvent event, AuthContext auth) {
        IncomingSource source = sourceRepository.findById(event.getIncomingSourceId())
                .orElseThrow(() -> new NotFoundException("Incoming source not found"));
        validateProjectOwnership(source.getProjectId());
        auth.validateProjectAccess(source.getProjectId());
    }

    public Page<IncomingEventResponse> listEvents(UUID projectId, UUID sourceId, Pageable pageable) {
        validateProjectOwnership(projectId);

        Page<IncomingEvent> events;
        if (sourceId != null) {
            IncomingSource source = sourceRepository.findById(sourceId)
                    .orElseThrow(() -> new NotFoundException("Incoming source not found"));
            if (!source.getProjectId().equals(projectId)) {
                throw new ForbiddenException("Source does not belong to project");
            }
            events = eventRepository.findByIncomingSourceId(sourceId, pageable);
        } else {
            events = eventRepository.findByProjectId(projectId, pageable);
        }

        // Batch-fetch source names for the page — eliminates N+1 per-row lookup
        Map<UUID, String> sourceNames = resolveSourceNames(events.getContent());

        return events.map(event -> mapToResponse(event, sourceNames));
    }

    public IncomingEventResponse getEvent(UUID id, AuthContext auth) {
        IncomingEvent event = eventRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Incoming event not found"));
        validateEventAccess(event, auth);
        return mapToResponse(event);
    }

    public Page<IncomingForwardAttemptResponse> getEventAttempts(UUID eventId, AuthContext auth, Pageable pageable) {
        IncomingEvent event = eventRepository.findById(eventId)
                .orElseThrow(() -> new NotFoundException("Incoming event not found"));
        validateEventAccess(event, auth);

        return forwardAttemptRepository.findByIncomingEventId(eventId, pageable)
                .map(attempt -> IncomingForwardAttemptResponse.builder()
                        .id(attempt.getId())
                        .incomingEventId(attempt.getIncomingEventId())
                        .destinationId(attempt.getDestinationId())
                        .attemptNumber(attempt.getAttemptNumber())
                        .status(attempt.getStatus())
                        .startedAt(attempt.getStartedAt())
                        .finishedAt(attempt.getFinishedAt())
                        .responseCode(attempt.getResponseCode())
                        .responseHeadersJson(attempt.getResponseHeadersJson())
                        .responseBodySnippet(attempt.getResponseBodySnippet())
                        .errorMessage(attempt.getErrorMessage())
                        .nextRetryAt(attempt.getNextRetryAt())
                        .createdAt(attempt.getCreatedAt())
                        .build());
    }

    @Transactional
    public int replayEvent(UUID eventId, AuthContext auth) {
        IncomingEvent event = eventRepository.findById(eventId)
                .orElseThrow(() -> new NotFoundException("Incoming event not found"));
        validateEventAccess(event, auth);

        List<IncomingDestination> destinations = destinationRepository
                .findByIncomingSourceIdAndEnabledTrue(event.getIncomingSourceId());

        if (destinations.isEmpty()) {
            throw new IllegalStateException("No enabled destinations for this source");
        }

        UUID projectId = resolveProjectIdFromSource(event.getIncomingSourceId());
        int replayed = 0;
        for (IncomingDestination destination : destinations) {
            Integer maxAttempt = forwardAttemptRepository.findMaxAttemptNumber(eventId, destination.getId());
            int nextAttempt = (maxAttempt != null ? maxAttempt : 0) + 1;

            IncomingForwardAttempt attempt = IncomingForwardAttempt.builder()
                    .incomingEventId(eventId)
                    .destinationId(destination.getId())
                    .attemptNumber(nextAttempt)
                    .status(ForwardAttemptStatus.PENDING)
                    .build();
            forwardAttemptRepository.save(attempt);

            try {
                IncomingForwardMessage forwardMessage = IncomingForwardMessage.builder()
                        .incomingEventId(eventId)
                        .destinationId(destination.getId())
                        .incomingSourceId(event.getIncomingSourceId())
                        .attemptCount(nextAttempt)
                        .replay(true)
                        .build();

                String payload = objectMapper.writeValueAsString(forwardMessage);
                OutboxMessage outboxMessage = OutboxMessage.builder()
                        .aggregateType("IncomingForward")
                        .aggregateId(eventId)
                        .eventType("IncomingForwardReplay")
                        .payload(payload)
                        .kafkaTopic(KafkaTopics.INCOMING_FORWARD_DISPATCH)
                        .kafkaKey(destination.getId().toString())
                        .projectId(projectId)
                        .status(OutboxStatus.PENDING)
                        .retryCount(0)
                        .build();
                outboxMessageRepository.save(outboxMessage);
                replayed++;
            } catch (Exception e) {
                log.error("Failed to create replay outbox message: eventId={}, destId={}",
                        eventId, destination.getId(), e);
            }
        }

        log.info("Replayed incoming event {} to {} destinations", eventId, replayed);
        return replayed;
    }

    public IncomingBulkReplayResponse bulkReplay(UUID projectId, IncomingBulkReplayRequest request) {
        validateProjectOwnership(projectId);

        // Validate source belongs to project
        IncomingSource source = sourceRepository.findById(request.getSourceId())
                .orElseThrow(() -> new NotFoundException("Incoming source not found"));
        if (!source.getProjectId().equals(projectId)) {
            throw new ForbiddenException("Source does not belong to this project");
        }

        List<IncomingDestination> destinations = destinationRepository
                .findByIncomingSourceIdAndEnabledTrue(request.getSourceId());
        if (destinations.isEmpty()) {
            throw new IllegalStateException("No enabled destinations for this source");
        }

        int maxEvents = request.getMaxEvents() != null ? Math.min(request.getMaxEvents(), 5000) : 1000;

        // Resolve events to replay
        List<IncomingEvent> events;
        if (request.getEventIds() != null && !request.getEventIds().isEmpty()) {
            events = eventRepository.findAllById(request.getEventIds());
            // Filter to only events belonging to this source
            events = events.stream()
                    .filter(e -> e.getIncomingSourceId().equals(request.getSourceId()))
                    .limit(maxEvents)
                    .toList();
        } else {
            events = eventRepository.findForBulkReplay(
                    request.getSourceId(),
                    request.getFrom(),
                    request.getTo(),
                    request.getVerified(),
                    PageRequest.of(0, maxEvents));
        }

        if (events.isEmpty()) {
            return IncomingBulkReplayResponse.builder()
                    .status("bulk_replayed")
                    .sourceId(request.getSourceId())
                    .eventsReplayed(0)
                    .totalForwardAttempts(0)
                    .build();
        }

        // Process in batches to avoid long-held DB locks and connection pool exhaustion
        int totalAttempts = 0;
        for (int i = 0; i < events.size(); i += BULK_REPLAY_BATCH_SIZE) {
            List<IncomingEvent> batch = events.subList(i, Math.min(i + BULK_REPLAY_BATCH_SIZE, events.size()));
            totalAttempts += processBulkReplayBatch(batch, destinations, source.getId(), projectId);
        }

        log.info("Bulk replayed {} events to {} destinations ({} total attempts) for source {}",
                events.size(), destinations.size(), totalAttempts, request.getSourceId());

        return IncomingBulkReplayResponse.builder()
                .status("bulk_replayed")
                .sourceId(request.getSourceId())
                .eventsReplayed(events.size())
                .totalForwardAttempts(totalAttempts)
                .build();
    }

    private int processBulkReplayBatch(List<IncomingEvent> events, List<IncomingDestination> destinations,
                                       UUID sourceId, UUID projectId) {
        Integer result = txTemplate.execute(status -> {
            List<IncomingForwardAttempt> attemptsToSave = new ArrayList<>();
            List<OutboxMessage> outboxToSave = new ArrayList<>();
            int errors = 0;

            for (IncomingEvent event : events) {
                for (IncomingDestination destination : destinations) {
                    Integer maxAttempt = forwardAttemptRepository.findMaxAttemptNumber(event.getId(), destination.getId());
                    int nextAttempt = (maxAttempt != null ? maxAttempt : 0) + 1;

                    attemptsToSave.add(IncomingForwardAttempt.builder()
                            .incomingEventId(event.getId())
                            .destinationId(destination.getId())
                            .attemptNumber(nextAttempt)
                            .status(ForwardAttemptStatus.PENDING)
                            .build());

                    try {
                        IncomingForwardMessage forwardMessage = IncomingForwardMessage.builder()
                                .incomingEventId(event.getId())
                                .destinationId(destination.getId())
                                .incomingSourceId(sourceId)
                                .attemptCount(nextAttempt)
                                .replay(true)
                                .build();

                        outboxToSave.add(OutboxMessage.builder()
                                .aggregateType("IncomingForward")
                                .aggregateId(event.getId())
                                .eventType("IncomingForwardBulkReplay")
                                .payload(objectMapper.writeValueAsString(forwardMessage))
                                .kafkaTopic(KafkaTopics.INCOMING_FORWARD_DISPATCH)
                                .kafkaKey(destination.getId().toString())
                                .projectId(projectId)
                                .status(OutboxStatus.PENDING)
                                .retryCount(0)
                                .build());
                    } catch (Exception e) {
                        log.error("Failed to create bulk replay outbox: eventId={}, destId={}",
                                event.getId(), destination.getId(), e);
                        errors++;
                    }
                }
            }

            forwardAttemptRepository.saveAll(attemptsToSave);
            outboxMessageRepository.saveAll(outboxToSave);
            return outboxToSave.size();
        });
        return result != null ? result : 0;
    }

    private UUID resolveProjectIdFromSource(UUID sourceId) {
        return sourceRepository.findById(sourceId)
                .map(IncomingSource::getProjectId).orElse(null);
    }

    private Map<UUID, String> resolveSourceNames(List<IncomingEvent> events) {
        List<UUID> sourceIds = events.stream()
                .map(IncomingEvent::getIncomingSourceId)
                .distinct()
                .collect(Collectors.toList());
        if (sourceIds.isEmpty()) return Map.of();
        return sourceRepository.findAllById(sourceIds).stream()
                .collect(Collectors.toMap(IncomingSource::getId, IncomingSource::getName, (a, b) -> a));
    }

    private IncomingEventResponse mapToResponse(IncomingEvent event, Map<UUID, String> sourceNames) {
        return IncomingEventResponse.builder()
                .sourceName(sourceNames.get(event.getIncomingSourceId()))
                .id(event.getId())
                .incomingSourceId(event.getIncomingSourceId())
                .requestId(event.getRequestId())
                .method(event.getMethod())
                .path(event.getPath())
                .queryParams(event.getQueryParams())
                .headersJson(event.getHeadersJson())
                .bodyRaw(event.getBodyRaw())
                .bodySha256(event.getBodySha256())
                .contentType(event.getContentType())
                .clientIp(event.getClientIp())
                .userAgent(event.getUserAgent())
                .verified(event.getVerified())
                .verificationError(event.getVerificationError())
                .receivedAt(event.getReceivedAt())
                .build();
    }

    private IncomingEventResponse mapToResponse(IncomingEvent event) {
        String sourceName = null;
        try {
            sourceName = sourceRepository.findById(event.getIncomingSourceId())
                    .map(IncomingSource::getName).orElse(null);
        } catch (Exception ignored) {}
        IncomingEventResponse resp = mapToResponse(event, Map.of());
        resp.setSourceName(sourceName);
        return resp;
    }
}
