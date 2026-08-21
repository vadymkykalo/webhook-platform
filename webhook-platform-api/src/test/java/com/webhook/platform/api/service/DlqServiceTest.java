package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.Delivery;
import com.webhook.platform.api.domain.entity.DeliveryAttempt;
import com.webhook.platform.api.domain.entity.Event;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.repository.DeliveryAttemptRepository;
import com.webhook.platform.api.domain.repository.DeliveryRepository;
import com.webhook.platform.api.domain.repository.EventRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.DlqItemResponse;
import com.webhook.platform.api.dto.DlqStatsResponse;
import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DlqServiceTest {

    @Mock private DeliveryRepository deliveryRepository;
    @Mock private DeliveryAttemptRepository deliveryAttemptRepository;
    @Mock private EventRepository eventRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private OutboxMessageRepository outboxMessageRepository;

    private DlqService dlqService;

    private final UUID orgId = UUID.randomUUID();
    private final UUID projectId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        dlqService = new DlqService(deliveryRepository, deliveryAttemptRepository, eventRepository,
                projectRepository, outboxMessageRepository, new ObjectMapper());
    }

    private Project projectOwnedBy(UUID orgId) {
        return Project.builder().id(projectId).organizationId(orgId).build();
    }

    // ─── validateProjectOwnership ───────────────────────────────────────

    @Test
    void validateProjectOwnership_matchingOrg_doesNotThrow() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(projectOwnedBy(orgId)));
        dlqService.validateProjectOwnership(projectId, orgId);
    }

    @Test
    void validateProjectOwnership_projectNotFound_throwsNotFound() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> dlqService.validateProjectOwnership(projectId, orgId))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void validateProjectOwnership_wrongOrg_throwsForbidden() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(projectOwnedBy(UUID.randomUUID())));
        assertThatThrownBy(() -> dlqService.validateProjectOwnership(projectId, orgId))
                .isInstanceOf(ForbiddenException.class);
    }

    // ─── listDlqItems ────────────────────────────────────────────────────

    @Test
    void listDlqItems_noEndpointFilter_usesProjectQuery_andBatchLoadsLastAttempts() {
        UUID deliveryId = UUID.randomUUID();
        Event event = Event.builder().id(UUID.randomUUID()).projectId(projectId).eventType("order.created").build();
        Delivery delivery = Delivery.builder().id(deliveryId).eventId(event.getId())
                .endpointId(UUID.randomUUID()).status(DeliveryStatus.DLQ)
                .attemptCount(7).maxAttempts(7).build();
        Pageable pageable = PageRequest.of(0, 20);
        when(deliveryRepository.findDlqByProjectId(projectId, pageable))
                .thenReturn(new PageImpl<>(List.of(delivery)));

        DeliveryAttempt lastAttempt = DeliveryAttempt.builder()
                .deliveryId(deliveryId).errorMessage("timeout").build();
        when(deliveryAttemptRepository.findLatestAttemptsByDeliveryIds(List.of(deliveryId)))
                .thenReturn(List.of(lastAttempt));

        Page<DlqItemResponse> result = dlqService.listDlqItems(projectId, null, pageable);

        assertThat(result.getContent()).hasSize(1);
        DlqItemResponse item = result.getContent().get(0);
        assertThat(item.getDeliveryId()).isEqualTo(deliveryId);
        assertThat(item.getLastError()).isEqualTo("timeout");
        verify(deliveryRepository, never()).findDlqByProjectIdAndEndpointId(any(), any(), any());
    }

    @Test
    void listDlqItems_withEndpointFilter_usesEndpointScopedQuery() {
        UUID endpointId = UUID.randomUUID();
        Pageable pageable = PageRequest.of(0, 20);
        when(deliveryRepository.findDlqByProjectIdAndEndpointId(projectId, endpointId, pageable))
                .thenReturn(new PageImpl<>(List.of()));

        Page<DlqItemResponse> result = dlqService.listDlqItems(projectId, endpointId, pageable);

        assertThat(result.getContent()).isEmpty();
        verify(deliveryRepository).findDlqByProjectIdAndEndpointId(projectId, endpointId, pageable);
        verify(deliveryRepository, never()).findDlqByProjectId(any(), any());
        // Empty page must not trigger a batch-attempt query at all.
        verify(deliveryAttemptRepository, never()).findLatestAttemptsByDeliveryIds(any());
    }

    @Test
    void listDlqItems_lastAttemptHasNoErrorMessage_fallsBackToHttpStatus() {
        UUID deliveryId = UUID.randomUUID();
        Delivery delivery = Delivery.builder().id(deliveryId).eventId(UUID.randomUUID())
                .endpointId(UUID.randomUUID()).status(DeliveryStatus.DLQ).build();
        Pageable pageable = PageRequest.of(0, 20);
        when(deliveryRepository.findDlqByProjectId(projectId, pageable))
                .thenReturn(new PageImpl<>(List.of(delivery)));
        DeliveryAttempt lastAttempt = DeliveryAttempt.builder()
                .deliveryId(deliveryId).httpStatusCode(503).build();
        when(deliveryAttemptRepository.findLatestAttemptsByDeliveryIds(List.of(deliveryId)))
                .thenReturn(List.of(lastAttempt));

        Page<DlqItemResponse> result = dlqService.listDlqItems(projectId, null, pageable);

        assertThat(result.getContent().get(0).getLastError()).isEqualTo("HTTP 503");
    }

    // ─── getDlqItem ──────────────────────────────────────────────────────

    @Test
    void getDlqItem_validDlqDelivery_returnsMappedResponse() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(projectOwnedBy(orgId)));
        UUID deliveryId = UUID.randomUUID();
        Delivery delivery = Delivery.builder().id(deliveryId).status(DeliveryStatus.DLQ)
                .eventId(UUID.randomUUID()).endpointId(UUID.randomUUID()).build();
        when(deliveryRepository.findById(deliveryId)).thenReturn(Optional.of(delivery));
        when(deliveryAttemptRepository.findTopByDeliveryIdOrderByAttemptNumberDesc(deliveryId))
                .thenReturn(Optional.empty());

        DlqItemResponse response = dlqService.getDlqItem(projectId, deliveryId, orgId);

        assertThat(response.getDeliveryId()).isEqualTo(deliveryId);
    }

    @Test
    void getDlqItem_deliveryNotFound_throwsNotFound() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(projectOwnedBy(orgId)));
        UUID deliveryId = UUID.randomUUID();
        when(deliveryRepository.findById(deliveryId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> dlqService.getDlqItem(projectId, deliveryId, orgId))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void getDlqItem_deliveryNotInDlq_throwsIllegalArgument() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(projectOwnedBy(orgId)));
        UUID deliveryId = UUID.randomUUID();
        Delivery delivery = Delivery.builder().id(deliveryId).status(DeliveryStatus.SUCCESS).build();
        when(deliveryRepository.findById(deliveryId)).thenReturn(Optional.of(delivery));

        assertThatThrownBy(() -> dlqService.getDlqItem(projectId, deliveryId, orgId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not in DLQ");
    }

    @Test
    void getDlqItem_wrongOrg_throwsForbiddenBeforeLoadingDelivery() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(projectOwnedBy(UUID.randomUUID())));
        UUID deliveryId = UUID.randomUUID();

        assertThatThrownBy(() -> dlqService.getDlqItem(projectId, deliveryId, orgId))
                .isInstanceOf(ForbiddenException.class);
        verify(deliveryRepository, never()).findById(any());
    }

    // ─── getDlqStats ─────────────────────────────────────────────────────

    @Test
    void getDlqStats_returnsCountsFromRepository() {
        when(deliveryRepository.countDlqByProjectId(projectId)).thenReturn(100L);
        when(deliveryRepository.countDlqByProjectIdSince(eq(projectId), any(Instant.class)))
                .thenReturn(10L, 50L);

        DlqStatsResponse stats = dlqService.getDlqStats(projectId);

        assertThat(stats.getTotalItems()).isEqualTo(100L);
        assertThat(stats.getLast24Hours()).isEqualTo(10L);
        assertThat(stats.getLast7Days()).isEqualTo(50L);
    }

    // ─── retryDeliveries ─────────────────────────────────────────────────

    @Test
    void retryDeliveries_resetsDeliveryStateAndCreatesOutboxMessage() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(projectOwnedBy(orgId)));

        UUID deliveryId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        Delivery delivery = Delivery.builder().id(deliveryId).eventId(eventId)
                .endpointId(UUID.randomUUID()).status(DeliveryStatus.DLQ)
                .attemptCount(7).maxAttempts(7)
                .failedAt(Instant.now()).nextRetryAt(Instant.now())
                .build();
        when(deliveryRepository.findByIdInAndStatus(List.of(deliveryId), DeliveryStatus.DLQ))
                .thenReturn(List.of(delivery));

        Event event = Event.builder().id(eventId).projectId(projectId).build();
        when(eventRepository.findById(eventId)).thenReturn(Optional.of(event));

        int retried = dlqService.retryDeliveries(projectId, List.of(deliveryId), orgId);

        assertThat(retried).isEqualTo(1);

        ArgumentCaptor<Delivery> savedCaptor = ArgumentCaptor.forClass(Delivery.class);
        verify(deliveryRepository).save(savedCaptor.capture());
        Delivery saved = savedCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(DeliveryStatus.PENDING);
        assertThat(saved.getAttemptCount()).isZero();
        assertThat(saved.getNextRetryAt()).isNull();
        assertThat(saved.getFailedAt()).isNull();

        ArgumentCaptor<OutboxMessage> outboxCaptor = ArgumentCaptor.forClass(OutboxMessage.class);
        verify(outboxMessageRepository).save(outboxCaptor.capture());
        assertThat(outboxCaptor.getValue().getAggregateId()).isEqualTo(deliveryId);
        assertThat(outboxCaptor.getValue().getEventType()).isEqualTo("DeliveryRetry");
    }

    @Test
    void retryDeliveries_deliveryBelongsToDifferentProject_isSkipped() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(projectOwnedBy(orgId)));

        UUID deliveryId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        Delivery delivery = Delivery.builder().id(deliveryId).eventId(eventId).status(DeliveryStatus.DLQ).build();
        when(deliveryRepository.findByIdInAndStatus(List.of(deliveryId), DeliveryStatus.DLQ))
                .thenReturn(List.of(delivery));

        Event eventFromOtherProject = Event.builder().id(eventId).projectId(UUID.randomUUID()).build();
        when(eventRepository.findById(eventId)).thenReturn(Optional.of(eventFromOtherProject));

        int retried = dlqService.retryDeliveries(projectId, List.of(deliveryId), orgId);

        assertThat(retried).isZero();
        verify(deliveryRepository, never()).save(any());
        verify(outboxMessageRepository, never()).save(any());
    }

    @Test
    void retryDeliveries_eventMissing_isSkippedNotThrown() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(projectOwnedBy(orgId)));

        UUID deliveryId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        Delivery delivery = Delivery.builder().id(deliveryId).eventId(eventId).status(DeliveryStatus.DLQ).build();
        when(deliveryRepository.findByIdInAndStatus(List.of(deliveryId), DeliveryStatus.DLQ))
                .thenReturn(List.of(delivery));
        when(eventRepository.findById(eventId)).thenReturn(Optional.empty());

        int retried = dlqService.retryDeliveries(projectId, List.of(deliveryId), orgId);

        assertThat(retried).isZero();
        verify(deliveryRepository, never()).save(any());
    }

    @Test
    void retryDeliveries_wrongOrg_throwsForbiddenBeforeTouchingDeliveries() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(projectOwnedBy(UUID.randomUUID())));

        assertThatThrownBy(() -> dlqService.retryDeliveries(projectId, List.of(UUID.randomUUID()), orgId))
                .isInstanceOf(ForbiddenException.class);
        verifyNoInteractions(deliveryRepository);
    }

    // ─── purgeAllDlq ─────────────────────────────────────────────────────

    @Test
    void purgeAllDlq_deletesAndReturnsCount() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(projectOwnedBy(orgId)));
        when(deliveryRepository.countDlqByProjectId(projectId)).thenReturn(5L);

        int purged = dlqService.purgeAllDlq(projectId, orgId);

        assertThat(purged).isEqualTo(5);
        verify(deliveryRepository).deleteDlqByProjectId(projectId);
    }

    @Test
    void purgeAllDlq_wrongOrg_throwsForbiddenBeforeDeleting() {
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(projectOwnedBy(UUID.randomUUID())));

        assertThatThrownBy(() -> dlqService.purgeAllDlq(projectId, orgId))
                .isInstanceOf(ForbiddenException.class);
        verify(deliveryRepository, never()).deleteDlqByProjectId(any());
    }
}
