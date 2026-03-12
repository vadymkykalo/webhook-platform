package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.webhook.platform.api.domain.entity.Event;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.entity.Subscription;
import com.webhook.platform.api.domain.repository.*;
import com.webhook.platform.api.dto.EventIngestRequest;
import com.webhook.platform.api.dto.EventIngestResponse;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.dao.DataIntegrityViolationException;
import com.webhook.platform.api.service.rules.RuleEngineService;
import com.webhook.platform.api.service.workflow.WorkflowTriggerService;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EventIngestServiceTest {

    @Mock
    private EventRepository eventRepository;
    @Mock
    private SubscriptionRepository subscriptionRepository;
    @Mock
    private DeliveryRepository deliveryRepository;
    @Mock
    private OutboxMessageRepository outboxMessageRepository;
    @Mock
    private SequenceGeneratorService sequenceGeneratorService;
    @Mock
    private SchemaRegistryService schemaRegistryService;
    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private PlatformTransactionManager transactionManager;
    @Mock
    private RuleEngineService ruleEngineService;
    @Mock
    private WorkflowTriggerService workflowTriggerService;

    private EventIngestService service;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final MeterRegistry meterRegistry = new SimpleMeterRegistry();

    private final UUID projectId = UUID.randomUUID();
    private final UUID eventId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new EventIngestService(
                eventRepository, subscriptionRepository, deliveryRepository,
                outboxMessageRepository, objectMapper, meterRegistry,
                sequenceGeneratorService, schemaRegistryService, projectRepository,
                ruleEngineService, workflowTriggerService, transactionManager, 262144L, 1024
        );
    }

    private EventIngestRequest buildRequest(String type) {
        ObjectNode data = objectMapper.createObjectNode();
        data.put("key", "value");
        return EventIngestRequest.builder()
                .type(type)
                .data(data)
                .build();
    }

    private Event buildEvent(String type, String idempotencyKey) {
        return Event.builder()
                .id(eventId)
                .projectId(projectId)
                .eventType(type)
                .idempotencyKey(idempotencyKey)
                .payload("{\"key\":\"value\"}")
                .createdAt(Instant.now())
                .build();
    }

    @Test
    void ingestEvent_noIdempotencyKey_createsEvent() {
        EventIngestRequest request = buildRequest("order.created");

        when(eventRepository.saveAndFlush(any(Event.class))).thenAnswer(inv -> {
            Event e = inv.getArgument(0);
            e.setId(eventId);
            e.setCreatedAt(Instant.now());
            return e;
        });
        when(subscriptionRepository.findByProjectIdAndEventTypeAndEnabledTrue(projectId, "order.created"))
                .thenReturn(List.of());

        // TransactionTemplate executes the callback directly in tests
        stubTransactionTemplate();

        EventIngestResponse response = service.ingestEvent(projectId, request, null);

        assertThat(response.getEventId()).isEqualTo(eventId);
        assertThat(response.getType()).isEqualTo("order.created");
        verify(eventRepository).saveAndFlush(any(Event.class));
    }

    @Test
    void ingestEvent_withIdempotencyKey_existingEvent_returnsDuplicate() {
        EventIngestRequest request = buildRequest("order.created");
        Event existing = buildEvent("order.created", "idem-123");

        when(eventRepository.findByProjectIdAndIdempotencyKey(projectId, "idem-123"))
                .thenReturn(Optional.of(existing));

        stubTransactionTemplate();

        EventIngestResponse response = service.ingestEvent(projectId, request, "idem-123");

        assertThat(response.getEventId()).isEqualTo(eventId);
        assertThat(response.getDeliveriesCreated()).isEqualTo(0);
        verify(eventRepository, never()).saveAndFlush(any());
    }

    @Test
    void ingestEvent_idempotencyRace_catchesConstraintViolation_returnsExistingEvent() {
        EventIngestRequest request = buildRequest("order.created");
        Event existing = buildEvent("order.created", "race-key");

        stubTransactionTemplate();

        // First lookup returns empty (both threads see no existing event)
        // Then saveAndFlush throws DataIntegrityViolationException (other thread won the insert)
        when(eventRepository.findByProjectIdAndIdempotencyKey(projectId, "race-key"))
                .thenReturn(Optional.empty())     // inside doIngestEvent (pre-insert check)
                .thenReturn(Optional.of(existing)); // retry lookup after DataIntegrityViolationException
        when(eventRepository.saveAndFlush(any(Event.class)))
                .thenThrow(new DataIntegrityViolationException("unique constraint violation"));

        EventIngestResponse response = service.ingestEvent(projectId, request, "race-key");

        assertThat(response.getEventId()).isEqualTo(eventId);
        assertThat(response.getType()).isEqualTo("order.created");
        assertThat(response.getDeliveriesCreated()).isEqualTo(0);
    }

    @Test
    void ingestEvent_idempotencyRace_noExistingEvent_rethrows() {
        EventIngestRequest request = buildRequest("order.created");

        stubTransactionTemplate();

        when(eventRepository.findByProjectIdAndIdempotencyKey(projectId, "ghost-key"))
                .thenReturn(Optional.empty())   // pre-insert check
                .thenReturn(Optional.empty());  // retry lookup — still not found
        when(eventRepository.saveAndFlush(any(Event.class)))
                .thenThrow(new DataIntegrityViolationException("unique constraint violation"));

        assertThatThrownBy(() -> service.ingestEvent(projectId, request, "ghost-key"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void ingestEvent_noIdempotencyKey_constraintViolation_rethrows() {
        EventIngestRequest request = buildRequest("order.created");

        stubTransactionTemplate();

        when(eventRepository.saveAndFlush(any(Event.class)))
                .thenThrow(new DataIntegrityViolationException("some other constraint"));

        assertThatThrownBy(() -> service.ingestEvent(projectId, request, null))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /**
     * Stubs PlatformTransactionManager so TransactionTemplate.execute() runs the callback directly.
     */
    private void stubTransactionTemplate() {
        when(transactionManager.getTransaction(any())).thenReturn(mock(org.springframework.transaction.TransactionStatus.class));
    }
}
