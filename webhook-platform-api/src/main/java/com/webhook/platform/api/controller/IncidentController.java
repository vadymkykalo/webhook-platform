package com.webhook.platform.api.controller;

import com.webhook.platform.api.domain.enums.ApiKeyScope;
import com.webhook.platform.api.dto.IncidentRequest;
import com.webhook.platform.api.dto.IncidentResponse;
import com.webhook.platform.api.dto.TimelineEntryRequest;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.security.RequireScope;
import com.webhook.platform.api.service.IncidentService;
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

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/incidents")
@Tag(name = "Incidents", description = "Incident management with timeline and RCA")
@SecurityRequirement(name = "bearerAuth")
@SecurityRequirement(name = "apiKey")
@RequiredArgsConstructor
public class IncidentController {

    private final IncidentService incidentService;

    @Operation(summary = "List incidents")
    @GetMapping
    public ResponseEntity<Page<IncidentResponse>> list(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(defaultValue = "false") boolean openOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(incidentService.listIncidents(projectId, auth.organizationId(), openOnly, page, size));
    }

    @Operation(summary = "Get incident with timeline")
    @GetMapping("/{incidentId}")
    public ResponseEntity<IncidentResponse> get(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("incidentId") UUID incidentId,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(incidentService.getIncident(projectId, incidentId, auth.organizationId()));
    }

    @Operation(summary = "Create incident")
    @ApiResponse(responseCode = "201", description = "Incident created")
    @RequireScope(ApiKeyScope.READ_WRITE)
    @PostMapping
    public ResponseEntity<IncidentResponse> create(
            @PathVariable("projectId") UUID projectId,
            @Valid @RequestBody IncidentRequest request,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(incidentService.createIncident(projectId, request, auth.organizationId()));
    }

    @Operation(summary = "Update incident (status, RCA notes, severity)")
    @RequireScope(ApiKeyScope.READ_WRITE)
    @PutMapping("/{incidentId}")
    public ResponseEntity<IncidentResponse> update(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("incidentId") UUID incidentId,
            @Valid @RequestBody IncidentRequest request,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(incidentService.updateIncident(projectId, incidentId, request, auth.organizationId()));
    }

    @Operation(summary = "Add timeline entry to incident")
    @RequireScope(ApiKeyScope.READ_WRITE)
    @PostMapping("/{incidentId}/timeline")
    public ResponseEntity<IncidentResponse> addTimeline(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("incidentId") UUID incidentId,
            @Valid @RequestBody TimelineEntryRequest request,
            AuthContext auth) {
        auth.requireWriteAccess();
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(incidentService.addTimelineEntry(projectId, incidentId, request, auth.organizationId()));
    }

    @Operation(summary = "Count open incidents")
    @GetMapping("/open-count")
    public ResponseEntity<Map<String, Long>> countOpen(
            @PathVariable("projectId") UUID projectId,
            AuthContext auth) {
        auth.validateProjectAccess(projectId);
        return ResponseEntity.ok(Map.of("count", incidentService.countOpen(projectId, auth.organizationId())));
    }
}
