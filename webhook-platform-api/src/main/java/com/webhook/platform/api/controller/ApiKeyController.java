package com.webhook.platform.api.controller;

import com.webhook.platform.api.dto.ApiKeyRequest;
import com.webhook.platform.api.dto.ApiKeyResponse;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.security.RbacUtil;
import com.webhook.platform.api.service.ApiKeyService;
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
public class ApiKeyController {

    private final ApiKeyService apiKeyService;

    public ApiKeyController(ApiKeyService apiKeyService) {
        this.apiKeyService = apiKeyService;
    }

    @PostMapping
    public ResponseEntity<ApiKeyResponse> createApiKey(
            @PathVariable("projectId") UUID projectId,
            @RequestBody ApiKeyRequest request,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());

        ApiKeyResponse response = apiKeyService.createApiKey(projectId, request, jwtAuth.getOrganizationId());
        log.info("Created API key {} for project {}", response.getId(), projectId);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<List<ApiKeyResponse>> listApiKeys(
            @PathVariable("projectId") UUID projectId,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        List<ApiKeyResponse> response = apiKeyService.listApiKeys(projectId, jwtAuth.getOrganizationId());
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{apiKeyId}")
    public ResponseEntity<Void> revokeApiKey(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("apiKeyId") UUID apiKeyId,
            Authentication authentication) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new RuntimeException("Authentication required");
        }

        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        RbacUtil.requireWriteAccess(jwtAuth.getRole());

        apiKeyService.revokeApiKey(projectId, apiKeyId, jwtAuth.getOrganizationId());
        log.info("Revoked API key {} for project {}", apiKeyId, projectId);
        return ResponseEntity.noContent().build();
    }
}
