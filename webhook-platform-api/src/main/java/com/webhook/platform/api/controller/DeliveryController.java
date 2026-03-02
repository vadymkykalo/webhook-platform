package com.webhook.platform.api.controller;

import com.webhook.platform.api.domain.enums.DeliveryStatus;
import com.webhook.platform.api.dto.DeliveryAttemptResponse;
import com.webhook.platform.api.dto.DeliveryResponse;
import com.webhook.platform.api.dto.DryRunReplayResponse;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.service.DeliveryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
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
@SecurityRequirement(name = "apiKey")
public class DeliveryController {

    private final DeliveryService deliveryService;

    public DeliveryController(DeliveryService deliveryService) {
        this.deliveryService = deliveryService;
    }

    @Operation(summary = "Get delivery", description = "Returns delivery details by ID")
    @GetMapping("/{id}")
    public ResponseEntity<DeliveryResponse> getDelivery(
            @PathVariable("id") UUID id,
            AuthContext auth) {
        DeliveryResponse response = deliveryService.getDelivery(id, auth.organizationId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "List deliveries", description = "Returns paginated list of deliveries")
    @GetMapping
    public ResponseEntity<Page<DeliveryResponse>> listDeliveries(
            @RequestParam(value = "eventId", required = false) UUID eventId,
            Pageable pageable,
            AuthContext auth) {
        Page<DeliveryResponse> response = deliveryService.listDeliveries(eventId, auth.organizationId(), pageable);
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
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        log.info("Deliveries request - projectId: {}, status: {}, endpointId: {}, fromDate: {}, toDate: {}", 
                 projectId, status, endpointId, fromDate, toDate);
        
        Page<DeliveryResponse> response = deliveryService.listDeliveriesByProject(
                projectId, auth.organizationId(), status, endpointId, fromDate, toDate, pageable);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Replay delivery", description = "Re-sends a failed delivery. Use dryRun=true to preview without sending. Use fromAttempt=N to continue from a specific attempt.")
    @ApiResponse(responseCode = "202", description = "Replay initiated")
    @PostMapping("/{id}/replay")
    public ResponseEntity<?> replayDelivery(
            @PathVariable("id") UUID id,
            @RequestParam(value = "dryRun", required = false, defaultValue = "false") boolean dryRun,
            @RequestParam(value = "fromAttempt", required = false) Integer fromAttempt,
            AuthContext auth) {
        auth.requireWriteAccess();

        if (dryRun) {
            DryRunReplayResponse response = deliveryService.dryRunReplay(id, auth.organizationId());
            return ResponseEntity.ok(response);
        }

        if (fromAttempt != null) {
            deliveryService.replayFromAttempt(id, fromAttempt, auth.organizationId());
        } else {
            deliveryService.replayDelivery(id, auth.organizationId());
        }
        return ResponseEntity.accepted().build();
    }

    @Operation(summary = "Get delivery attempts", description = "Returns all delivery attempts with request/response details")
    @GetMapping("/{id}/attempts")
    public ResponseEntity<List<DeliveryAttemptResponse>> getDeliveryAttempts(
            @PathVariable("id") UUID id,
            AuthContext auth) {
        List<DeliveryAttemptResponse> response = deliveryService.getDeliveryAttempts(id, auth.organizationId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Bulk replay deliveries", description = "Re-sends multiple failed deliveries at once")
    @ApiResponse(responseCode = "202", description = "Bulk replay initiated")
    @PostMapping("/bulk-replay")
    public ResponseEntity<com.webhook.platform.api.dto.BulkReplayResponse> bulkReplayDeliveries(
            @Valid @RequestBody com.webhook.platform.api.dto.BulkReplayRequest request,
            AuthContext auth) {
        auth.requireWriteAccess();
        
        int replayedCount = deliveryService.bulkReplayDeliveries(
                request.getDeliveryIds(),
                request.getStatus(),
                request.getEndpointId(),
                request.getProjectId(),
                auth.organizationId()
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
