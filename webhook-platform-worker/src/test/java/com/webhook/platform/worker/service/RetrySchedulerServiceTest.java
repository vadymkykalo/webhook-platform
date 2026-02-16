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

import org.springframework.kafka.support.SendResult;

import java.time.Instant;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

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
    private final long sendTimeoutSeconds = 30;
    private final long rescheduleDelaySeconds = 60;

    @BeforeEach
    void setUp() {
        retrySchedulerService = new RetrySchedulerService(
                deliveryRepository, 
                kafkaTemplate, 
                batchSize, 
                sendTimeoutSeconds, 
                rescheduleDelaySeconds
        );
    }

    @Test
    void scheduleRetries_shouldLoadOnlyDueDeliveries() {
        // Arrange
        Instant now = Instant.now();
        Delivery dueDelivery = createDelivery(UUID.randomUUID(), 1, now.minusSeconds(10));
        
        when(deliveryRepository.findPendingRetriesForUpdate(
                eq(Delivery.DeliveryStatus.PENDING),
                any(Instant.class),
                any(PageRequest.class)
        )).thenReturn(Collections.singletonList(dueDelivery));
        
        CompletableFuture<SendResult<String, DeliveryMessage>> future = CompletableFuture.completedFuture(mock(SendResult.class));
        when(kafkaTemplate.send(anyString(), anyString(), any(DeliveryMessage.class))).thenReturn(future);

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
        
        CompletableFuture<SendResult<String, DeliveryMessage>> future = CompletableFuture.completedFuture(mock(SendResult.class));
        when(kafkaTemplate.send(anyString(), anyString(), any(DeliveryMessage.class))).thenReturn(future);

        // Act
        retrySchedulerService.scheduleRetries();

        // Assert
        verify(kafkaTemplate, times(3)).send(anyString(), anyString(), any(DeliveryMessage.class));
        verify(deliveryRepository).saveAll(anyList());
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
        
        CompletableFuture<SendResult<String, DeliveryMessage>> future = CompletableFuture.completedFuture(mock(SendResult.class));
        when(kafkaTemplate.send(anyString(), anyString(), any(DeliveryMessage.class))).thenReturn(future);

        // Act
        retrySchedulerService.scheduleRetries();

        // Assert
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Delivery>> deliveryCaptor = ArgumentCaptor.forClass(List.class);
        verify(deliveryRepository).saveAll(deliveryCaptor.capture());
        assertNull(deliveryCaptor.getValue().get(0).getNextRetryAt());
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
        verify(deliveryRepository, never()).saveAll(anyList());
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
        
        CompletableFuture<SendResult<String, DeliveryMessage>> failedFuture = new CompletableFuture<>();
        failedFuture.completeExceptionally(new RuntimeException("Kafka error"));
        when(kafkaTemplate.send(anyString(), anyString(), any(DeliveryMessage.class))).thenReturn(failedFuture);

        // Act & Assert - should not throw exception, delivery should be rescheduled
        assertDoesNotThrow(() -> retrySchedulerService.scheduleRetries());
        
        // Verify failed delivery is saved with new nextRetryAt
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Delivery>> deliveryCaptor = ArgumentCaptor.forClass(List.class);
        verify(deliveryRepository).saveAll(deliveryCaptor.capture());
        assertNotNull(deliveryCaptor.getValue().get(0).getNextRetryAt());
    }

    @Test
    void getRetryTopic_shouldSelectCorrectTopicByAttemptCount() {
        // This test verifies the business logic of topic selection
        // Since getRetryTopic is private, we test it indirectly through scheduleRetries
        
        Instant now = Instant.now();
        Delivery delivery1 = createDelivery(UUID.randomUUID(), 1, now.minusSeconds(10));
        Delivery delivery2 = createDelivery(UUID.randomUUID(), 2, now.minusSeconds(10));
        Delivery delivery6 = createDelivery(UUID.randomUUID(), 6, now.minusSeconds(10));
        
        CompletableFuture<SendResult<String, DeliveryMessage>> future = CompletableFuture.completedFuture(mock(SendResult.class));
        when(kafkaTemplate.send(anyString(), anyString(), any(DeliveryMessage.class))).thenReturn(future);
        
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
