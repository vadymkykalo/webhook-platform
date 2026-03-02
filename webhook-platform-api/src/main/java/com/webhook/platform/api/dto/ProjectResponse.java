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
public class ProjectResponse {
    private UUID id;
    private String name;
    private String description;
    private Boolean schemaValidationEnabled;
    private String schemaValidationPolicy;
    private String idempotencyPolicy;
    private Instant createdAt;
    private Instant updatedAt;
}
