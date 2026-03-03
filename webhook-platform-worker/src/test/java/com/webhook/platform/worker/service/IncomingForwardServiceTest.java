package com.webhook.platform.worker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.common.enums.IncomingAuthType;
import com.webhook.platform.worker.domain.entity.IncomingDestination;
import com.webhook.platform.worker.domain.entity.IncomingEvent;
import com.webhook.platform.worker.domain.entity.IncomingForwardAttempt;
import com.webhook.platform.worker.domain.repository.IncomingDestinationRepository;
import com.webhook.platform.worker.domain.repository.IncomingEventRepository;
import com.webhook.platform.worker.domain.repository.IncomingForwardAttemptRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Tests for the claim-based idempotency logic in IncomingForwardService.
 *
 * Verifies that:
 *   - First dispatch claims the existing PENDING row (created by IngressService)
 *     via atomic UPDATE, instead of INSERT-ing a duplicate.
 *   - Retry dispatch uses the attemptNumber from the scheduler message directly,
 *     without re-claiming (scheduler already set PROCESSING).
 *   - SSRF failures claim-then-update the existing row instead of INSERT-ing.
 *   - Duplicate Kafka deliveries are safely idempotent (claim returns 0 -> skip).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class IncomingForwardServiceTest {

    @Mock
    private IncomingEventRepository eventRepository;
    @Mock
    private IncomingDestinationRepository destinationRepository;
    @Mock
    private IncomingForwardAttemptRepository attemptRepository;
    @Mock
    private WebClient.Builder webClientBuilder;
    @Mock
    private TransactionTemplate transactionTemplate;

    private IncomingForwardService service;

    private final UUID eventId = UUID.randomUUID();
    private final UUID destinationId = UUID.randomUUID();
    private final UUID sourceId = UUID.randomUUID();

    @SuppressWarnings("unchecked")
    private void stubTransactionTemplate() {
        when(transactionTemplate.execute(any())).thenAnswer(inv -> {
            var callback = inv.getArgument(0, TransactionCallback.class);
            return callback.doInTransaction(null);
        });
        lenient().doAnswer(inv -> {
            Consumer<Object> callback = inv.getArgument(0, Consumer.class);
            callback.accept(null);
            return null;
        }).when(transactionTemplate).executeWithoutResult(any());
    }

    @BeforeEach
    void setUp() {
        stubTransactionTemplate();

        WebClient mockWebClient = WebClient.builder().build();
        when(webClientBuilder.clientConnector(any())).thenReturn(webClientBuilder);
        when(webClientBuilder.defaultHeader(anyString(), anyString())).thenReturn(webClientBuilder);
        when(webClientBuilder.build()).thenReturn(mockWebClient);

        service = new IncomingForwardService(
                eventRepository, destinationRepository, attemptRepository,
                webClientBuilder, new ObjectMapper(),
                "test_encryption_key_32_chars_pad", "test_salt",
                true, List.of(),
                new SimpleMeterRegistry(), transactionTemplate
        );
    }

    private IncomingEvent buildEvent() {
        return IncomingEvent.builder()
                .id(eventId).incomingSourceId(sourceId)
                .requestId("req-1").method("POST")
                .bodyRaw("{\"data\":1}").contentType("application/json")
                .receivedAt(Instant.now())
                .build();
    }

    private IncomingDestination buildDestination() {
        return IncomingDestination.builder()
                .id(destinationId).incomingSourceId(sourceId)
                .url("https://example.com/hook")
                .authType(IncomingAuthType.NONE)
                .enabled(true).maxAttempts(5).timeoutSeconds(30)
                .retryDelays("60,300")
                .build();
    }

    // -- First dispatch: claims existing PENDING row --

    @Test
    void firstDispatch_claimsExistingPendingRow_notInsert() {
        when(eventRepository.findById(eventId)).thenReturn(Optional.of(buildEvent()));
        when(destinationRepository.findById(destinationId)).thenReturn(Optional.of(buildDestination()));
        when(attemptRepository.claimForProcessing(eventId, destinationId, 1)).thenReturn(1);

        IncomingForwardMessage message = IncomingForwardMessage.builder()
                .incomingEventId(eventId).destinationId(destinationId)
                .incomingSourceId(sourceId).attemptCount(0).replay(false)
                .build();

        service.processForward(message);

        // Must claim via UPDATE, never INSERT
        verify(attemptRepository).claimForProcessing(eventId, destinationId, 1);
        verify(attemptRepository, never()).saveAndFlush(any(IncomingForwardAttempt.class));
    }

    @Test
    void firstDispatch_alreadyClaimed_skipsIdempotently() {
        when(eventRepository.findById(eventId)).thenReturn(Optional.of(buildEvent()));
        when(destinationRepository.findById(destinationId)).thenReturn(Optional.of(buildDestination()));
        when(attemptRepository.claimForProcessing(eventId, destinationId, 1)).thenReturn(0);

        IncomingForwardMessage message = IncomingForwardMessage.builder()
                .incomingEventId(eventId).destinationId(destinationId)
                .incomingSourceId(sourceId).attemptCount(0).replay(false)
                .build();

        service.processForward(message);

        verify(attemptRepository).claimForProcessing(eventId, destinationId, 1);
        // Should not proceed to HTTP call
        verify(attemptRepository, never()).findByIncomingEventIdAndDestinationIdOrderByAttemptNumberDesc(any(), any());
    }

    // -- Retry dispatch: scheduler already claimed, no re-claim --

    @Test
    void retryDispatch_usesAttemptCountDirectly_noReClaim() {
        when(eventRepository.findById(eventId)).thenReturn(Optional.of(buildEvent()));
        when(destinationRepository.findById(destinationId)).thenReturn(Optional.of(buildDestination()));

        IncomingForwardMessage message = IncomingForwardMessage.builder()
                .incomingEventId(eventId).destinationId(destinationId)
                .incomingSourceId(sourceId).attemptCount(2).replay(false)
                .build();

        service.processForward(message);

        // Must NOT call claimForProcessing -- scheduler already did it
        verify(attemptRepository, never()).claimForProcessing(any(), any(), anyInt());
    }

    // -- SSRF failure: claim + update, not INSERT --

    @Test
    void ssrfFailure_claimsAndUpdatesExistingRow() {
        IncomingDestination dest = buildDestination();
        dest.setUrl("http://169.254.169.254/latest/meta-data");

        when(eventRepository.findById(eventId)).thenReturn(Optional.of(buildEvent()));
        when(destinationRepository.findById(destinationId)).thenReturn(Optional.of(dest));
        when(attemptRepository.claimForProcessing(eventId, destinationId, 1)).thenReturn(1);

        IncomingForwardAttempt existingAttempt = IncomingForwardAttempt.builder()
                .id(UUID.randomUUID()).incomingEventId(eventId).destinationId(destinationId)
                .attemptNumber(1).status(ForwardAttemptStatus.PROCESSING)
                .build();
        when(attemptRepository.findByIncomingEventIdAndDestinationIdOrderByAttemptNumberDesc(eventId, destinationId))
                .thenReturn(List.of(existingAttempt));

        // Re-create service with allowPrivateIps=false for SSRF to trigger
        IncomingForwardService ssrfService = new IncomingForwardService(
                eventRepository, destinationRepository, attemptRepository,
                webClientBuilder, new ObjectMapper(),
                "test_encryption_key_32_chars_pad", "test_salt",
                false, List.of(),
                new SimpleMeterRegistry(), transactionTemplate
        );

        IncomingForwardMessage message = IncomingForwardMessage.builder()
                .incomingEventId(eventId).destinationId(destinationId)
                .incomingSourceId(sourceId).attemptCount(0).replay(false)
                .build();

        ssrfService.processForward(message);

        // Must claim via UPDATE then update to FAILED, never INSERT
        verify(attemptRepository).claimForProcessing(eventId, destinationId, 1);
        verify(attemptRepository, never()).saveAndFlush(any(IncomingForwardAttempt.class));

        ArgumentCaptor<IncomingForwardAttempt> captor = ArgumentCaptor.forClass(IncomingForwardAttempt.class);
        verify(attemptRepository).save(captor.capture());
        IncomingForwardAttempt saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ForwardAttemptStatus.FAILED);
        assertThat(saved.getErrorMessage()).contains("SSRF_PROTECTION");
    }

    // -- Edge cases --

    @Test
    void eventNotFound_skips() {
        when(eventRepository.findById(eventId)).thenReturn(Optional.empty());

        IncomingForwardMessage message = IncomingForwardMessage.builder()
                .incomingEventId(eventId).destinationId(destinationId)
                .incomingSourceId(sourceId).attemptCount(0).replay(false)
                .build();

        service.processForward(message);

        verify(attemptRepository, never()).claimForProcessing(any(), any(), anyInt());
    }

    @Test
    void destinationDisabled_skips() {
        IncomingDestination dest = buildDestination();
        dest.setEnabled(false);

        when(eventRepository.findById(eventId)).thenReturn(Optional.of(buildEvent()));
        when(destinationRepository.findById(destinationId)).thenReturn(Optional.of(dest));

        IncomingForwardMessage message = IncomingForwardMessage.builder()
                .incomingEventId(eventId).destinationId(destinationId)
                .incomingSourceId(sourceId).attemptCount(0).replay(false)
                .build();

        service.processForward(message);

        verify(attemptRepository, never()).claimForProcessing(any(), any(), anyInt());
    }
}
