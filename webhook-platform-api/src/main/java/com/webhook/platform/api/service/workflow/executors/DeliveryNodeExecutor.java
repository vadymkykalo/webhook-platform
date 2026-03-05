package com.webhook.platform.api.service.workflow.executors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.webhook.platform.api.domain.entity.Delivery;
import com.webhook.platform.api.domain.entity.Endpoint;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import com.webhook.platform.api.domain.repository.DeliveryRepository;
import com.webhook.platform.api.domain.repository.EndpointRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.api.service.workflow.NodeExecutor;
import com.webhook.platform.api.service.workflow.StepResult;
import com.webhook.platform.common.constants.KafkaTopics;
import com.webhook.platform.common.dto.DeliveryMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Delivers the workflow payload to an existing platform endpoint
 * using the standard Delivery → Outbox → Kafka pipeline.
 * Config: endpointId (required), eventId (optional, from trigger data).
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class DeliveryNodeExecutor implements NodeExecutor {

    private final EndpointRepository endpointRepository;
    private final DeliveryRepository deliveryRepository;
    private final OutboxMessageRepository outboxMessageRepository;
    private final ObjectMapper objectMapper;

    @Override
    public String getType() {
        return "delivery";
    }

    @Override
    public StepResult execute(JsonNode nodeConfig, JsonNode input) {
        try {
            String endpointIdStr = nodeConfig.has("endpointId") ? nodeConfig.get("endpointId").asText() : null;
            if (endpointIdStr == null || endpointIdStr.isBlank()) {
                return StepResult.failed("Delivery node: endpointId is required");
            }

            UUID endpointId;
            try {
                endpointId = UUID.fromString(endpointIdStr);
            } catch (IllegalArgumentException e) {
                return StepResult.failed("Delivery node: invalid endpointId format");
            }

            Endpoint endpoint = endpointRepository.findById(endpointId).orElse(null);
            if (endpoint == null || endpoint.getDeletedAt() != null) {
                return StepResult.failed("Delivery node: endpoint not found or deleted");
            }
            if (!Boolean.TRUE.equals(endpoint.getEnabled())) {
                return StepResult.skipped("Delivery node: endpoint is disabled");
            }

            // Try to extract eventId from input (set by trigger node)
            UUID eventId = null;
            if (input != null && input.has("_eventId")) {
                try {
                    eventId = UUID.fromString(input.get("_eventId").asText());
                } catch (Exception ignored) {}
            }

            // Create delivery
            Delivery delivery = Delivery.builder()
                    .eventId(eventId)
                    .endpointId(endpointId)
                    .status(DeliveryStatus.PENDING)
                    .attemptCount(0)
                    .maxAttempts(7)
                    .orderingEnabled(false)
                    .timeoutSeconds(30)
                    .retryDelays("60,300,900,3600,21600,86400")
                    .build();

            delivery = deliveryRepository.save(delivery);

            // Create outbox message to dispatch via Kafka
            DeliveryMessage msg = DeliveryMessage.builder()
                    .deliveryId(delivery.getId())
                    .eventId(delivery.getEventId())
                    .endpointId(delivery.getEndpointId())
                    .status(delivery.getStatus().name())
                    .attemptCount(delivery.getAttemptCount())
                    .orderingEnabled(false)
                    .build();

            String payload = objectMapper.writeValueAsString(msg);
            outboxMessageRepository.save(OutboxMessage.builder()
                    .aggregateType("Delivery")
                    .aggregateId(delivery.getId())
                    .eventType("WorkflowDeliveryCreated")
                    .payload(payload)
                    .kafkaTopic(KafkaTopics.DELIVERIES_DISPATCH)
                    .kafkaKey(endpointId.toString())
                    .status(OutboxStatus.PENDING)
                    .retryCount(0)
                    .build());

            log.info("Workflow delivery created: {} → endpoint {}", delivery.getId(), endpointId);

            ObjectNode result = objectMapper.createObjectNode();
            result.put("deliveryId", delivery.getId().toString());
            result.put("endpointId", endpointId.toString());
            result.put("endpointUrl", endpoint.getUrl());
            result.put("status", "PENDING");
            return StepResult.success(result);
        } catch (Exception e) {
            log.error("Delivery node execution failed: {}", e.getMessage(), e);
            return StepResult.failed("Delivery error: " + e.getMessage());
        }
    }
}
