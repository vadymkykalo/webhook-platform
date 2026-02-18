package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.ApiKeyRequest;
import com.webhook.platform.api.dto.ApiKeyResponse;
import com.webhook.platform.api.exception.UnauthorizedException;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.security.RbacUtil;
import com.webhook.platform.api.service.ApiKeyService;
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
@RequestMapping("/api/v1/projects/{projectId}/api-keys")
@Tag(name = "API Keys", description = "API key management for event ingestion")
@SecurityRequirement(name = "bearerAuth")
public class ApiKeyController {

    private final ApiKeyService apiKeyService;

    public ApiKeyController(ApiKeyService apiKeyService) {
        this.apiKeyService = apiKeyService;
    }

    @Operation(summary = "Create API key", description = "Generates a new API key for event ingestion. The key is shown only once.")
    @ApiResponse(responseCode = "201", description = "API key created")
    @PostMapping
    public ResponseEntity<ApiKeyResponse> createApiKey(
            @PathVariable("projectId") UUID projectId,
            @Valid @RequestBody ApiKeyRequest request,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());

        ApiKeyResponse response = apiKeyService.createApiKey(projectId, request, jwtAuth.getOrganizationId());
        log.info("Created API key {} for project {}", response.getId(), projectId);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "List API keys", description = "Returns all API keys for the project (keys are masked)")
    @GetMapping
    public ResponseEntity<List<ApiKeyResponse>> listApiKeys(
            @PathVariable("projectId") UUID projectId,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        List<ApiKeyResponse> response = apiKeyService.listApiKeys(projectId, jwtAuth.getOrganizationId());
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Revoke API key", description = "Permanently revokes an API key")
    @ApiResponse(responseCode = "204", description = "API key revoked")
    @DeleteMapping("/{apiKeyId}")
    public ResponseEntity<Void> revokeApiKey(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("apiKeyId") UUID apiKeyId,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());

        apiKeyService.revokeApiKey(projectId, apiKeyId, jwtAuth.getOrganizationId());
        log.info("Revoked API key {} for project {}", apiKeyId, projectId);
        return ResponseEntity.noContent().build();
    }
}
