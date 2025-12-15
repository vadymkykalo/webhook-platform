package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.DeliveryResponse;
import com.webhook.platform.api.service.DeliveryService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/deliveries")
public class DeliveryController {

    private final DeliveryService deliveryService;

    public DeliveryController(DeliveryService deliveryService) {
        this.deliveryService = deliveryService;
    }

    @GetMapping("/{id}")
    public ResponseEntity<DeliveryResponse> getDelivery(@PathVariable("id") UUID id) {
        DeliveryResponse response = deliveryService.getDelivery(id);
        return ResponseEntity.ok(response);
    }

    @GetMapping
    public ResponseEntity<Page<DeliveryResponse>> listDeliveries(
            @RequestParam(value = "eventId", required = false) UUID eventId,
            Pageable pageable) {
        Page<DeliveryResponse> response = deliveryService.listDeliveries(eventId, pageable);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{id}/replay")
    public ResponseEntity<Void> replayDelivery(@PathVariable("id") UUID id) {
        deliveryService.replayDelivery(id);
        return ResponseEntity.accepted().build();
    }
}
