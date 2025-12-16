package com.webhook.platform.api.controller;

import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.dto.DeliveryResponse;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.security.RbacUtil;
import com.webhook.platform.api.service.DeliveryService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.UUID;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestController
@RequestMapping("/api/v1/deliveries")
public class DeliveryController {

    private final DeliveryService deliveryService;

    public DeliveryController(DeliveryService deliveryService) {
        this.deliveryService = deliveryService;
    }

    @GetMapping("/{id}")
    public ResponseEntity<DeliveryResponse> getDelivery(
            @PathVariable("id") UUID id,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        DeliveryResponse response = deliveryService.getDelivery(id, jwtAuth.getOrganizationId());
        return ResponseEntity.ok(response);
    }

    @GetMapping
    public ResponseEntity<Page<DeliveryResponse>> listDeliveries(
            @RequestParam(value = "eventId", required = false) UUID eventId,
            Pageable pageable,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        Page<DeliveryResponse> response = deliveryService.listDeliveries(eventId, jwtAuth.getOrganizationId(), pageable);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/projects/{projectId}")
    public ResponseEntity<Page<DeliveryResponse>> listDeliveriesByProject(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(value = "status", required = false) DeliveryStatus status,
            @RequestParam(value = "endpointId", required = false) UUID endpointId,
            @RequestParam(value = "fromDate", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant fromDate,
            @RequestParam(value = "toDate", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant toDate,
            Pageable pageable,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        
        log.info("Deliveries request - projectId: {}, status: {}, endpointId: {}, fromDate: {}, toDate: {}", 
                 projectId, status, endpointId, fromDate, toDate);
        
        Page<DeliveryResponse> response = deliveryService.listDeliveriesByProject(
                projectId, jwtAuth.getOrganizationId(), status, endpointId, fromDate, toDate, pageable);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{id}/replay")
    public ResponseEntity<Void> replayDelivery(
            @PathVariable("id") UUID id,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());
        deliveryService.replayDelivery(id, jwtAuth.getOrganizationId());
        return ResponseEntity.accepted().build();
    }
}
