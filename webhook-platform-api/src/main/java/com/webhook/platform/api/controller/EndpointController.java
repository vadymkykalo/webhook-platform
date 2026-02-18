package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.EndpointRequest;
import com.webhook.platform.api.dto.EndpointResponse;
import com.webhook.platform.api.dto.EndpointTestResponse;
import com.webhook.platform.api.exception.UnauthorizedException;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.security.RbacUtil;
import com.webhook.platform.api.service.EndpointService;
import com.webhook.platform.api.service.EndpointVerificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v1/projects/{projectId}/endpoints")
@Tag(name = "Endpoints", description = "Webhook endpoint configuration")
@SecurityRequirement(name = "bearerAuth")
public class EndpointController {

    private final EndpointService endpointService;
    private final EndpointVerificationService verificationService;

    public EndpointController(EndpointService endpointService, EndpointVerificationService verificationService) {
        this.endpointService = endpointService;
        this.verificationService = verificationService;
    }

    @Operation(summary = "Create endpoint", description = "Creates a new webhook endpoint for the project")
    @ApiResponse(responseCode = "201", description = "Endpoint created")
    @PostMapping
    public ResponseEntity<EndpointResponse> createEndpoint(
            @PathVariable("projectId") UUID projectId,
            @Valid @RequestBody EndpointRequest request,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        try {
            JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
            RbacUtil.requireWriteAccess(jwtAuth.getRole());
            EndpointResponse response = endpointService.createEndpoint(projectId, request, jwtAuth.getOrganizationId());
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            log.error("Failed to create endpoint for project {}: {}", projectId, e.getMessage(), e);
            throw e;
        }
    }

    @Operation(summary = "Get endpoint", description = "Returns endpoint details by ID")
    @GetMapping("/{id}")
    public ResponseEntity<EndpointResponse> getEndpoint(
            @PathVariable("id") UUID id,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        EndpointResponse response = endpointService.getEndpoint(id, jwtAuth.getOrganizationId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "List endpoints", description = "Returns all endpoints for the project")
    @GetMapping
    public ResponseEntity<List<EndpointResponse>> listEndpoints(
            @PathVariable("projectId") UUID projectId,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        List<EndpointResponse> response = endpointService.listEndpoints(projectId, jwtAuth.getOrganizationId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Update endpoint", description = "Updates endpoint configuration")
    @PutMapping("/{id}")
    public ResponseEntity<EndpointResponse> updateEndpoint(
            @PathVariable("id") UUID id,
            @Valid @RequestBody EndpointRequest request,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());
        EndpointResponse response = endpointService.updateEndpoint(id, request, jwtAuth.getOrganizationId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Delete endpoint", description = "Deletes an endpoint")
    @ApiResponse(responseCode = "204", description = "Endpoint deleted")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEndpoint(
            @PathVariable("id") UUID id,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());
        endpointService.deleteEndpoint(id, jwtAuth.getOrganizationId());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Rotate secret", description = "Generates a new webhook signing secret")
    @PostMapping("/{id}/rotate-secret")
    public ResponseEntity<EndpointResponse> rotateSecret(
            @PathVariable("id") UUID id,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());
        EndpointResponse response = endpointService.rotateSecret(id, jwtAuth.getOrganizationId());
        log.info("Rotated secret for endpoint {}", id);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Test endpoint", description = "Sends a test webhook to verify endpoint connectivity")
    @PostMapping("/{id}/test")
    public ResponseEntity<EndpointTestResponse> testEndpoint(
            @PathVariable("id") UUID id,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        EndpointTestResponse response = endpointService.testEndpoint(id, jwtAuth.getOrganizationId());
        log.info("Tested endpoint {}: success={}, latency={}ms", id, response.isSuccess(), response.getLatencyMs());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Configure mTLS", description = "Configures mutual TLS for the endpoint")
    @PostMapping("/{id}/mtls")
    public ResponseEntity<EndpointResponse> configureMtls(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            @Valid @RequestBody com.webhook.platform.api.dto.MtlsConfigRequest request,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());
        EndpointResponse response = endpointService.configureMtls(projectId, id, request, jwtAuth.getOrganizationId());
        log.info("Configured mTLS for endpoint {}", id);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Disable mTLS", description = "Disables mutual TLS for the endpoint")
    @DeleteMapping("/{id}/mtls")
    public ResponseEntity<EndpointResponse> disableMtls(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());
        EndpointResponse response = endpointService.disableMtls(projectId, id, jwtAuth.getOrganizationId());
        log.info("Disabled mTLS for endpoint {}", id);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Verify endpoint", description = "Sends a verification challenge to the endpoint")
    @PostMapping("/{id}/verify")
    public ResponseEntity<VerificationResponse> verifyEndpoint(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        
        var result = verificationService.verify(id);
        log.info("Verification attempt for endpoint {}: success={}", id, result.success());
        
        return ResponseEntity.ok(new VerificationResponse(
                result.success(),
                result.message(),
                result.endpoint().getVerificationStatus().name()
        ));
    }

    @Operation(summary = "Skip verification", description = "Skips verification for trusted endpoints (admin only)")
    @PostMapping("/{id}/skip-verification")
    public ResponseEntity<EndpointResponse> skipVerification(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("id") UUID id,
            @RequestBody(required = false) SkipVerificationRequest request,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());
        
        String reason = request != null ? request.reason() : "Skipped by administrator";
        var endpoint = verificationService.skipVerification(id, reason);
        log.info("Skipped verification for endpoint {}: {}", id, reason);
        
        return ResponseEntity.ok(endpointService.getEndpoint(id, jwtAuth.getOrganizationId()));
    }

    public record VerificationResponse(boolean success, String message, String status) {}
    public record SkipVerificationRequest(String reason) {}
}
