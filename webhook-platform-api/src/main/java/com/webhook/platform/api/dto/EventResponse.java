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
public class EventResponse {
    private UUID id;
    private UUID projectId;
    private String eventType;
    private String payload;
    private Instant createdAt;
    private Integer deliveriesCreated;
}
