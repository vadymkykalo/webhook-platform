package com.webhook.platform.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
public class EndpointRequest {
    @NotBlank(message = "URL is required")
    @URL(message = "Invalid URL format")
    private String url;

    @Size(max = 500, message = "Description must be at most 500 characters")
    private String description;

    private String secret;

    private Boolean enabled;

    @Min(value = 1, message = "Rate limit must be at least 1")
    @Max(value = 10000, message = "Rate limit must be at most 10000")
    private Integer rateLimitPerSecond;
}
