package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.common.dto.DeliveryMessage;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.kafka.core.KafkaTemplate;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.springframework.kafka.support.SendResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OutboxPublisherServiceTest {

    @Mock
    private OutboxMessageRepository outboxMessageRepository;

    @Mock
    private KafkaTemplate<String, Object> kafkaTemplate;

    @Mock
    private ObjectMapper objectMapper;

    @Mock
    private PlatformTransactionManager txManager;

    private OutboxPublisherService service;

    @BeforeEach
    void setUp() {
        // Make TransactionTemplate.execute() actually run the callback
        when(txManager.getTransaction(any())).thenReturn(mock(TransactionStatus.class));

        service = new OutboxPublisherService(
                outboxMessageRepository, kafkaTemplate, objectMapper,
                new SimpleMeterRegistry(), txManager, 100, 5, 90, 300, 1);
    }

    @Test
    void shouldNotProcessWhenNoPendingMessages() {
        when(outboxMessageRepository.findPendingBatchForUpdate(anyString(), anyInt(), anyInt()))
                .thenReturn(Collections.emptyList());

        service.publishPendingMessages();

        verify(kafkaTemplate, never()).send(any(ProducerRecord.class));
    }

    @Test
    void shouldUseFairBatchingWithMaxPerKey() {
        when(outboxMessageRepository.findPendingBatchForUpdate(eq("PENDING"), eq(100), eq(10)))
                .thenReturn(Collections.emptyList());

        service.publishPendingMessages();

        // Verify fair batching: 3rd arg is maxPerKey=10
        verify(outboxMessageRepository).findPendingBatchForUpdate("PENDING", 100, 10);
    }

    @Test
    void shouldMarkAsSendingDuringClaimPhase() throws Exception {
        OutboxMessage message = createTestMessage();
        DeliveryMessage deliveryMessage = DeliveryMessage.builder()
                .deliveryId(UUID.randomUUID())
                .build();

        when(outboxMessageRepository.findPendingBatchForUpdate(anyString(), anyInt(), anyInt()))
                .thenReturn(List.of(message));
        when(outboxMessageRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(objectMapper.readValue(anyString(), eq(DeliveryMessage.class)))
                .thenReturn(deliveryMessage);

        @SuppressWarnings("unchecked")
        SendResult<String, Object> sendResult = mock(SendResult.class);
        CompletableFuture<SendResult<String, Object>> future = CompletableFuture.completedFuture(sendResult);
        when(kafkaTemplate.send(any(ProducerRecord.class))).thenReturn(future);

        service.publishPendingMessages();

        // Phase 1: message was set to SENDING via saveAll during claim
        verify(outboxMessageRepository).saveAll(argThat(list -> {
            @SuppressWarnings("unchecked")
            List<OutboxMessage> msgs = (List<OutboxMessage>) list;
            return !msgs.isEmpty();
        }));

        // Phase 2: batch-marked PUBLISHED after Kafka ack
        verify(outboxMessageRepository).batchMarkPublished(anyList(), any(Instant.class));
    }

    @Test
    void shouldMarkAsFailedOnException() throws Exception {
        OutboxMessage message = createTestMessage();

        when(outboxMessageRepository.findPendingBatchForUpdate(anyString(), anyInt(), anyInt()))
                .thenReturn(List.of(message));
        when(outboxMessageRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(objectMapper.readValue(anyString(), eq(DeliveryMessage.class)))
                .thenThrow(new RuntimeException("Parse error"));

        service.publishPendingMessages();

        // Batch-marked FAILED via bulk query
        verify(outboxMessageRepository).batchMarkFailed(anyList(), anyString(), any(Instant.class));
    }

    @Test
    void shouldMarkAsFailedOnKafkaSendFailure() throws Exception {
        OutboxMessage message = createTestMessage();
        DeliveryMessage deliveryMessage = DeliveryMessage.builder()
                .deliveryId(UUID.randomUUID())
                .build();

        when(outboxMessageRepository.findPendingBatchForUpdate(anyString(), anyInt(), anyInt()))
                .thenReturn(List.of(message));
        when(outboxMessageRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(objectMapper.readValue(anyString(), eq(DeliveryMessage.class)))
                .thenReturn(deliveryMessage);

        // Kafka send fails definitively
        CompletableFuture<SendResult<String, Object>> future = new CompletableFuture<>();
        future.completeExceptionally(new RuntimeException("Broker unavailable"));
        when(kafkaTemplate.send(any(ProducerRecord.class))).thenReturn(future);

        service.publishPendingMessages();

        // Batch-marked FAILED via bulk query after Kafka error
        verify(outboxMessageRepository).batchMarkFailed(anyList(), anyString(), any(Instant.class));
    }

    @Test
    void shouldNotMarkAsFailedWhenKafkaSendStillInFlight() throws Exception {
        // Regression test for P0 duplicate dispatch bug.
        // Previously, get(0ms) after batch timeout would mark in-flight sends as FAILED,
        // even though they would eventually succeed — causing duplicate dispatch on retry.
        OutboxMessage message = createTestMessage();
        DeliveryMessage deliveryMessage = DeliveryMessage.builder()
                .deliveryId(UUID.randomUUID())
                .build();

        when(outboxMessageRepository.findPendingBatchForUpdate(anyString(), anyInt(), anyInt()))
                .thenReturn(List.of(message));
        when(outboxMessageRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(objectMapper.readValue(anyString(), eq(DeliveryMessage.class)))
                .thenReturn(deliveryMessage);

        // Kafka send never completes (simulates slow broker)
        CompletableFuture<SendResult<String, Object>> neverCompletingFuture = new CompletableFuture<>();
        when(kafkaTemplate.send(any(ProducerRecord.class))).thenReturn(neverCompletingFuture);

        service.publishPendingMessages();

        // No batch updates should happen — messages still in-flight stay SENDING.
        // cleanupOldMessages() recovers them back to PENDING after sendingRecoverySeconds.
        verify(outboxMessageRepository, never()).batchMarkPublished(anyList(), any(Instant.class));
        verify(outboxMessageRepository, never()).batchMarkFailed(anyList(), anyString(), any(Instant.class));
        // Message remains SENDING (set during claim phase)
        assertThat(message.getStatus()).isEqualTo(OutboxStatus.SENDING);
    }

    private OutboxMessage createTestMessage() {
        OutboxMessage message = new OutboxMessage();
        message.setId(UUID.randomUUID());
        message.setAggregateType("Delivery");
        message.setStatus(OutboxStatus.PENDING);
        message.setPayload("{\"deliveryId\":\"" + UUID.randomUUID() + "\"}");
        message.setKafkaTopic("test-topic");
        message.setKafkaKey("test-key");
        message.setRetryCount(0);
        message.setCreatedAt(Instant.now());
        return message;
    }
}
