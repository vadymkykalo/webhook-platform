package com.webhook.platform.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubscriptionRequest {
    @NotNull(message = "Endpoint ID is required")
    private UUID endpointId;

    @NotBlank(message = "Event type is required")
    @Pattern(regexp = "^[a-z][a-z0-9_.]*$", message = "Event type must be lowercase with dots/underscores (e.g. order.created)")
    private String eventType;

    private Boolean enabled;
    
    private Boolean orderingEnabled;

    private Integer maxAttempts;

    private Integer timeoutSeconds;

    private String retryDelays;

    private String payloadTemplate;

    private String customHeaders;
}
