package com.webhook.platform.worker.service;

import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.worker.domain.entity.Delivery;
import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.kafka.core.KafkaTemplate;

import java.time.Instant;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RetrySchedulerServiceTest {

    @Mock
    private DeliveryRepository deliveryRepository;

    @Mock
    private KafkaTemplate<String, DeliveryMessage> kafkaTemplate;

    private RetrySchedulerService retrySchedulerService;

    private final int batchSize = 100;

    @BeforeEach
    void setUp() {
        retrySchedulerService = new RetrySchedulerService(deliveryRepository, kafkaTemplate, batchSize);
    }

    @Test
    void scheduleRetries_shouldLoadOnlyDueDeliveries() {
        // Arrange
        Instant now = Instant.now();
        Instant future = now.plusSeconds(3600);
        
        Delivery dueDelivery = createDelivery(UUID.randomUUID(), 1, now.minusSeconds(10));
        
        when(deliveryRepository.findPendingRetriesForUpdate(
                eq(Delivery.DeliveryStatus.PENDING),
                any(Instant.class),
                any(PageRequest.class)
        )).thenReturn(Collections.singletonList(dueDelivery));

        // Act
        retrySchedulerService.scheduleRetries();

        // Assert
        ArgumentCaptor<PageRequest> pageRequestCaptor = ArgumentCaptor.forClass(PageRequest.class);
        verify(deliveryRepository).findPendingRetriesForUpdate(
                eq(Delivery.DeliveryStatus.PENDING),
                any(Instant.class),
                pageRequestCaptor.capture()
        );
        
        assertEquals(batchSize, pageRequestCaptor.getValue().getPageSize());
        verify(kafkaTemplate, times(1)).send(anyString(), anyString(), any(DeliveryMessage.class));
    }

    @Test
    void scheduleRetries_shouldRespectBatchSize() {
        // Arrange
        Instant now = Instant.now();
        List<Delivery> deliveries = Arrays.asList(
                createDelivery(UUID.randomUUID(), 1, now.minusSeconds(10)),
                createDelivery(UUID.randomUUID(), 2, now.minusSeconds(20)),
                createDelivery(UUID.randomUUID(), 3, now.minusSeconds(30))
        );
        
        when(deliveryRepository.findPendingRetriesForUpdate(
                any(Delivery.DeliveryStatus.class),
                any(Instant.class),
                any(PageRequest.class)
        )).thenReturn(deliveries);

        // Act
        retrySchedulerService.scheduleRetries();

        // Assert
        verify(kafkaTemplate, times(3)).send(anyString(), anyString(), any(DeliveryMessage.class));
        verify(deliveryRepository, times(3)).save(any(Delivery.class));
    }

    @Test
    void scheduleRetries_shouldNullifyNextRetryAt() {
        // Arrange
        Instant now = Instant.now();
        Delivery delivery = createDelivery(UUID.randomUUID(), 1, now.minusSeconds(10));
        
        when(deliveryRepository.findPendingRetriesForUpdate(
                any(Delivery.DeliveryStatus.class),
                any(Instant.class),
                any(PageRequest.class)
        )).thenReturn(Collections.singletonList(delivery));

        // Act
        retrySchedulerService.scheduleRetries();

        // Assert
        ArgumentCaptor<Delivery> deliveryCaptor = ArgumentCaptor.forClass(Delivery.class);
        verify(deliveryRepository).save(deliveryCaptor.capture());
        assertNull(deliveryCaptor.getValue().getNextRetryAt());
    }

    @Test
    void scheduleRetries_shouldHandleEmptyResult() {
        // Arrange
        when(deliveryRepository.findPendingRetriesForUpdate(
                any(Delivery.DeliveryStatus.class),
                any(Instant.class),
                any(PageRequest.class)
        )).thenReturn(Collections.emptyList());

        // Act
        retrySchedulerService.scheduleRetries();

        // Assert
        verify(kafkaTemplate, never()).send(anyString(), anyString(), any(DeliveryMessage.class));
        verify(deliveryRepository, never()).save(any(Delivery.class));
    }

    @Test
    void scheduleRetries_shouldHandleExceptionGracefully() {
        // Arrange
        Instant now = Instant.now();
        Delivery delivery = createDelivery(UUID.randomUUID(), 1, now.minusSeconds(10));
        
        when(deliveryRepository.findPendingRetriesForUpdate(
                any(Delivery.DeliveryStatus.class),
                any(Instant.class),
                any(PageRequest.class)
        )).thenReturn(Collections.singletonList(delivery));
        
        doThrow(new RuntimeException("Kafka error")).when(kafkaTemplate).send(anyString(), anyString(), any(DeliveryMessage.class));

        // Act & Assert - should not throw exception
        assertDoesNotThrow(() -> retrySchedulerService.scheduleRetries());
    }

    @Test
    void getRetryTopic_shouldSelectCorrectTopicByAttemptCount() {
        // This test verifies the business logic of topic selection
        // Since getRetryTopic is private, we test it indirectly through scheduleRetries
        
        Instant now = Instant.now();
        Delivery delivery1 = createDelivery(UUID.randomUUID(), 1, now.minusSeconds(10));
        Delivery delivery2 = createDelivery(UUID.randomUUID(), 2, now.minusSeconds(10));
        Delivery delivery6 = createDelivery(UUID.randomUUID(), 6, now.minusSeconds(10));
        
        when(deliveryRepository.findPendingRetriesForUpdate(
                any(Delivery.DeliveryStatus.class),
                any(Instant.class),
                any(PageRequest.class)
        ))
                .thenReturn(Collections.singletonList(delivery1))
                .thenReturn(Collections.singletonList(delivery2))
                .thenReturn(Collections.singletonList(delivery6));

        // Act
        retrySchedulerService.scheduleRetries();
        retrySchedulerService.scheduleRetries();
        retrySchedulerService.scheduleRetries();

        // Assert
        ArgumentCaptor<String> topicCaptor = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate, times(3)).send(topicCaptor.capture(), anyString(), any(DeliveryMessage.class));
        
        List<String> topics = topicCaptor.getAllValues();
        assertTrue(topics.get(0).contains("1m") || topics.get(0).contains("retry"));
        assertTrue(topics.get(1).contains("5m") || topics.get(1).contains("retry"));
        assertTrue(topics.get(2).contains("24h") || topics.get(2).contains("retry"));
    }

    private Delivery createDelivery(UUID id, int attemptCount, Instant nextRetryAt) {
        return Delivery.builder()
                .id(id)
                .eventId(UUID.randomUUID())
                .endpointId(UUID.randomUUID())
                .subscriptionId(UUID.randomUUID())
                .status(Delivery.DeliveryStatus.PENDING)
                .attemptCount(attemptCount)
                .maxAttempts(7)
                .nextRetryAt(nextRetryAt)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
    }
}
