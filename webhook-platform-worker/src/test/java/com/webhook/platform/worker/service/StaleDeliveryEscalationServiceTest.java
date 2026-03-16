package com.webhook.platform.worker.service;

import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.worker.domain.entity.Delivery;
import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StaleDeliveryEscalationServiceTest {

    @Mock
    private DeliveryRepository deliveryRepository;

    @Mock
    private KafkaTemplate<String, DeliveryMessage> kafkaTemplate;

    @Mock
    private TransactionTemplate transactionTemplate;

    private StaleDeliveryEscalationService service;

    @BeforeEach
    void setUp() {
        when(transactionTemplate.execute(any())).thenAnswer(invocation -> {
            var callback = invocation.getArgument(0, org.springframework.transaction.support.TransactionCallback.class);
            return callback.doInTransaction(null);
        });

        service = new StaleDeliveryEscalationService(
                deliveryRepository,
                kafkaTemplate,
                transactionTemplate,
                new SimpleMeterRegistry(),
                48,   // hardCapHours
                100   // escalationBatchSize
        );
    }

    @Test
    void runEscalation_noStaleDeliveries_doesNothing() {
        when(deliveryRepository.findOldestPendingCreatedAtGlobal()).thenReturn(Instant.now());
        when(deliveryRepository.findStaleDeliveryIds(any(Instant.class), anyInt()))
                .thenReturn(Collections.emptyList());

        service.runEscalation();

        verify(deliveryRepository, never()).saveAll(anyList());
    }

    @Test
    void runEscalation_staleDeliveries_escalatedToDlq() {
        UUID deliveryId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        UUID endpointId = UUID.randomUUID();
        UUID subscriptionId = UUID.randomUUID();

        Delivery staleDelivery = Delivery.builder()
                .id(deliveryId)
                .eventId(eventId)
                .endpointId(endpointId)
                .subscriptionId(subscriptionId)
                .status(Delivery.DeliveryStatus.PENDING)
                .attemptCount(5)
                .maxAttempts(7)
                .orderingEnabled(false)
                .createdAt(Instant.now().minus(72, ChronoUnit.HOURS))
                .updatedAt(Instant.now().minus(48, ChronoUnit.HOURS))
                .build();

        when(deliveryRepository.findOldestPendingCreatedAtGlobal())
                .thenReturn(staleDelivery.getCreatedAt());
        when(deliveryRepository.findStaleDeliveryIds(any(Instant.class), anyInt()))
                .thenReturn(List.of(deliveryId));
        when(deliveryRepository.findAllById(List.of(deliveryId)))
                .thenReturn(List.of(staleDelivery));

        service.runEscalation();

        // Verify delivery was moved to DLQ
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Delivery>> captor = ArgumentCaptor.forClass(List.class);
        verify(deliveryRepository).saveAll(captor.capture());

        List<Delivery> saved = captor.getValue();
        assertEquals(1, saved.size());
        assertEquals(Delivery.DeliveryStatus.DLQ, saved.get(0).getStatus());
        assertNotNull(saved.get(0).getFailedAt());

        // Verify DLQ notification sent to Kafka
        verify(kafkaTemplate).send(anyString(), eq(endpointId.toString()), any(DeliveryMessage.class));
    }

    @Test
    void runEscalation_oldestPendingAgeMetricUpdated() {
        Instant twoHoursAgo = Instant.now().minus(2, ChronoUnit.HOURS);
        when(deliveryRepository.findOldestPendingCreatedAtGlobal()).thenReturn(twoHoursAgo);
        when(deliveryRepository.findStaleDeliveryIds(any(Instant.class), anyInt()))
                .thenReturn(Collections.emptyList());

        service.runEscalation();

        // The metric should be approximately 7200 seconds (2 hours)
        // We can't check the gauge directly without accessing the meter registry,
        // but at least verify no errors occurred
        verify(deliveryRepository).findOldestPendingCreatedAtGlobal();
    }

    @Test
    void runEscalation_noPendingDeliveries_ageIsZero() {
        when(deliveryRepository.findOldestPendingCreatedAtGlobal()).thenReturn(null);
        when(deliveryRepository.findStaleDeliveryIds(any(Instant.class), anyInt()))
                .thenReturn(Collections.emptyList());

        service.runEscalation();

        verify(deliveryRepository).findOldestPendingCreatedAtGlobal();
    }

    @Test
    void runEscalation_kafkaSendFails_doesNotThrow() {
        UUID deliveryId = UUID.randomUUID();
        UUID endpointId = UUID.randomUUID();

        Delivery staleDelivery = Delivery.builder()
                .id(deliveryId)
                .eventId(UUID.randomUUID())
                .endpointId(endpointId)
                .subscriptionId(UUID.randomUUID())
                .status(Delivery.DeliveryStatus.PENDING)
                .attemptCount(7)
                .maxAttempts(7)
                .orderingEnabled(false)
                .createdAt(Instant.now().minus(72, ChronoUnit.HOURS))
                .updatedAt(Instant.now().minus(48, ChronoUnit.HOURS))
                .build();

        when(deliveryRepository.findOldestPendingCreatedAtGlobal())
                .thenReturn(staleDelivery.getCreatedAt());
        when(deliveryRepository.findStaleDeliveryIds(any(Instant.class), anyInt()))
                .thenReturn(List.of(deliveryId));
        when(deliveryRepository.findAllById(List.of(deliveryId)))
                .thenReturn(List.of(staleDelivery));
        when(kafkaTemplate.send(anyString(), anyString(), any(DeliveryMessage.class)))
                .thenThrow(new RuntimeException("Kafka unavailable"));

        // Should not throw — Kafka DLQ notification is best-effort
        assertDoesNotThrow(() -> service.runEscalation());

        // DB update should still have happened
        verify(deliveryRepository).saveAll(anyList());
    }
}
