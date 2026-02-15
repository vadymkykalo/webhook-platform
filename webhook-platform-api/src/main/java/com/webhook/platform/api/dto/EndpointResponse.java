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
public class EndpointResponse {
    private UUID id;
    private UUID projectId;
    private String url;
    private String description;
    private Boolean enabled;
    private Integer rateLimitPerSecond;
    private String allowedSourceIps;
    private Instant createdAt;
    private Instant updatedAt;
    private String secret;
}
