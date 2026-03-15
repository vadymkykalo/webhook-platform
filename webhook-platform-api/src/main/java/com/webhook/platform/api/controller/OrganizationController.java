package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.OrganizationResponse;
import com.webhook.platform.api.dto.UpdateOrganizationRequest;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.service.OrganizationService;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v1/orgs")
@Tag(name = "Organizations", description = "Organization management")
@SecurityRequirement(name = "bearerAuth")
@SecurityRequirement(name = "apiKey")
public class OrganizationController {

    private final OrganizationService organizationService;

    public OrganizationController(OrganizationService organizationService) {
        this.organizationService = organizationService;
    }

    @Operation(summary = "List user organizations", description = "Returns all organizations the user belongs to")
    @GetMapping
    public ResponseEntity<List<OrganizationResponse>> getUserOrganizations(AuthContext auth) {
        List<OrganizationResponse> response = organizationService.getUserOrganizations(auth.requireUserId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Get organization", description = "Returns organization details")
    @GetMapping("/{orgId}")
    public ResponseEntity<OrganizationResponse> getOrganization(
            @PathVariable("orgId") UUID orgId,
            AuthContext auth) {
        OrganizationResponse response = organizationService.getOrganization(orgId, auth.requireUserId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Update organization", description = "Updates organization details (owner only)")
    @PutMapping("/{orgId}")
    public ResponseEntity<OrganizationResponse> updateOrganization(
            @PathVariable("orgId") UUID orgId,
            @Valid @RequestBody UpdateOrganizationRequest request,
            AuthContext auth) {
        auth.requireOwnerAccess();
        OrganizationResponse response = organizationService.updateOrganization(orgId, auth.organizationId(), request);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Delete organization (GDPR)",
            description = "Permanently deletes the organization and all associated data. " +
                    "This action is irreversible. Owner only.")
    @ApiResponse(responseCode = "204", description = "Organization deleted")
    @DeleteMapping("/{orgId}")
    public ResponseEntity<Void> deleteOrganization(
            @PathVariable("orgId") UUID orgId,
            AuthContext auth) {
        auth.requireOwnerAccess();
        if (!orgId.equals(auth.organizationId())) {
            throw new com.webhook.platform.api.exception.ForbiddenException("Access denied");
        }
        organizationService.deleteOrganization(orgId);
        return ResponseEntity.noContent().build();
    }
}
