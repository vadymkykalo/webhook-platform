package com.webhook.platform.api.dto;

import com.webhook.platform.common.enums.IncomingAuthType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.validator.constraints.URL;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Request to create or update a forwarding destination")
public class IncomingDestinationRequest {

    @Schema(description = "Destination URL to forward webhooks to", example = "https://api.example.com/webhooks")
    @NotBlank(message = "URL is required")
    @URL(message = "Invalid URL format")
    private String url;

    @Schema(description = "Authentication type for the destination")
    private IncomingAuthType authType;

    @Schema(description = "JSON auth config (encrypted at rest). Keys depend on authType: BEARER={token}, BASIC={username,password}, CUSTOM_HEADER={headerName,headerValue}")
    @Size(max = 4096, message = "Auth config must be at most 4096 characters")
    private String authConfig;

    @Schema(description = "Custom HTTP headers as JSON object", example = "{\"X-Custom\":\"value\"}")
    private String customHeadersJson;

    @Schema(description = "Whether the destination is active", example = "true")
    private Boolean enabled;

    @Schema(description = "Maximum delivery attempts before moving to DLQ", example = "5")
    private Integer maxAttempts;

    @Schema(description = "HTTP request timeout in seconds", example = "30")
    private Integer timeoutSeconds;

    @Schema(description = "Comma-separated retry delays in seconds", example = "60,300,900,3600,21600")
    @Size(max = 255, message = "Retry delays must be at most 255 characters")
    private String retryDelays;

    @Schema(description = "JSONPath expression to transform payload before forwarding (null = forward as-is)", example = "$.data")
    @Size(max = 4096, message = "Payload transform expression must be at most 4096 characters")
    private String payloadTransform;
}
