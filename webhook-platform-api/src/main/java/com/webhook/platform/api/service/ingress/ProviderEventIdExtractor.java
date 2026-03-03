package com.webhook.platform.api.service.ingress;

import jakarta.servlet.http.HttpServletRequest;

import java.util.List;

public final class ProviderEventIdExtractor {

    private static final List<String> PROVIDER_EVENT_ID_HEADERS = List.of(
            "X-Webhook-Id",              // Generic
            "Stripe-Webhook-Id",         // Stripe
            "X-GitHub-Delivery",         // GitHub
            "X-Shopify-Webhook-Id",      // Shopify
            "X-Request-Id",              // Generic fallback
            "X-Twilio-Webhook-Id",       // Twilio
            "X-Slack-Request-Timestamp"  // Slack (timestamp as dedup key)
    );

    private ProviderEventIdExtractor() {
    }

    public static String extract(HttpServletRequest request, String bodySha256) {
        for (String header : PROVIDER_EVENT_ID_HEADERS) {
            String value = request.getHeader(header);
            if (value != null && !value.isBlank()) {
                return truncate(value.trim(), 255);
            }
        }
        // Fallback: use body hash as dedup key (same payload = duplicate)
        return bodySha256;
    }

    static String truncate(String str, int maxLength) {
        if (str == null || str.length() <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength);
    }
}
