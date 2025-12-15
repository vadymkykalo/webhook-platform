package com.webhook.platform.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DeliveryMessage {
    private UUID deliveryId;
    private UUID eventId;
    private UUID endpointId;
    private UUID subscriptionId;
    private String status;
    private Integer attemptCount;
}
