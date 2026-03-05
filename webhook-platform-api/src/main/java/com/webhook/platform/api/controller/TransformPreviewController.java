package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.DeliveryDryRunRequest;
import com.webhook.platform.api.dto.DeliveryDryRunResponse;
import com.webhook.platform.api.dto.TransformPreviewRequest;
import com.webhook.platform.api.dto.TransformPreviewResponse;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.service.DeliveryDryRunService;
import com.webhook.platform.api.service.TransformPreviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/transform-preview")
@Tag(name = "Transform Preview", description = "Preview payload transformations and dry-run deliveries")
@SecurityRequirement(name = "bearerAuth")
@SecurityRequirement(name = "apiKey")
@RequiredArgsConstructor
public class TransformPreviewController {

    private final TransformPreviewService transformPreviewService;
    private final DeliveryDryRunService deliveryDryRunService;

    @Operation(summary = "Preview transform", description = "Test a payload transform expression against sample input")
    @PostMapping
    public ResponseEntity<TransformPreviewResponse> preview(
            @PathVariable("projectId") UUID projectId,
            @Valid @RequestBody TransformPreviewRequest request,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(transformPreviewService.preview(request));
    }

    @Operation(summary = "Dry-run delivery", description = "Simulate a full delivery: transform payload, compute HMAC signature, build headers — without actually sending the request")
    @PostMapping("/delivery-dry-run")
    public ResponseEntity<DeliveryDryRunResponse> deliveryDryRun(
            @PathVariable("projectId") UUID projectId,
            @Valid @RequestBody DeliveryDryRunRequest request,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(deliveryDryRunService.dryRun(request, auth.organizationId()));
    }
}
