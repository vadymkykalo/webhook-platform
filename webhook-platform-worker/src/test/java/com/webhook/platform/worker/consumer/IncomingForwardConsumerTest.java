package com.webhook.platform.worker.consumer;

import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import com.webhook.platform.worker.service.BoundedAsyncExecutor;
import com.webhook.platform.worker.service.IncomingForwardService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.support.Acknowledgment;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit coverage for IncomingForwardConsumer (P1-22) -- the incoming-forward analogue of
 * DeliveryConsumerTest. Unlike the outgoing consumer, this one does not reschedule via a
 * retry ladder when the executor is full: it simply leaves the record unacked so the
 * container's own backpressure (pause on full pool) causes redelivery.
 */
class IncomingForwardConsumerTest {

    private IncomingForwardService forwardService;
    private BoundedAsyncExecutor asyncExecutor;
    private IncomingForwardConsumer consumer;

    @BeforeEach
    void setUp() {
        forwardService = mock(IncomingForwardService.class);
        asyncExecutor = new BoundedAsyncExecutor("test-incoming-forward", 4, 5, new SimpleMeterRegistry());
        consumer = new IncomingForwardConsumer(forwardService, asyncExecutor, mock(KafkaListenerEndpointRegistry.class));
    }

    @AfterEach
    void tearDown() {
        asyncExecutor.shutdown();
    }

    @Test
    void consume_submitsToForwardServiceAndAcks() throws Exception {
        IncomingForwardMessage message = forwardMessage();
        ConsumerRecord<String, IncomingForwardMessage> record = consumerRecord(message);
        Acknowledgment ack = mock(Acknowledgment.class);

        consumer.consume(record, ack);

        Thread.sleep(200);
        verify(forwardService).processForward(message);
        verify(ack).acknowledge();
    }

    @Test
    void consume_executorFull_doesNotAck_leavesRecordForRedelivery() throws Exception {
        fillExecutorPool();

        IncomingForwardMessage message = forwardMessage();
        ConsumerRecord<String, IncomingForwardMessage> record = consumerRecord(message);
        Acknowledgment ack = mock(Acknowledgment.class);

        consumer.consume(record, ack);

        verify(ack, never()).acknowledge();
        verify(forwardService, never()).processForward(any());
    }

    private void fillExecutorPool() throws InterruptedException {
        CountDownLatch blockLatch = new CountDownLatch(1);
        CountDownLatch allStarted = new CountDownLatch(4);
        for (int i = 0; i < 4; i++) {
            asyncExecutor.trySubmit(() -> {
                allStarted.countDown();
                try {
                    blockLatch.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }, mock(Acknowledgment.class), "fill-" + i);
        }
        assertTrue(allStarted.await(5, TimeUnit.SECONDS));
    }

    private IncomingForwardMessage forwardMessage() {
        return IncomingForwardMessage.builder()
                .incomingEventId(UUID.randomUUID())
                .destinationId(UUID.randomUUID())
                .attemptCount(0)
                .replay(false)
                .build();
    }

    @SuppressWarnings("unchecked")
    private ConsumerRecord<String, IncomingForwardMessage> consumerRecord(IncomingForwardMessage message) {
        ConsumerRecord<String, IncomingForwardMessage> record = mock(ConsumerRecord.class);
        when(record.value()).thenReturn(message);
        when(record.topic()).thenReturn(KafkaTopics.INCOMING_FORWARD_DISPATCH);
        org.apache.kafka.common.header.Headers headers = new org.apache.kafka.common.header.internals.RecordHeaders();
        when(record.headers()).thenReturn(headers);
        return record;
    }
}
