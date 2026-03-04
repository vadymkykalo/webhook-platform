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
            groupId = "${spring.kafka.consumer.incoming-group-id:incoming-forward-worker}",
            containerFactory = "incomingForwardListenerContainerFactory"
    )
    public void consume(ConsumerRecord<String, IncomingForwardMessage> record, Acknowledgment ack) {
        IncomingForwardMessage message = record.value();
        String correlationId = extractCorrelationId(record);

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
        } finally {
            MDC.remove("correlationId");
            MDC.remove("incomingEventId");
            MDC.remove("destinationId");
        }
    }

    private String extractCorrelationId(ConsumerRecord<String, IncomingForwardMessage> record) {
        org.apache.kafka.common.header.Header header = record.headers().lastHeader("X-Correlation-ID");
        if (header != null && header.value() != null && header.value().length > 0) {
            return new String(header.value(), java.nio.charset.StandardCharsets.UTF_8);
        }
        return UUID.randomUUID().toString();
    }
}
