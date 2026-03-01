package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.OrganizationResponse;
import com.webhook.platform.api.security.AuthContext;
import com.webhook.platform.api.service.OrganizationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
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
public class OrganizationController {

    private final OrganizationService organizationService;

    public OrganizationController(OrganizationService organizationService) {
        this.organizationService = organizationService;
    }

    @Operation(summary = "List user organizations", description = "Returns all organizations the user belongs to")
    @GetMapping
    public ResponseEntity<List<OrganizationResponse>> getUserOrganizations(AuthContext auth) {
        List<OrganizationResponse> response = organizationService.getUserOrganizations(auth.userId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Get organization", description = "Returns organization details")
    @GetMapping("/{orgId}")
    public ResponseEntity<OrganizationResponse> getOrganization(
            @PathVariable("orgId") UUID orgId,
            AuthContext auth) {
        OrganizationResponse response = organizationService.getOrganization(orgId, auth.userId());
        return ResponseEntity.ok(response);
    }
}
