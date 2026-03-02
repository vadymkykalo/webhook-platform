package com.webhook.platform.api.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EventSchemaVersionRequest {

    @NotBlank(message = "JSON Schema is required")
    private String schemaJson;

    private String compatibilityMode;

    private String description;
}
