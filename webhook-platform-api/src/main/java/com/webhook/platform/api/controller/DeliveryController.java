package com.webhook.platform.api.controller;

import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.dto.DeliveryAttemptResponse;
import com.webhook.platform.api.dto.DeliveryResponse;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.security.RbacUtil;
import com.webhook.platform.api.service.DeliveryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestController
@RequestMapping("/api/v1/deliveries")
@Tag(name = "Deliveries", description = "Delivery status and replay operations")
@SecurityRequirement(name = "bearerAuth")
public class DeliveryController {

    private final DeliveryService deliveryService;

    public DeliveryController(DeliveryService deliveryService) {
        this.deliveryService = deliveryService;
    }

    @Operation(summary = "Get delivery", description = "Returns delivery details by ID")
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

    @Operation(summary = "List deliveries", description = "Returns paginated list of deliveries")
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

    @Operation(summary = "List deliveries by project", description = "Returns paginated deliveries with filtering")
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

    @Operation(summary = "Replay delivery", description = "Re-sends a failed delivery")
    @ApiResponse(responseCode = "202", description = "Replay initiated")
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

    @Operation(summary = "Get delivery attempts", description = "Returns all delivery attempts with request/response details")
    @GetMapping("/{id}/attempts")
    public ResponseEntity<List<DeliveryAttemptResponse>> getDeliveryAttempts(
            @PathVariable("id") UUID id,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        List<DeliveryAttemptResponse> response = deliveryService.getDeliveryAttempts(id, jwtAuth.getOrganizationId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Bulk replay deliveries", description = "Re-sends multiple failed deliveries at once")
    @ApiResponse(responseCode = "202", description = "Bulk replay initiated")
    @PostMapping("/bulk-replay")
    public ResponseEntity<com.webhook.platform.api.dto.BulkReplayResponse> bulkReplayDeliveries(
            @RequestBody com.webhook.platform.api.dto.BulkReplayRequest request,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());
        
        int replayedCount = deliveryService.bulkReplayDeliveries(
                request.getDeliveryIds(),
                request.getStatus(),
                request.getEndpointId(),
                request.getProjectId(),
                jwtAuth.getOrganizationId()
        );
        
        int totalRequested = request.getDeliveryIds() != null ? request.getDeliveryIds().size() : 0;
        int skipped = totalRequested > 0 ? totalRequested - replayedCount : 0;
        
        return ResponseEntity.accepted().body(
                com.webhook.platform.api.dto.BulkReplayResponse.builder()
                        .totalRequested(totalRequested)
                        .replayed(replayedCount)
                        .skipped(skipped)
                        .message("Bulk replay initiated for " + replayedCount + " deliveries")
                        .build()
        );
    }
}
