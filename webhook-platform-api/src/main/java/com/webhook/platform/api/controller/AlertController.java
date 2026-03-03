package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.AlertEventResponse;
import com.webhook.platform.api.dto.AlertRuleRequest;
import com.webhook.platform.api.dto.AlertRuleResponse;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.service.AlertService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/alerts")
@Tag(name = "Alerts", description = "Alert rules and fired alert events")
@SecurityRequirement(name = "bearerAuth")
@SecurityRequirement(name = "apiKey")
@RequiredArgsConstructor
public class AlertController {

    private final AlertService alertService;

    // ─── Rules ──────────────────────────────────────────────────────────

    @Operation(summary = "List alert rules")
    @GetMapping("/rules")
    public ResponseEntity<List<AlertRuleResponse>> listRules(
            @PathVariable("projectId") UUID projectId,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(alertService.listRules(projectId, auth.organizationId()));
    }

    @Operation(summary = "Create alert rule")
    @ApiResponse(responseCode = "201", description = "Rule created")
    @PostMapping("/rules")
    public ResponseEntity<AlertRuleResponse> createRule(
            @PathVariable("projectId") UUID projectId,
            @Valid @RequestBody AlertRuleRequest request,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(alertService.createRule(projectId, request, auth.organizationId()));
    }

    @Operation(summary = "Update alert rule")
    @PutMapping("/rules/{ruleId}")
    public ResponseEntity<AlertRuleResponse> updateRule(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("ruleId") UUID ruleId,
            @Valid @RequestBody AlertRuleRequest request,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(alertService.updateRule(projectId, ruleId, request, auth.organizationId()));
    }

    @Operation(summary = "Delete alert rule")
    @ApiResponse(responseCode = "204", description = "Rule deleted")
    @DeleteMapping("/rules/{ruleId}")
    public ResponseEntity<Void> deleteRule(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("ruleId") UUID ruleId,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        alertService.deleteRule(projectId, ruleId, auth.organizationId());
        return ResponseEntity.noContent().build();
    }

    // ─── Events ─────────────────────────────────────────────────────────

    @Operation(summary = "List alert events (fired alerts)")
    @GetMapping("/events")
    public ResponseEntity<Page<AlertEventResponse>> listEvents(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(alertService.listEvents(projectId, auth.organizationId(), page, size));
    }

    @Operation(summary = "Count unresolved alerts")
    @GetMapping("/events/unresolved-count")
    public ResponseEntity<Map<String, Long>> countUnresolved(
            @PathVariable("projectId") UUID projectId,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        long count = alertService.countUnresolved(projectId, auth.organizationId());
        return ResponseEntity.ok(Map.of("count", count));
    }

    @Operation(summary = "Resolve a single alert event")
    @PostMapping("/events/{eventId}/resolve")
    public ResponseEntity<Void> resolveEvent(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("eventId") UUID eventId,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        alertService.resolveEvent(projectId, eventId, auth.organizationId());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Resolve all unresolved alert events")
    @PostMapping("/events/resolve-all")
    public ResponseEntity<Map<String, Integer>> resolveAll(
            @PathVariable("projectId") UUID projectId,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        int resolved = alertService.resolveAll(projectId, auth.organizationId());
        return ResponseEntity.ok(Map.of("resolved", resolved));
    }
}
