package com.webhook.platform.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EndpointRequest {
    private String url;
    private String description;
    private String secret;
    private Boolean enabled;
    private Integer rateLimitPerSecond;
}
