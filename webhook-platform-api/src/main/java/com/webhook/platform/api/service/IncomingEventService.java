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
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class IncomingEventService {

    private final IncomingEventRepository eventRepository;
    private final IncomingSourceRepository sourceRepository;
    private final IncomingForwardAttemptRepository forwardAttemptRepository;
    private final IncomingDestinationRepository destinationRepository;
    private final OutboxMessageRepository outboxMessageRepository;
    private final ProjectRepository projectRepository;
    private final ObjectMapper objectMapper;

    public IncomingEventService(
            IncomingEventRepository eventRepository,
            IncomingSourceRepository sourceRepository,
            IncomingForwardAttemptRepository forwardAttemptRepository,
            IncomingDestinationRepository destinationRepository,
            OutboxMessageRepository outboxMessageRepository,
            ProjectRepository projectRepository,
            ObjectMapper objectMapper) {
        this.eventRepository = eventRepository;
        this.sourceRepository = sourceRepository;
        this.forwardAttemptRepository = forwardAttemptRepository;
        this.destinationRepository = destinationRepository;
        this.outboxMessageRepository = outboxMessageRepository;
        this.projectRepository = projectRepository;
        this.objectMapper = objectMapper;
    }

    private void validateProjectOwnership(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
    }

    private void validateEventAccess(IncomingEvent event, UUID organizationId) {
        IncomingSource source = sourceRepository.findById(event.getIncomingSourceId())
                .orElseThrow(() -> new NotFoundException("Incoming source not found"));
        validateProjectOwnership(source.getProjectId(), organizationId);
    }

    public Page<IncomingEventResponse> listEvents(UUID projectId, UUID organizationId, UUID sourceId, Pageable pageable) {
        validateProjectOwnership(projectId, organizationId);

        Page<IncomingEvent> events;
        if (sourceId != null) {
            events = eventRepository.findByIncomingSourceId(sourceId, pageable);
        } else {
            events = eventRepository.findByProjectId(projectId, pageable);
        }

        return events.map(this::mapToResponse);
    }

    public IncomingEventResponse getEvent(UUID id, UUID organizationId) {
        IncomingEvent event = eventRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Incoming event not found"));
        validateEventAccess(event, organizationId);
        return mapToResponse(event);
    }

    public Page<IncomingForwardAttemptResponse> getEventAttempts(UUID eventId, UUID organizationId, Pageable pageable) {
        IncomingEvent event = eventRepository.findById(eventId)
                .orElseThrow(() -> new NotFoundException("Incoming event not found"));
        validateEventAccess(event, organizationId);

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
    public int replayEvent(UUID eventId, UUID organizationId) {
        IncomingEvent event = eventRepository.findById(eventId)
                .orElseThrow(() -> new NotFoundException("Incoming event not found"));
        validateEventAccess(event, organizationId);

        List<IncomingDestination> destinations = destinationRepository
                .findByIncomingSourceIdAndEnabledTrue(event.getIncomingSourceId());

        if (destinations.isEmpty()) {
            throw new IllegalStateException("No enabled destinations for this source");
        }

        int replayed = 0;
        for (IncomingDestination destination : destinations) {
            IncomingForwardAttempt attempt = IncomingForwardAttempt.builder()
                    .incomingEventId(eventId)
                    .destinationId(destination.getId())
                    .attemptNumber(1)
                    .status(ForwardAttemptStatus.PENDING)
                    .build();
            forwardAttemptRepository.save(attempt);

            try {
                IncomingForwardMessage forwardMessage = IncomingForwardMessage.builder()
                        .incomingEventId(eventId)
                        .destinationId(destination.getId())
                        .incomingSourceId(event.getIncomingSourceId())
                        .attemptCount(0)
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

    @Transactional
    public IncomingBulkReplayResponse bulkReplay(UUID projectId, IncomingBulkReplayRequest request, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);

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

        int totalAttempts = 0;
        for (IncomingEvent event : events) {
            for (IncomingDestination destination : destinations) {
                IncomingForwardAttempt attempt = IncomingForwardAttempt.builder()
                        .incomingEventId(event.getId())
                        .destinationId(destination.getId())
                        .attemptNumber(1)
                        .status(ForwardAttemptStatus.PENDING)
                        .build();
                forwardAttemptRepository.save(attempt);

                try {
                    IncomingForwardMessage forwardMessage = IncomingForwardMessage.builder()
                            .incomingEventId(event.getId())
                            .destinationId(destination.getId())
                            .incomingSourceId(source.getId())
                            .attemptCount(0)
                            .replay(true)
                            .build();

                    OutboxMessage outboxMessage = OutboxMessage.builder()
                            .aggregateType("IncomingForward")
                            .aggregateId(event.getId())
                            .eventType("IncomingForwardBulkReplay")
                            .payload(objectMapper.writeValueAsString(forwardMessage))
                            .kafkaTopic(KafkaTopics.INCOMING_FORWARD_DISPATCH)
                            .kafkaKey(destination.getId().toString())
                            .status(OutboxStatus.PENDING)
                            .retryCount(0)
                            .build();
                    outboxMessageRepository.save(outboxMessage);
                    totalAttempts++;
                } catch (Exception e) {
                    log.error("Failed to create bulk replay outbox: eventId={}, destId={}",
                            event.getId(), destination.getId(), e);
                }
            }
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

    private IncomingEventResponse mapToResponse(IncomingEvent event) {
        String sourceName = null;
        try {
            sourceName = sourceRepository.findById(event.getIncomingSourceId())
                    .map(IncomingSource::getName).orElse(null);
        } catch (Exception ignored) {}

        return IncomingEventResponse.builder()
                .id(event.getId())
                .incomingSourceId(event.getIncomingSourceId())
                .sourceName(sourceName)
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
}
