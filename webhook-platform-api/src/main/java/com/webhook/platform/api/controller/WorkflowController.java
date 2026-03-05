package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.WorkflowExecutionResponse;
import com.webhook.platform.api.dto.WorkflowRequest;
import com.webhook.platform.api.dto.WorkflowResponse;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.service.WorkflowService;
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
@RequestMapping("/api/v1/projects/{projectId}/workflows")
@Tag(name = "Workflows", description = "Visual workflow automation")
@SecurityRequirement(name = "bearerAuth")
@SecurityRequirement(name = "apiKey")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowService workflowService;

    @Operation(summary = "Create workflow")
    @ApiResponse(responseCode = "201", description = "Workflow created")
    @PostMapping
    public ResponseEntity<WorkflowResponse> create(
            @PathVariable("projectId") UUID projectId,
            @Valid @RequestBody WorkflowRequest request,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(workflowService.create(projectId, request, auth.organizationId()));
    }

    @Operation(summary = "Get workflow")
    @GetMapping("/{id}")
    public ResponseEntity<WorkflowResponse> get(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(workflowService.get(id, auth.organizationId()));
    }

    @Operation(summary = "List workflows")
    @GetMapping
    public ResponseEntity<List<WorkflowResponse>> list(
            @PathVariable("projectId") UUID projectId,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(workflowService.list(projectId, auth.organizationId()));
    }

    @Operation(summary = "Update workflow")
    @PutMapping("/{id}")
    public ResponseEntity<WorkflowResponse> update(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            @Valid @RequestBody WorkflowRequest request,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(workflowService.update(id, request, auth.organizationId()));
    }

    @Operation(summary = "Delete workflow")
    @ApiResponse(responseCode = "204", description = "Workflow deleted")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        workflowService.delete(id, auth.organizationId());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Toggle workflow enabled/disabled")
    @PatchMapping("/{id}/toggle")
    public ResponseEntity<WorkflowResponse> toggle(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            @RequestBody Map<String, Boolean> body,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        boolean enabled = body.getOrDefault("enabled", true);
        return ResponseEntity.ok(workflowService.toggleEnabled(id, enabled, auth.organizationId()));
    }

    @Operation(summary = "Manually trigger workflow with test payload")
    @ApiResponse(responseCode = "200", description = "Workflow executed")
    @PostMapping("/{id}/trigger")
    public ResponseEntity<WorkflowExecutionResponse> trigger(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            @RequestBody(required = false) Map<String, Object> testPayload,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(workflowService.manualTrigger(id, auth.organizationId(), testPayload));
    }

    // ── Executions ──────────────────────────────────────────────────────

    @Operation(summary = "List workflow executions")
    @GetMapping("/{id}/executions")
    public ResponseEntity<Page<WorkflowExecutionResponse>> listExecutions(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(workflowService.listExecutions(id, auth.organizationId(), page, size));
    }

    @Operation(summary = "Get execution details with step results")
    @GetMapping("/{id}/executions/{executionId}")
    public ResponseEntity<WorkflowExecutionResponse> getExecution(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            @PathVariable("executionId") UUID executionId,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(workflowService.getExecution(executionId, auth.organizationId()));
    }
}
