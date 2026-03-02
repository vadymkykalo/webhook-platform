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
                new SimpleMeterRegistry(), txManager, 100);
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

        // Phase 2: message marked PUBLISHED after Kafka ack
        verify(outboxMessageRepository).save(argThat(msg ->
            msg.getStatus() == OutboxStatus.PUBLISHED && msg.getPublishedAt() != null
        ));
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

        verify(outboxMessageRepository).save(argThat(msg ->
            msg.getStatus() == OutboxStatus.FAILED &&
            msg.getRetryCount() == 1 &&
            msg.getErrorMessage() != null
        ));
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
