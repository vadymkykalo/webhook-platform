package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.EventIngestRequest;
import com.webhook.platform.api.dto.EventResponse;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.security.RbacUtil;
import com.webhook.platform.api.service.EventService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v1/projects/{projectId}/events")
@Tag(name = "Events", description = "Event history and test events")
@SecurityRequirement(name = "bearerAuth")
public class ProjectEventsController {

    private final EventService eventService;

    public ProjectEventsController(EventService eventService) {
        this.eventService = eventService;
    }

    @Operation(summary = "List events", description = "Returns paginated event history for the project")
    @GetMapping
    public ResponseEntity<Page<EventResponse>> listEvents(
            @PathVariable("projectId") UUID projectId,
            Pageable pageable,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        Page<EventResponse> response = eventService.listEvents(projectId, jwtAuth.getOrganizationId(), pageable);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Get event", description = "Returns event details by ID")
    @GetMapping("/{id}")
    public ResponseEntity<EventResponse> getEvent(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        EventResponse response = eventService.getEvent(projectId, id, jwtAuth.getOrganizationId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Send test event", description = "Sends a test event through the webhook pipeline")
    @ApiResponse(responseCode = "201", description = "Test event created")
    @PostMapping("/test")
    public ResponseEntity<EventResponse> sendTestEvent(
            @PathVariable("projectId") UUID projectId,
            @Valid @RequestBody EventIngestRequest request,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());
        
        log.info("Sending test event type: {} for project: {}", request.getType(), projectId);
        EventResponse response = eventService.sendTestEvent(projectId, request, jwtAuth.getOrganizationId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
