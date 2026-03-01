package com.webhook.platform.worker.consumer;

import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import com.webhook.platform.worker.service.IncomingForwardService;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.MDC;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.UUID;

@Component
@Slf4j
public class IncomingForwardConsumer {

    private final IncomingForwardService forwardService;

    public IncomingForwardConsumer(IncomingForwardService forwardService) {
        this.forwardService = forwardService;
    }

    @KafkaListener(
            topics = {KafkaTopics.INCOMING_FORWARD_DISPATCH, KafkaTopics.INCOMING_FORWARD_RETRY},
            groupId = "incoming-forward-worker",
            containerFactory = "incomingForwardListenerContainerFactory"
    )
    public void consume(ConsumerRecord<String, IncomingForwardMessage> record, Acknowledgment ack) {
        IncomingForwardMessage message = record.value();
        String correlationId = UUID.randomUUID().toString();

        MDC.put("correlationId", correlationId);
        MDC.put("incomingEventId", String.valueOf(message.getIncomingEventId()));
        MDC.put("destinationId", String.valueOf(message.getDestinationId()));

        try {
            log.info("Received incoming forward message: eventId={}, destId={}, topic={}, replay={}",
                    message.getIncomingEventId(), message.getDestinationId(),
                    record.topic(), message.isReplay());

            forwardService.processForward(message);
            ack.acknowledge();

            log.info("Incoming forward processed: eventId={}, destId={}",
                    message.getIncomingEventId(), message.getDestinationId());
        } catch (Exception e) {
            log.error("Failed to process incoming forward: eventId={}, destId={}, error={}. Will nack for redelivery.",
                    message.getIncomingEventId(), message.getDestinationId(), e.getMessage(), e);
            ack.nack(Duration.ofSeconds(10));
        } finally {
            MDC.remove("correlationId");
            MDC.remove("incomingEventId");
            MDC.remove("destinationId");
        }
    }
}
