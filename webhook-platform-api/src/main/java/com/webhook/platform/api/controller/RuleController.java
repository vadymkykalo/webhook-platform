package com.webhook.platform.api.controller;

import com.webhook.platform.api.domain.enums.ApiKeyScope;
import com.webhook.platform.api.dto.RuleRequest;
import com.webhook.platform.api.dto.RuleResponse;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.security.RequireScope;
import com.webhook.platform.api.service.RuleService;
import com.webhook.platform.api.service.billing.RequireFeature;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/rules")
@Tag(name = "Rules", description = "Event routing and filtering rules")
@SecurityRequirement(name = "bearerAuth")
@SecurityRequirement(name = "apiKey")
@RequiredArgsConstructor
public class RuleController {

    private final RuleService ruleService;

    @Operation(summary = "Create rule", description = "Creates a new event processing rule with conditions and actions")
    @ApiResponse(responseCode = "201", description = "Rule created")
    @RequireScope(ApiKeyScope.READ_WRITE)
    @RequireFeature("rules")
    @PostMapping
    public ResponseEntity<RuleResponse> create(
            @PathVariable("projectId") UUID projectId,
            @Valid @RequestBody RuleRequest request,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ruleService.create(projectId, request, auth.organizationId()));
    }

    @Operation(summary = "Get rule", description = "Returns rule details with conditions, actions, and execution stats")
    @GetMapping("/{id}")
    public ResponseEntity<RuleResponse> get(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(ruleService.get(id, auth.organizationId()));
    }

    @Operation(summary = "List rules", description = "Returns all rules for the project ordered by priority")
    @GetMapping
    public ResponseEntity<List<RuleResponse>> list(
            @PathVariable("projectId") UUID projectId,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(ruleService.list(projectId, auth.organizationId()));
    }

    @Operation(summary = "Update rule", description = "Updates rule conditions, actions, and settings")
    @RequireScope(ApiKeyScope.READ_WRITE)
    @RequireFeature("rules")
    @PutMapping("/{id}")
    public ResponseEntity<RuleResponse> update(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            @Valid @RequestBody RuleRequest request,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(ruleService.update(id, request, auth.organizationId()));
    }

    @Operation(summary = "Delete rule", description = "Removes a rule and all its actions")
    @ApiResponse(responseCode = "204", description = "Rule deleted")
    @RequireScope(ApiKeyScope.READ_WRITE)
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        ruleService.delete(id, auth.organizationId());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Toggle rule enabled/disabled")
    @RequireScope(ApiKeyScope.READ_WRITE)
    @PatchMapping("/{id}/toggle")
    public ResponseEntity<RuleResponse> toggle(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            @RequestBody Map<String, Boolean> body,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        boolean enabled = body.getOrDefault("enabled", true);
        return ResponseEntity.ok(ruleService.toggleEnabled(id, enabled, auth.organizationId()));
    }
}
