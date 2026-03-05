package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.CapturedRequestResponse;
import com.webhook.platform.api.dto.WebhookCaptureResponse;
import com.webhook.platform.api.service.TestEndpointService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Slf4j
@RestController
@RequestMapping("/hook")
@Tag(name = "Webhook Capture", description = "Public endpoints to receive and capture webhook requests")
public class WebhookCaptureController {

    private static final int RATE_LIMIT_PER_SECOND = 10;

    private final TestEndpointService testEndpointService;
    private final ObjectMapper objectMapper;

    /** Per-slug in-memory rate limiters to protect public /hook/{slug} endpoint */
    private final ConcurrentMap<String, Bucket> slugBuckets = new ConcurrentHashMap<>();

    public WebhookCaptureController(TestEndpointService testEndpointService, ObjectMapper objectMapper) {
        this.testEndpointService = testEndpointService;
        this.objectMapper = objectMapper;
    }

    @RequestMapping(value = "/{slug}", method = { RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT,
            RequestMethod.PATCH, RequestMethod.DELETE })
    @Operation(summary = "Capture webhook request", description = "Captures any HTTP request sent to this test endpoint")
    public ResponseEntity<WebhookCaptureResponse> captureRequest(
            @PathVariable("slug") String slug,
            @RequestBody(required = false) String body,
            HttpServletRequest request) {

        // Rate limit per slug (10 req/s)
        Bucket bucket = slugBuckets.computeIfAbsent(slug, k -> Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(RATE_LIMIT_PER_SECOND)
                        .refillGreedy(RATE_LIMIT_PER_SECOND, Duration.ofSeconds(1))
                        .build())
                .build());

        if (!bucket.tryConsume(1)) {
            log.warn("Rate limit exceeded for test endpoint slug: {}", slug);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(WebhookCaptureResponse.builder()
                            .success(false)
                            .error("rate_limit_exceeded")
                            .message("Too many requests to this test endpoint")
                            .build());
        }

        // Auto-respond to verification challenges BEFORE slug lookup
        // so verification works even if the test endpoint expired or was deleted
        if (body != null && !body.isEmpty()) {
            try {
                JsonNode json = objectMapper.readTree(body);
                if (json.has("type") && "webhook.verification".equals(json.get("type").asText())) {
                    String challenge = json.has("challenge") ? json.get("challenge").asText() : null;
                    if (challenge != null) {
                        log.info("Endpoint /hook/{} responding to verification challenge", slug);
                        return ResponseEntity.ok(WebhookCaptureResponse.builder()
                                .success(true)
                                .message("Verification challenge accepted")
                                .challenge(challenge)
                                .build());
                    }
                }
            } catch (Exception e) {
                // Not JSON or parsing failed, continue with normal capture flow
            }
        }

        CapturedRequestResponse captured = testEndpointService.captureRequest(slug, request);

        return ResponseEntity.ok(WebhookCaptureResponse.builder()
                .success(true)
                .message("Request captured")
                .requestId(captured.getId())
                .receivedAt(captured.getReceivedAt() != null ? captured.getReceivedAt().toString() : Instant.now().toString())
                .build());
    }
}
