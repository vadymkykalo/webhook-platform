package com.webhook.platform.testreceiver;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@Slf4j
public class TestReceiverController {

    private final Map<String, WebhookRequest> requests = new ConcurrentHashMap<>();

    @PostMapping("/webhook")
    public ResponseEntity<Map<String, String>> receiveWebhook(
            @RequestHeader Map<String, String> headers,
            @RequestBody String body) {
        
        String id = UUID.randomUUID().toString();
        WebhookRequest request = new WebhookRequest(id, headers, body, Instant.now());
        requests.put(id, request);
        
        log.info("Received webhook: id={}, headers={}", id, headers.keySet());
        
        return ResponseEntity.ok(Map.of("id", id, "status", "received"));
    }

    @GetMapping("/requests")
    public ResponseEntity<List<WebhookRequest>> getRequests() {
        return ResponseEntity.ok(new ArrayList<>(requests.values()));
    }

    @DeleteMapping("/requests")
    public ResponseEntity<Void> clearRequests() {
        requests.clear();
        log.info("Cleared all requests");
        return ResponseEntity.noContent().build();
    }
}
