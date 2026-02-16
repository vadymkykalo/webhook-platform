package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.common.dto.DeliveryMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.TopicPartition;
import org.springframework.kafka.support.SendResult;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OutboxPublisherServiceTest {

    @Mock
    private OutboxMessageRepository outboxMessageRepository;

    @Mock
    private KafkaTemplate<String, DeliveryMessage> kafkaTemplate;

    @Mock
    private ObjectMapper objectMapper;

    private OutboxPublisherService service;

    @BeforeEach
    void setUp() {
        service = new OutboxPublisherService(outboxMessageRepository, kafkaTemplate, objectMapper, 100);
    }

    @Test
    void shouldNotProcessWhenNoPendingMessages() {
        when(outboxMessageRepository.findPendingBatchForUpdate(anyString(), anyInt()))
                .thenReturn(Collections.emptyList());

        service.publishPendingMessages();

        verify(kafkaTemplate, never()).send(anyString(), anyString(), any());
    }

    @Test
    void shouldProcessBatchWithLimitedSize() {
        when(outboxMessageRepository.findPendingBatchForUpdate(eq("PENDING"), eq(100)))
                .thenReturn(Collections.emptyList());

        service.publishPendingMessages();

        verify(outboxMessageRepository).findPendingBatchForUpdate("PENDING", 100);
    }

    @Test
    void shouldMarkAsPublishedOnlyAfterKafkaSendSuccess() throws Exception {
        OutboxMessage message = createTestMessage();
        DeliveryMessage deliveryMessage = DeliveryMessage.builder()
                .deliveryId(UUID.randomUUID())
                .build();

        when(outboxMessageRepository.findPendingBatchForUpdate(anyString(), anyInt()))
                .thenReturn(List.of(message));
        when(objectMapper.readValue(anyString(), eq(DeliveryMessage.class)))
                .thenReturn(deliveryMessage);
        
        @SuppressWarnings("unchecked")
        SendResult<String, DeliveryMessage> sendResult = mock(SendResult.class);
        CompletableFuture<SendResult<String, DeliveryMessage>> future = CompletableFuture.completedFuture(sendResult);
        when(kafkaTemplate.send(any(ProducerRecord.class))).thenReturn(future);

        service.publishPendingMessages();

        verify(outboxMessageRepository).save(argThat(msg -> 
            msg.getStatus() == OutboxStatus.PUBLISHED && msg.getPublishedAt() != null
        ));
    }

    @Test
    void shouldMarkAsFailedOnException() throws Exception {
        OutboxMessage message = createTestMessage();
        
        when(outboxMessageRepository.findPendingBatchForUpdate(anyString(), anyInt()))
                .thenReturn(List.of(message));
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
        message.setStatus(OutboxStatus.PENDING);
        message.setPayload("{\"deliveryId\":\"" + UUID.randomUUID() + "\"}");
        message.setKafkaTopic("test-topic");
        message.setKafkaKey("test-key");
        message.setRetryCount(0);
        message.setCreatedAt(Instant.now());
        return message;
    }
}
