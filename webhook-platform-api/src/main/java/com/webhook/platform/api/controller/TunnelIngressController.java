package com.webhook.platform.api.controller;

import com.webhook.platform.api.domain.entity.TunnelRequestLog;
import com.webhook.platform.api.domain.entity.TunnelSession;
import com.webhook.platform.api.domain.repository.TunnelRequestLogRepository;
import com.webhook.platform.api.service.RedisTunnelCoordinator;
import com.webhook.platform.api.service.RedisRateLimiterService;
import com.webhook.platform.api.service.TunnelBandwidthService;
import com.webhook.platform.api.service.TunnelRegistry;
import com.webhook.platform.api.service.TunnelService;
import com.webhook.platform.api.tenancy.TenantContext;
import com.webhook.platform.common.dto.tunnel.TunnelRequestMessage;
import com.webhook.platform.common.dto.tunnel.TunnelResponseMessage;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.concurrent.Executor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
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
public class TunnelIngressController {

    private final TunnelService tunnelService;
    private final TunnelRegistry tunnelRegistry;
    private final RedisTunnelCoordinator redisTunnelCoordinator;
    private final RedisRateLimiterService rateLimiterService;
    private final TunnelRequestLogRepository requestLogRepository;
    private final TunnelBandwidthService bandwidthService;
    private final MeterRegistry meterRegistry;
    private final Executor tunnelMeteringExecutor;

    private static final int MAX_BODY_SIZE = 512 * 1024; // 512KB
    private static final int RATE_LIMIT_PER_SECOND = 10;

    public TunnelIngressController(TunnelService tunnelService,
                                   TunnelRegistry tunnelRegistry,
                                   RedisTunnelCoordinator redisTunnelCoordinator,
                                   RedisRateLimiterService rateLimiterService,
                                   TunnelRequestLogRepository requestLogRepository,
                                   TunnelBandwidthService bandwidthService,
                                   MeterRegistry meterRegistry,
                                   @Qualifier("tunnelMeteringExecutor") Executor tunnelMeteringExecutor) {
        this.tunnelService = tunnelService;
        this.tunnelRegistry = tunnelRegistry;
        this.redisTunnelCoordinator = redisTunnelCoordinator;
        this.rateLimiterService = rateLimiterService;
        this.requestLogRepository = requestLogRepository;
        this.bandwidthService = bandwidthService;
        this.meterRegistry = meterRegistry;
        this.tunnelMeteringExecutor = tunnelMeteringExecutor;
    }

    @RequestMapping(value = "/{slug}", method = {RequestMethod.GET, RequestMethod.POST,
            RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE, RequestMethod.HEAD, RequestMethod.OPTIONS})
    @Operation(summary = "Tunnel ingress", description = "Forward request through CLI tunnel to local application")
    public ResponseEntity<String> handleTunnelRequest(
            @PathVariable("slug") String slug,
            @RequestBody(required = false) String body,
            HttpServletRequest request) {

        if (!redisTunnelCoordinator.isActiveInCluster(slug)) {
            ingressCounter("offline").increment();
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body("{\"error\":\"tunnel_offline\",\"message\":\"Tunnel is not connected\"}");
        }

        // Rate limit per slug (10 req/s) — Redis-backed for multi-instance consistency
        if (!rateLimiterService.tryAcquireForSlug(slug, RATE_LIMIT_PER_SECOND)) {
            log.warn("Rate limit exceeded for tunnel slug: {}", slug);
            ingressCounter("rate_limited").increment();
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body("{\"error\":\"rate_limit_exceeded\",\"message\":\"Too many requests to this tunnel\"}");
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

        long startMs = System.currentTimeMillis();
        TunnelResponseMessage tunnelResponse = redisTunnelCoordinator.forwardRequest(slug, tunnelRequest);
        int durationMs = (int) (System.currentTimeMillis() - startMs);

        // Async metering + logging — best-effort, never block the response path
        int reqSize = body != null ? body.length() : 0;
        int respSize = tunnelResponse != null && tunnelResponse.getBody() != null ? tunnelResponse.getBody().length() : 0;
        logAndMeterAsync(slug, requestId, request.getMethod(), tunnelRequest.getPath(),
                tunnelRequest.getQueryString(), headers,
                reqSize, respSize, tunnelResponse, durationMs);

        if (tunnelResponse == null) {
            ingressCounter("timeout").increment();
            return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT)
                    .body("{\"error\":\"tunnel_timeout\",\"message\":\"Tunnel request timed out or tunnel disconnected\"}");
        }

        if (tunnelResponse.getError() != null) {
            ingressCounter("error").increment();
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body("{\"error\":\"tunnel_error\",\"message\":\"" + tunnelResponse.getError() + "\"}");
        }

        ingressCounter("success").increment();

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

    private void logAndMeterAsync(String slug, String requestId, String method, String path,
                                    String queryString, Map<String, String> reqHeaders,
                                    int requestBodySize, int responseBodySize,
                                    TunnelResponseMessage response, int durationMs) {
        tunnelMeteringExecutor.execute(() -> {
            try {
                // A tunnel request authenticates nothing -- the slug in the URL is the only thing
                // that names an organization, so the session lookup runs unscoped and everything
                // after it runs inside the organization that owns the tunnel. Without this the
                // save below would fail on an unresolved tenant, and the catch further down would
                // swallow it as a debug line: metering would just quietly stop.
                TunnelSession session = TenantContext.callAsSystem(() -> tunnelService.getActiveBySlug(slug));
                TenantContext.runAs(session.getOrganizationId(), () -> {

                // Bandwidth metering — single Redis increment
                bandwidthService.recordBytes(requestBodySize + responseBodySize);

                // Request log
                TunnelRequestLog logEntry = TunnelRequestLog.builder()
                        .tunnelSessionId(session.getId())
                        .organizationId(session.getOrganizationId())
                        .slug(slug)
                        .requestId(requestId)
                        .method(method)
                        .path(path)
                        .queryString(queryString)
                        .requestHeaders(reqHeaders)
                        .requestBodySize(requestBodySize)
                        .responseStatus(response != null ? response.getStatusCode() : null)
                        .responseHeaders(response != null ? response.getHeaders() : null)
                        .responseBodySize(responseBodySize)
                        .durationMs(durationMs)
                        .error(response != null ? response.getError() : "timeout")
                        .build();
                requestLogRepository.save(logEntry);
                });
            } catch (Exception e) {
                log.debug("Failed to log/meter tunnel request: slug={}, error={}", slug, e.getMessage());
            }
        });
    }

    private Counter ingressCounter(String outcome) {
        return Counter.builder("tunnel_ingress_total")
                .tag("outcome", outcome)
                .register(meterRegistry);
    }

    private boolean isHopByHopHeader(String name) {
        String lower = name.toLowerCase();
        return lower.equals("connection") || lower.equals("keep-alive") ||
               lower.equals("transfer-encoding") || lower.equals("te") ||
               lower.equals("trailer") || lower.equals("upgrade") ||
               lower.equals("proxy-authorization") || lower.equals("proxy-authenticate");
    }
}
