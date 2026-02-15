package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.CapturedRequestResponse;
import com.webhook.platform.api.service.TestEndpointService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/hook")
@RequiredArgsConstructor
@Tag(name = "Webhook Capture", description = "Public endpoints to receive and capture webhook requests")
public class WebhookCaptureController {

    private final TestEndpointService testEndpointService;
    private final ObjectMapper objectMapper;

    @RequestMapping(value = "/{slug}", method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE})
    @Operation(summary = "Capture webhook request", description = "Captures any HTTP request sent to this test endpoint")
    public ResponseEntity<Map<String, Object>> captureRequest(
            @PathVariable("slug") String slug,
            @RequestBody(required = false) String body,
            HttpServletRequest request) {
        
        CapturedRequestResponse captured = testEndpointService.captureRequest(slug, request);
        
        // Auto-respond to verification challenges
        if (body != null && !body.isEmpty()) {
            try {
                JsonNode json = objectMapper.readTree(body);
                if (json.has("type") && "webhook.verification".equals(json.get("type").asText())) {
                    String challenge = json.has("challenge") ? json.get("challenge").asText() : null;
                    if (challenge != null) {
                        log.info("Test endpoint {} responding to verification challenge", slug);
                        return ResponseEntity.ok(Map.of(
                                "success", true,
                                "message", "Verification challenge accepted",
                                "challenge", challenge,
                                "requestId", captured.getId()
                        ));
                    }
                }
            } catch (Exception e) {
                // Not JSON or parsing failed, continue with normal response
            }
        }
        
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Request captured",
                "requestId", captured.getId(),
                "receivedAt", captured.getReceivedAt() != null ? captured.getReceivedAt().toString() : Instant.now().toString()
        ));
    }
}
