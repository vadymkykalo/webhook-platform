package com.webhook.platform.cli.tunnel;

import com.webhook.platform.common.dto.tunnel.TunnelRequestMessage;
import com.webhook.platform.common.dto.tunnel.TunnelResponseMessage;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class LocalForwarderTest {

    @Test
    void shouldReturnConnectionRefusedWhenPortNotListening() {
        // Use a port that is almost certainly not in use
        LocalForwarder forwarder = new LocalForwarder(19999);

        TunnelRequestMessage request = TunnelRequestMessage.builder()
                .requestId("test-req-001")
                .method("GET")
                .path("/health")
                .timestampMs(System.currentTimeMillis())
                .build();

        TunnelResponseMessage response = forwarder.forward(request);

        assertNotNull(response);
        assertEquals("test-req-001", response.getRequestId());
        assertEquals(502, response.getStatusCode());
        assertNotNull(response.getError());
        assertTrue(response.getError().contains("Connection refused") || response.getError().contains("not reachable")
                || response.getError().contains("error"), "Expected connection error, got: " + response.getError());
        assertTrue(response.getDurationMs() >= 0);
    }

    @Test
    void shouldHandleNullPath() {
        LocalForwarder forwarder = new LocalForwarder(19999);

        TunnelRequestMessage request = TunnelRequestMessage.builder()
                .requestId("test-req-002")
                .method("GET")
                .path(null)
                .timestampMs(System.currentTimeMillis())
                .build();

        TunnelResponseMessage response = forwarder.forward(request);

        assertNotNull(response);
        assertEquals("test-req-002", response.getRequestId());
        assertEquals(502, response.getStatusCode());
    }

    @Test
    void shouldPreserveRequestIdInResponse() {
        LocalForwarder forwarder = new LocalForwarder(19999);

        TunnelRequestMessage request = TunnelRequestMessage.builder()
                .requestId("correlation-id-xyz")
                .method("POST")
                .path("/webhook")
                .body("{\"test\":true}")
                .headers(Map.of("Content-Type", "application/json"))
                .timestampMs(System.currentTimeMillis())
                .build();

        TunnelResponseMessage response = forwarder.forward(request);

        assertNotNull(response);
        assertEquals("correlation-id-xyz", response.getRequestId());
    }

    @Test
    void shouldHandleQueryString() {
        LocalForwarder forwarder = new LocalForwarder(19999);

        TunnelRequestMessage request = TunnelRequestMessage.builder()
                .requestId("test-req-003")
                .method("GET")
                .path("/callback")
                .queryString("code=abc&state=xyz")
                .timestampMs(System.currentTimeMillis())
                .build();

        TunnelResponseMessage response = forwarder.forward(request);

        assertNotNull(response);
        assertEquals("test-req-003", response.getRequestId());
        // Even though connection is refused, the request was properly constructed
        assertEquals(502, response.getStatusCode());
    }
}
