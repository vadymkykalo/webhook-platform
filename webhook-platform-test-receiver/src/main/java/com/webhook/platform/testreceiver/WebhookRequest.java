package com.webhook.platform.testreceiver;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.Instant;
import java.util.Map;

@Data
@AllArgsConstructor
public class WebhookRequest {
    private String id;
    private Map<String, String> headers;
    private String body;
    private Instant receivedAt;
}
