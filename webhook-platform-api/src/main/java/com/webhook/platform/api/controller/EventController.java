package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.EventIngestRequest;
import com.webhook.platform.api.dto.EventIngestResponse;
import com.webhook.platform.api.security.ApiKeyAuthenticationToken;
import com.webhook.platform.api.service.EventIngestService;
import com.webhook.platform.api.service.RedisRateLimiterService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/events")
@Slf4j
public class EventController {

    private static final String IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
    private final EventIngestService eventIngestService;
    private final RedisRateLimiterService rateLimiterService;

    public EventController(
            EventIngestService eventIngestService,
            RedisRateLimiterService rateLimiterService) {
        this.eventIngestService = eventIngestService;
        this.rateLimiterService = rateLimiterService;
    }

    @PostMapping
    public ResponseEntity<EventIngestResponse> ingestEvent(
            @RequestBody EventIngestRequest request,
            @RequestHeader(value = IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey,
            Authentication authentication) {

        if (!(authentication instanceof ApiKeyAuthenticationToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        ApiKeyAuthenticationToken apiKeyAuth = (ApiKeyAuthenticationToken) authentication;
        
        if (!rateLimiterService.tryAcquire(apiKeyAuth.getProjectId())) {
            long retryAfter = rateLimiterService.getSecondsToWaitForRefill(apiKeyAuth.getProjectId());
            log.warn("Rate limit exceeded for project: {}", apiKeyAuth.getProjectId());
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", String.valueOf(retryAfter))
                    .build();
        }
        
        log.info("Ingesting event type: {} for project: {}", request.getType(), apiKeyAuth.getProjectId());

        EventIngestResponse response = eventIngestService.ingestEvent(
                apiKeyAuth.getProjectId(),
                request,
                idempotencyKey
        );

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
