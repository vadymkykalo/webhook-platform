package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.SubscriptionRequest;
import com.webhook.platform.api.dto.SubscriptionResponse;
import com.webhook.platform.api.service.SubscriptionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/subscriptions")
public class SubscriptionController {

    private final SubscriptionService subscriptionService;

    public SubscriptionController(SubscriptionService subscriptionService) {
        this.subscriptionService = subscriptionService;
    }

    @PostMapping
    public ResponseEntity<SubscriptionResponse> createSubscription(
            @PathVariable UUID projectId,
            @RequestBody SubscriptionRequest request) {
        SubscriptionResponse response = subscriptionService.createSubscription(projectId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<SubscriptionResponse> getSubscription(@PathVariable UUID id) {
        SubscriptionResponse response = subscriptionService.getSubscription(id);
        return ResponseEntity.ok(response);
    }

    @GetMapping
    public ResponseEntity<List<SubscriptionResponse>> listSubscriptions(@PathVariable UUID projectId) {
        List<SubscriptionResponse> response = subscriptionService.listSubscriptions(projectId);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{id}")
    public ResponseEntity<SubscriptionResponse> updateSubscription(
            @PathVariable UUID id,
            @RequestBody SubscriptionRequest request) {
        SubscriptionResponse response = subscriptionService.updateSubscription(id, request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSubscription(@PathVariable UUID id) {
        subscriptionService.deleteSubscription(id);
        return ResponseEntity.noContent().build();
    }
}
