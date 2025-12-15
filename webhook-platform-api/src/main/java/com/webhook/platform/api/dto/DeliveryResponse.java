package com.webhook.platform.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DeliveryResponse {
    private UUID id;
    private UUID eventId;
    private UUID endpointId;
    private UUID subscriptionId;
    private String status;
    private Integer attemptCount;
    private Integer maxAttempts;
    private Instant nextRetryAt;
    private Instant lastAttemptAt;
    private Instant succeededAt;
    private Instant failedAt;
    private Instant createdAt;
}
