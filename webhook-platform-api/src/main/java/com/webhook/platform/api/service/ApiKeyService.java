package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.ApiKey;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.repository.ApiKeyRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.ApiKeyRequest;
import com.webhook.platform.api.dto.ApiKeyResponse;
import com.webhook.platform.common.util.CryptoUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
public class ApiKeyService {

    private final ApiKeyRepository apiKeyRepository;
    private final ProjectRepository projectRepository;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int API_KEY_LENGTH = 32;

    public ApiKeyService(ApiKeyRepository apiKeyRepository, ProjectRepository projectRepository) {
        this.apiKeyRepository = apiKeyRepository;
        this.projectRepository = projectRepository;
    }

    @Transactional
    public ApiKeyResponse createApiKey(UUID projectId, ApiKeyRequest request, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));

        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Project does not belong to your organization");
        }

        String plainKey = generateApiKey();
        String keyHash = CryptoUtils.hashApiKey(plainKey);
        String keyPrefix = plainKey.substring(0, Math.min(8, plainKey.length()));

        ApiKey apiKey = ApiKey.builder()
                .projectId(projectId)
                .name(request.getName())
                .keyHash(keyHash)
                .keyPrefix(keyPrefix)
                .build();

        apiKey = apiKeyRepository.save(apiKey);
        log.info("Created API key {} for project {}", apiKey.getId(), projectId);

        return mapToResponse(apiKey, plainKey);
    }

    @Transactional(readOnly = true)
    public List<ApiKeyResponse> listApiKeys(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));

        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Project does not belong to your organization");
        }

        List<ApiKey> apiKeys = apiKeyRepository.findByProjectIdAndRevokedAtIsNull(projectId);
        return apiKeys.stream()
                .map(key -> mapToResponse(key, null))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Page<ApiKeyResponse> listApiKeys(UUID projectId, UUID organizationId, Pageable pageable) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));

        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Project does not belong to your organization");
        }

        return apiKeyRepository.findByProjectIdAndRevokedAtIsNull(projectId, pageable)
                .map(key -> mapToResponse(key, null));
    }

    @Transactional
    public void revokeApiKey(UUID projectId, UUID apiKeyId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));

        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Project does not belong to your organization");
        }

        ApiKey apiKey = apiKeyRepository.findByIdAndProjectId(apiKeyId, projectId)
                .orElseThrow(() -> new NotFoundException("API key not found"));

        if (apiKey.getRevokedAt() != null) {
            throw new IllegalArgumentException("API key is already revoked");
        }

        apiKey.setRevokedAt(Instant.now());
        apiKeyRepository.save(apiKey);
        log.info("Revoked API key {} for project {}", apiKeyId, projectId);
    }

    private String generateApiKey() {
        byte[] randomBytes = new byte[API_KEY_LENGTH];
        SECURE_RANDOM.nextBytes(randomBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
    }

    private ApiKeyResponse mapToResponse(ApiKey apiKey, String plainKey) {
        return ApiKeyResponse.builder()
                .id(apiKey.getId())
                .projectId(apiKey.getProjectId())
                .name(apiKey.getName())
                .keyPrefix(apiKey.getKeyPrefix())
                .lastUsedAt(apiKey.getLastUsedAt())
                .createdAt(apiKey.getCreatedAt())
                .revokedAt(apiKey.getRevokedAt())
                .expiresAt(apiKey.getExpiresAt())
                .key(plainKey)
                .build();
    }
}
