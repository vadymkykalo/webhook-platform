package com.webhook.platform.worker.consumer;

import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.worker.service.WebhookDeliveryService;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@Slf4j
public class DeliveryConsumer {

    private static final String CORRELATION_ID_KEY = "correlationId";
    
    private final WebhookDeliveryService webhookDeliveryService;

    public DeliveryConsumer(WebhookDeliveryService webhookDeliveryService) {
        this.webhookDeliveryService = webhookDeliveryService;
    }

    @KafkaListener(
            topics = KafkaTopics.DELIVERIES_DISPATCH,
            groupId = "${spring.kafka.consumer.group-id}",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void consumeDispatch(
            @Payload DeliveryMessage message,
            @Header(KafkaHeaders.RECEIVED_KEY) String key,
            @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
            @Header(name = "X-Correlation-ID", required = false) byte[] correlationIdBytes,
            Acknowledgment acknowledgment) {
        
        String correlationId = extractCorrelationId(correlationIdBytes);
        MDC.put(CORRELATION_ID_KEY, correlationId);
        
        try {
            log.info("Received delivery from {}: deliveryId={}, endpointId={}", 
                    topic, message.getDeliveryId(), message.getEndpointId());
            
            webhookDeliveryService.processDelivery(message);
            acknowledgment.acknowledge();
            log.debug("Acknowledged message for delivery: {}", message.getDeliveryId());
        } finally {
            MDC.remove(CORRELATION_ID_KEY);
        }
    }

    @KafkaListener(
            topics = {
                    KafkaTopics.DELIVERIES_RETRY_1M,
                    KafkaTopics.DELIVERIES_RETRY_5M,
                    KafkaTopics.DELIVERIES_RETRY_15M,
                    KafkaTopics.DELIVERIES_RETRY_1H,
                    KafkaTopics.DELIVERIES_RETRY_6H,
                    KafkaTopics.DELIVERIES_RETRY_24H
            },
            groupId = "${spring.kafka.consumer.group-id}",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void consumeRetry(
            @Payload DeliveryMessage message,
            @Header(KafkaHeaders.RECEIVED_KEY) String key,
            @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
            @Header(name = "X-Correlation-ID", required = false) byte[] correlationIdBytes,
            Acknowledgment acknowledgment) {
        
        String correlationId = extractCorrelationId(correlationIdBytes);
        MDC.put(CORRELATION_ID_KEY, correlationId);
        
        try {
            log.info("Received retry from {}: deliveryId={}, attempt={}", 
                    topic, message.getDeliveryId(), message.getAttemptCount());
            
            webhookDeliveryService.processDelivery(message);
            acknowledgment.acknowledge();
            log.debug("Acknowledged retry message for delivery: {}", message.getDeliveryId());
        } finally {
            MDC.remove(CORRELATION_ID_KEY);
        }
    }

    private String extractCorrelationId(byte[] correlationIdBytes) {
        if (correlationIdBytes != null && correlationIdBytes.length > 0) {
            return new String(correlationIdBytes);
        }
        return UUID.randomUUID().toString();
    }
}
