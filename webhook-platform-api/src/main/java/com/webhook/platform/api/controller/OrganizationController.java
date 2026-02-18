package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.OrganizationResponse;
import com.webhook.platform.api.exception.UnauthorizedException;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.service.OrganizationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
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
    public ResponseEntity<List<OrganizationResponse>> getUserOrganizations(Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        List<OrganizationResponse> response = organizationService.getUserOrganizations(jwtAuth.getUserId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Get organization", description = "Returns organization details")
    @GetMapping("/{orgId}")
    public ResponseEntity<OrganizationResponse> getOrganization(
            @PathVariable("orgId") UUID orgId,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        OrganizationResponse response = organizationService.getOrganization(orgId, jwtAuth.getUserId());
        return ResponseEntity.ok(response);
    }
}
