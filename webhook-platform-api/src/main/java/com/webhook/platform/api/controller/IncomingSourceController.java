package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.IncomingSourceRequest;
import com.webhook.platform.api.dto.IncomingSourceResponse;
import com.webhook.platform.api.exception.UnauthorizedException;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.security.RbacUtil;
import com.webhook.platform.api.service.IncomingSourceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v1/projects/{projectId}/incoming-sources")
@Tag(name = "Incoming Sources", description = "Incoming webhook source configuration")
@SecurityRequirement(name = "bearerAuth")
public class IncomingSourceController {

    private final IncomingSourceService sourceService;

    public IncomingSourceController(IncomingSourceService sourceService) {
        this.sourceService = sourceService;
    }

    @Operation(summary = "Create incoming source", description = "Creates a new incoming webhook source for the project")
    @ApiResponse(responseCode = "201", description = "Source created")
    @PostMapping
    public ResponseEntity<IncomingSourceResponse> createSource(
            @PathVariable("projectId") UUID projectId,
            @Valid @RequestBody IncomingSourceRequest request,
            Authentication authentication) {
        JwtAuthenticationToken jwtAuth = requireJwt(authentication);
        RbacUtil.requireWriteAccess(jwtAuth.getRole());
        IncomingSourceResponse response = sourceService.createSource(projectId, request, jwtAuth.getOrganizationId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "Get incoming source", description = "Returns incoming source details by ID")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Source retrieved"),
            @ApiResponse(responseCode = "404", description = "Source not found")
    })
    @GetMapping("/{id}")
    public ResponseEntity<IncomingSourceResponse> getSource(
            @PathVariable("id") UUID id,
            Authentication authentication) {
        JwtAuthenticationToken jwtAuth = requireJwt(authentication);
        IncomingSourceResponse response = sourceService.getSource(id, jwtAuth.getOrganizationId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "List incoming sources", description = "Returns paginated incoming sources for the project")
    @GetMapping
    public ResponseEntity<Page<IncomingSourceResponse>> listSources(
            @PathVariable("projectId") UUID projectId,
            @PageableDefault(size = 20) Pageable pageable,
            Authentication authentication) {
        JwtAuthenticationToken jwtAuth = requireJwt(authentication);
        Page<IncomingSourceResponse> response = sourceService.listSources(projectId, jwtAuth.getOrganizationId(), pageable);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Update incoming source", description = "Updates incoming source configuration")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Source updated"),
            @ApiResponse(responseCode = "404", description = "Source not found")
    })
    @PutMapping("/{id}")
    public ResponseEntity<IncomingSourceResponse> updateSource(
            @PathVariable("id") UUID id,
            @Valid @RequestBody IncomingSourceRequest request,
            Authentication authentication) {
        JwtAuthenticationToken jwtAuth = requireJwt(authentication);
        RbacUtil.requireWriteAccess(jwtAuth.getRole());
        IncomingSourceResponse response = sourceService.updateSource(id, request, jwtAuth.getOrganizationId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Delete incoming source", description = "Disables the incoming source (soft delete)")
    @ApiResponse(responseCode = "204", description = "Source disabled")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSource(
            @PathVariable("id") UUID id,
            Authentication authentication) {
        JwtAuthenticationToken jwtAuth = requireJwt(authentication);
        RbacUtil.requireWriteAccess(jwtAuth.getRole());
        sourceService.deleteSource(id, jwtAuth.getOrganizationId());
        return ResponseEntity.noContent().build();
    }

    private JwtAuthenticationToken requireJwt(Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        return (JwtAuthenticationToken) authentication;
    }
}
