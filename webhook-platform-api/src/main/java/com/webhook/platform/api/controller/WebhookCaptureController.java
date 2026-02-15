package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.CapturedRequestResponse;
import com.webhook.platform.api.service.TestEndpointService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/hook")
@RequiredArgsConstructor
@Tag(name = "Webhook Capture", description = "Public endpoints to receive and capture webhook requests")
public class WebhookCaptureController {

    private final TestEndpointService testEndpointService;

    @RequestMapping(value = "/{slug}", method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE})
    @Operation(summary = "Capture webhook request", description = "Captures any HTTP request sent to this test endpoint")
    public ResponseEntity<Map<String, Object>> captureRequest(
            @PathVariable("slug") String slug,
            HttpServletRequest request) {
        
        CapturedRequestResponse captured = testEndpointService.captureRequest(slug, request);
        
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Request captured",
                "requestId", captured.getId(),
                "receivedAt", captured.getReceivedAt() != null ? captured.getReceivedAt().toString() : Instant.now().toString()
        ));
    }
}
