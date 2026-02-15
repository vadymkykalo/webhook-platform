package com.webhook.platform.api.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EventIngestRequest {
    @NotBlank(message = "Event type is required")
    @Pattern(regexp = "^[a-z][a-z0-9_.]*$", message = "Event type must be lowercase with dots/underscores (e.g. order.created)")
    private String type;

    @NotNull(message = "Event data is required")
    private JsonNode data;
}
