package com.webhook.platform.common.security;

import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class UrlValidatorTest {

    @Test
    void shouldAllowValidHttpUrl() {
        assertDoesNotThrow(() -> 
            UrlValidator.validateWebhookUrl("http://example.com/webhook", false, Collections.emptyList())
        );
    }

    @Test
    void shouldAllowValidHttpsUrl() {
        assertDoesNotThrow(() -> 
            UrlValidator.validateWebhookUrl("https://example.com/webhook", false, Collections.emptyList())
        );
    }

    @Test
    void shouldRejectNonHttpScheme() {
        assertThrows(UrlValidator.InvalidUrlException.class, () -> 
            UrlValidator.validateWebhookUrl("ftp://example.com", false, Collections.emptyList())
        );
    }

    @Test
    void shouldRejectFileScheme() {
        assertThrows(UrlValidator.InvalidUrlException.class, () -> 
            UrlValidator.validateWebhookUrl("file:///etc/passwd", false, Collections.emptyList())
        );
    }

    @Test
    void shouldRejectLocalhostByDefault() {
        assertThrows(UrlValidator.InvalidUrlException.class, () -> 
            UrlValidator.validateWebhookUrl("http://localhost:8080", false, Collections.emptyList())
        );
    }

    @Test
    void shouldReject127001ByDefault() {
        assertThrows(UrlValidator.InvalidUrlException.class, () -> 
            UrlValidator.validateWebhookUrl("http://127.0.0.1", false, Collections.emptyList())
        );
    }

    @Test
    void shouldRejectPrivate10Network() {
        assertThrows(UrlValidator.InvalidUrlException.class, () -> 
            UrlValidator.validateWebhookUrl("http://10.0.0.1", false, Collections.emptyList())
        );
    }

    @Test
    void shouldRejectPrivate192168Network() {
        assertThrows(UrlValidator.InvalidUrlException.class, () -> 
            UrlValidator.validateWebhookUrl("http://192.168.1.1", false, Collections.emptyList())
        );
    }

    @Test
    void shouldRejectPrivate172Network() {
        assertThrows(UrlValidator.InvalidUrlException.class, () -> 
            UrlValidator.validateWebhookUrl("http://172.16.0.1", false, Collections.emptyList())
        );
    }

    @Test
    void shouldRejectLinkLocal() {
        assertThrows(UrlValidator.InvalidUrlException.class, () -> 
            UrlValidator.validateWebhookUrl("http://169.254.169.254", false, Collections.emptyList())
        );
    }

    @Test
    void shouldRejectMetadataEndpoint() {
        assertThrows(UrlValidator.InvalidUrlException.class, () -> 
            UrlValidator.validateWebhookUrl("http://metadata.google.internal", false, Collections.emptyList())
        );
    }

    @Test
    void shouldAllowPrivateIpWhenConfigured() {
        assertDoesNotThrow(() -> 
            UrlValidator.validateWebhookUrl("http://192.168.1.1", true, Collections.emptyList())
        );
    }

    @Test
    void shouldAllowWhitelistedHost() {
        assertDoesNotThrow(() -> 
            UrlValidator.validateWebhookUrl("http://test-receiver:8082/webhook", false, 
                List.of("test-receiver"))
        );
    }

    @Test
    void shouldRejectNullUrl() {
        assertThrows(UrlValidator.InvalidUrlException.class, () -> 
            UrlValidator.validateWebhookUrl(null, false, Collections.emptyList())
        );
    }

    @Test
    void shouldRejectEmptyUrl() {
        assertThrows(UrlValidator.InvalidUrlException.class, () -> 
            UrlValidator.validateWebhookUrl("", false, Collections.emptyList())
        );
    }

    @Test
    void shouldRejectUrlWithoutHost() {
        assertThrows(UrlValidator.InvalidUrlException.class, () -> 
            UrlValidator.validateWebhookUrl("http://", false, Collections.emptyList())
        );
    }
}
