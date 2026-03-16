package com.webhook.platform.api.controller;

import com.webhook.platform.api.domain.entity.TunnelSession;
import com.webhook.platform.api.service.TunnelRegistry;
import com.webhook.platform.api.service.TunnelService;
import com.webhook.platform.common.dto.tunnel.TunnelRequestMessage;
import com.webhook.platform.common.dto.tunnel.TunnelResponseMessage;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Public endpoint that accepts incoming HTTP requests destined for a CLI tunnel.
 * The request is forwarded through the WebSocket connection to the CLI client,
 * which forwards it to the local application and returns the response.
 */
@Slf4j
@RestController
@RequestMapping("/tunnel")
@Tag(name = "Tunnel Ingress", description = "Public tunnel ingress endpoints")
@RequiredArgsConstructor
public class TunnelIngressController {

    private final TunnelService tunnelService;
    private final TunnelRegistry tunnelRegistry;

    private static final int MAX_BODY_SIZE = 512 * 1024; // 512KB

    @RequestMapping(value = "/{slug}", method = {RequestMethod.GET, RequestMethod.POST,
            RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE, RequestMethod.HEAD, RequestMethod.OPTIONS})
    @Operation(summary = "Tunnel ingress", description = "Forward request through CLI tunnel to local application")
    public ResponseEntity<String> handleTunnelRequest(
            @PathVariable("slug") String slug,
            @RequestBody(required = false) String body,
            HttpServletRequest request) {

        if (!tunnelRegistry.isActive(slug)) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body("{\"error\":\"tunnel_offline\",\"message\":\"Tunnel is not connected\"}");
        }

        if (body != null && body.length() > MAX_BODY_SIZE) {
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                    .body("{\"error\":\"payload_too_large\",\"message\":\"Request body exceeds maximum size\"}");
        }

        Map<String, String> headers = extractHeaders(request);
        String requestId = UUID.randomUUID().toString();

        TunnelRequestMessage tunnelRequest = TunnelRequestMessage.builder()
                .type("TUNNEL_REQUEST")
                .requestId(requestId)
                .method(request.getMethod())
                .path(request.getRequestURI().replaceFirst("/tunnel/" + slug, ""))
                .queryString(request.getQueryString())
                .headers(headers)
                .body(body)
                .timestampMs(System.currentTimeMillis())
                .build();

        TunnelResponseMessage tunnelResponse = tunnelRegistry.forwardRequest(slug, tunnelRequest);

        if (tunnelResponse == null) {
            return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT)
                    .body("{\"error\":\"tunnel_timeout\",\"message\":\"Tunnel request timed out or tunnel disconnected\"}");
        }

        if (tunnelResponse.getError() != null) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body("{\"error\":\"tunnel_error\",\"message\":\"" + tunnelResponse.getError() + "\"}");
        }

        HttpHeaders responseHeaders = new HttpHeaders();
        if (tunnelResponse.getHeaders() != null) {
            tunnelResponse.getHeaders().forEach((key, value) -> {
                // Skip hop-by-hop headers
                if (!isHopByHopHeader(key)) {
                    responseHeaders.add(key, value);
                }
            });
        }

        return ResponseEntity.status(tunnelResponse.getStatusCode())
                .headers(responseHeaders)
                .body(tunnelResponse.getBody());
    }

    private Map<String, String> extractHeaders(HttpServletRequest request) {
        Map<String, String> headers = new LinkedHashMap<>();
        Enumeration<String> names = request.getHeaderNames();
        while (names.hasMoreElements()) {
            String name = names.nextElement();
            // Skip hop-by-hop and internal headers
            if (!isHopByHopHeader(name) && !name.equalsIgnoreCase("host")) {
                headers.put(name, request.getHeader(name));
            }
        }
        return headers;
    }

    private boolean isHopByHopHeader(String name) {
        String lower = name.toLowerCase();
        return lower.equals("connection") || lower.equals("keep-alive") ||
               lower.equals("transfer-encoding") || lower.equals("te") ||
               lower.equals("trailer") || lower.equals("upgrade") ||
               lower.equals("proxy-authorization") || lower.equals("proxy-authenticate");
    }
}
