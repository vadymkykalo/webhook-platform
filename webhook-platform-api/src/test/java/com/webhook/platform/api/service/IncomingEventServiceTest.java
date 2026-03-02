package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.IncomingDestination;
import com.webhook.platform.api.domain.entity.IncomingEvent;
import com.webhook.platform.api.domain.entity.IncomingForwardAttempt;
import com.webhook.platform.api.domain.entity.IncomingSource;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.repository.IncomingDestinationRepository;
import com.webhook.platform.api.domain.repository.IncomingEventRepository;
import com.webhook.platform.api.domain.repository.IncomingForwardAttemptRepository;
import com.webhook.platform.api.domain.repository.IncomingSourceRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.IncomingEventResponse;
import com.webhook.platform.api.dto.IncomingForwardAttemptResponse;
import com.webhook.platform.api.exception.NotFoundException;
import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.common.enums.IncomingAuthType;
import com.webhook.platform.common.enums.IncomingSourceStatus;
import com.webhook.platform.common.enums.ProviderType;
import com.webhook.platform.common.enums.VerificationMode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IncomingEventServiceTest {

    @Mock
    private IncomingEventRepository eventRepository;
    @Mock
    private IncomingSourceRepository sourceRepository;
    @Mock
    private IncomingForwardAttemptRepository forwardAttemptRepository;
    @Mock
    private IncomingDestinationRepository destinationRepository;
    @Mock
    private OutboxMessageRepository outboxMessageRepository;
    @Mock
    private ProjectRepository projectRepository;

    private IncomingEventService service;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final UUID orgId = UUID.randomUUID();
    private final UUID projectId = UUID.randomUUID();
    private final UUID sourceId = UUID.randomUUID();
    private final UUID eventId = UUID.randomUUID();
    private final UUID destId = UUID.randomUUID();

    private Project project;
    private IncomingSource source;

    @BeforeEach
    void setUp() {
        service = new IncomingEventService(
                eventRepository, sourceRepository, forwardAttemptRepository,
                destinationRepository, outboxMessageRepository, projectRepository,
                objectMapper
        );
        project = Project.builder().id(projectId).organizationId(orgId).name("Test").build();
        source = IncomingSource.builder()
                .id(sourceId).projectId(projectId).name("Test Source")
                .slug("test").providerType(ProviderType.GENERIC)
                .status(IncomingSourceStatus.ACTIVE)
                .ingressPathToken("tok").verificationMode(VerificationMode.NONE)
                .createdAt(Instant.now()).updatedAt(Instant.now())
                .build();
    }

    private IncomingEvent buildEvent() {
        return IncomingEvent.builder()
                .id(eventId).incomingSourceId(sourceId)
                .requestId("req-123").method("POST").path("/ingress/tok")
                .bodyRaw("{\"data\":1}").contentType("application/json")
                .clientIp("127.0.0.1").receivedAt(Instant.now())
                .build();
    }

    private void stubAccess() {
        when(sourceRepository.findById(sourceId)).thenReturn(Optional.of(source));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
    }

    @Test
    void listEvents_byProject() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        IncomingEvent event = buildEvent();
        when(eventRepository.findByProjectId(eq(projectId), any()))
                .thenReturn(new PageImpl<>(List.of(event)));
        when(sourceRepository.findById(sourceId)).thenReturn(Optional.of(source));

        Page<IncomingEventResponse> page = service.listEvents(projectId, orgId, null, PageRequest.of(0, 20));

        assertThat(page.getTotalElements()).isEqualTo(1);
        assertThat(page.getContent().get(0).getRequestId()).isEqualTo("req-123");
        assertThat(page.getContent().get(0).getSourceName()).isEqualTo("Test Source");
    }

    @Test
    void listEvents_bySourceId() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        IncomingEvent event = buildEvent();
        when(eventRepository.findByIncomingSourceId(eq(sourceId), any()))
                .thenReturn(new PageImpl<>(List.of(event)));
        when(sourceRepository.findById(sourceId)).thenReturn(Optional.of(source));

        Page<IncomingEventResponse> page = service.listEvents(projectId, orgId, sourceId, PageRequest.of(0, 20));

        assertThat(page.getTotalElements()).isEqualTo(1);
    }

    @Test
    void getEvent_success() {
        IncomingEvent event = buildEvent();
        when(eventRepository.findById(eventId)).thenReturn(Optional.of(event));
        stubAccess();

        IncomingEventResponse response = service.getEvent(eventId, orgId);

        assertThat(response.getId()).isEqualTo(eventId);
        assertThat(response.getMethod()).isEqualTo("POST");
        assertThat(response.getBodyRaw()).isEqualTo("{\"data\":1}");
    }

    @Test
    void getEvent_notFound() {
        when(eventRepository.findById(eventId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getEvent(eventId, orgId))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void getEventAttempts_success() {
        IncomingEvent event = buildEvent();
        when(eventRepository.findById(eventId)).thenReturn(Optional.of(event));
        stubAccess();

        IncomingForwardAttempt attempt = IncomingForwardAttempt.builder()
                .id(UUID.randomUUID()).incomingEventId(eventId).destinationId(destId)
                .attemptNumber(1).status(ForwardAttemptStatus.SUCCESS)
                .responseCode(200).createdAt(Instant.now())
                .build();
        when(forwardAttemptRepository.findByIncomingEventId(eq(eventId), any()))
                .thenReturn(new PageImpl<>(List.of(attempt)));

        Page<IncomingForwardAttemptResponse> page = service.getEventAttempts(eventId, orgId, PageRequest.of(0, 20));

        assertThat(page.getTotalElements()).isEqualTo(1);
        assertThat(page.getContent().get(0).getStatus()).isEqualTo(ForwardAttemptStatus.SUCCESS);
        assertThat(page.getContent().get(0).getResponseCode()).isEqualTo(200);
    }

    @Test
    void replayEvent_success() {
        IncomingEvent event = buildEvent();
        when(eventRepository.findById(eventId)).thenReturn(Optional.of(event));
        stubAccess();

        IncomingDestination dest = IncomingDestination.builder()
                .id(destId).incomingSourceId(sourceId)
                .url("https://example.com/hook")
                .authType(IncomingAuthType.NONE).enabled(true)
                .maxAttempts(5).timeoutSeconds(30).retryDelays("60")
                .build();
        when(destinationRepository.findByIncomingSourceIdAndEnabledTrue(sourceId)).thenReturn(List.of(dest));
        when(forwardAttemptRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(outboxMessageRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        int replayed = service.replayEvent(eventId, orgId);

        assertThat(replayed).isEqualTo(1);
        verify(forwardAttemptRepository).save(argThat(a ->
                a.getStatus() == ForwardAttemptStatus.PENDING && a.getAttemptNumber() == 1));
        verify(outboxMessageRepository).save(argThat(o ->
                o.getEventType().equals("IncomingForwardReplay")));
    }

    @Test
    void replayEvent_noDestinations_throws() {
        IncomingEvent event = buildEvent();
        when(eventRepository.findById(eventId)).thenReturn(Optional.of(event));
        stubAccess();
        when(destinationRepository.findByIncomingSourceIdAndEnabledTrue(sourceId)).thenReturn(List.of());

        assertThatThrownBy(() -> service.replayEvent(eventId, orgId))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("No enabled destinations");
    }

    @Test
    void replayEvent_notFound() {
        when(eventRepository.findById(eventId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.replayEvent(eventId, orgId))
                .isInstanceOf(NotFoundException.class);
    }
}
