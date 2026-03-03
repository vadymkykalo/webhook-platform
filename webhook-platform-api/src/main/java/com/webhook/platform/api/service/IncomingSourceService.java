package com.webhook.platform.api.service;

import com.webhook.platform.api.audit.AuditAction;
import com.webhook.platform.api.audit.Auditable;
import com.webhook.platform.api.domain.entity.IncomingSource;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.common.enums.IncomingSourceStatus;
import com.webhook.platform.common.enums.ProviderType;
import com.webhook.platform.common.enums.VerificationMode;
import com.webhook.platform.api.domain.repository.IncomingSourceRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.IncomingSourceRequest;
import com.webhook.platform.api.dto.IncomingSourceResponse;
import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;
import com.webhook.platform.common.util.CryptoUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@Slf4j
public class IncomingSourceService {

    private final IncomingSourceRepository sourceRepository;
    private final ProjectRepository projectRepository;
    private final String encryptionKey;
    private final String encryptionSalt;
    private final String ingressBaseUrl;

    public IncomingSourceService(
            IncomingSourceRepository sourceRepository,
            ProjectRepository projectRepository,
            @Value("${webhook.encryption-key}") String encryptionKey,
            @Value("${webhook.encryption-salt}") String encryptionSalt,
            @Value("${webhook.ingress-base-url:}") String ingressBaseUrl) {
        this.sourceRepository = sourceRepository;
        this.projectRepository = projectRepository;
        this.encryptionKey = encryptionKey;
        this.encryptionSalt = encryptionSalt;
        this.ingressBaseUrl = ingressBaseUrl;
    }

    private void validateProjectOwnership(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NotFoundException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
    }

    @Auditable(action = AuditAction.CREATE, resourceType = "IncomingSource")
    @Transactional
    public IncomingSourceResponse createSource(UUID projectId, IncomingSourceRequest request, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);

        // Generate slug if not provided
        String slug = request.getSlug();
        if (slug == null || slug.isBlank()) {
            slug = generateSlug(request.getName());
        }
        if (sourceRepository.existsByProjectIdAndSlug(projectId, slug)) {
            throw new IllegalArgumentException("Source with slug '" + slug + "' already exists in this project");
        }

        // Generate unique ingress path token
        String ingressPathToken = CryptoUtils.generateSecureToken(32);
        while (sourceRepository.existsByIngressPathToken(ingressPathToken)) {
            ingressPathToken = CryptoUtils.generateSecureToken(32);
        }

        IncomingSource source = IncomingSource.builder()
                .projectId(projectId)
                .name(request.getName())
                .slug(slug)
                .providerType(request.getProviderType() != null ? request.getProviderType() : ProviderType.GENERIC)
                .status(IncomingSourceStatus.ACTIVE)
                .ingressPathToken(ingressPathToken)
                .verificationMode(request.getVerificationMode() != null ? request.getVerificationMode() : VerificationMode.NONE)
                .build();

        // Encrypt HMAC secret if provided
        if (request.getHmacSecret() != null && !request.getHmacSecret().isBlank()) {
            CryptoUtils.EncryptedData encrypted = CryptoUtils.encryptSecret(
                    request.getHmacSecret(), encryptionKey, encryptionSalt);
            source.setHmacSecretEncrypted(encrypted.getCiphertext());
            source.setHmacSecretIv(encrypted.getIv());
        }

        if (request.getHmacHeaderName() != null) {
            source.setHmacHeaderName(request.getHmacHeaderName());
        }
        if (request.getHmacSignaturePrefix() != null) {
            source.setHmacSignaturePrefix(request.getHmacSignaturePrefix());
        }
        source.setRateLimitPerSecond(request.getRateLimitPerSecond());

        source = sourceRepository.saveAndFlush(source);
        log.info("Created incoming source: id={}, projectId={}, slug={}", source.getId(), projectId, slug);
        return mapToResponse(source);
    }

    public IncomingSourceResponse getSource(UUID id, UUID organizationId) {
        IncomingSource source = sourceRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Incoming source not found"));
        validateProjectOwnership(source.getProjectId(), organizationId);
        return mapToResponse(source);
    }

    public Page<IncomingSourceResponse> listSources(UUID projectId, UUID organizationId, Pageable pageable) {
        validateProjectOwnership(projectId, organizationId);
        return sourceRepository.findByProjectId(projectId, pageable)
                .map(this::mapToResponse);
    }

    @Auditable(action = AuditAction.UPDATE, resourceType = "IncomingSource")
    @Transactional
    public IncomingSourceResponse updateSource(UUID id, IncomingSourceRequest request, UUID organizationId) {
        IncomingSource source = sourceRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Incoming source not found"));
        validateProjectOwnership(source.getProjectId(), organizationId);

        source.setName(request.getName());

        if (request.getSlug() != null && !request.getSlug().isBlank() && !request.getSlug().equals(source.getSlug())) {
            if (sourceRepository.existsByProjectIdAndSlug(source.getProjectId(), request.getSlug())) {
                throw new IllegalArgumentException("Source with slug '" + request.getSlug() + "' already exists");
            }
            source.setSlug(request.getSlug());
        }

        if (request.getProviderType() != null) {
            source.setProviderType(request.getProviderType());
        }
        if (request.getStatus() != null) {
            source.setStatus(request.getStatus());
        }
        if (request.getVerificationMode() != null) {
            source.setVerificationMode(request.getVerificationMode());
        }

        if (request.getHmacSecret() != null && !request.getHmacSecret().isBlank()) {
            CryptoUtils.EncryptedData encrypted = CryptoUtils.encryptSecret(
                    request.getHmacSecret(), encryptionKey, encryptionSalt);
            source.setHmacSecretEncrypted(encrypted.getCiphertext());
            source.setHmacSecretIv(encrypted.getIv());
        }

        if (request.getHmacHeaderName() != null) {
            source.setHmacHeaderName(request.getHmacHeaderName());
        }
        if (request.getHmacSignaturePrefix() != null) {
            source.setHmacSignaturePrefix(request.getHmacSignaturePrefix());
        }
        if (request.getRateLimitPerSecond() != null) {
            source.setRateLimitPerSecond(request.getRateLimitPerSecond());
        }

        source = sourceRepository.saveAndFlush(source);
        log.info("Updated incoming source: id={}", id);
        return mapToResponse(source);
    }

    @Auditable(action = AuditAction.DELETE, resourceType = "IncomingSource")
    @Transactional
    public void deleteSource(UUID id, UUID organizationId) {
        IncomingSource source = sourceRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Incoming source not found"));
        validateProjectOwnership(source.getProjectId(), organizationId);
        source.setStatus(IncomingSourceStatus.DISABLED);
        sourceRepository.save(source);
        log.info("Disabled incoming source: id={}", id);
    }

    private IncomingSourceResponse mapToResponse(IncomingSource source) {
        String ingressUrl = buildIngressUrl(source.getIngressPathToken());
        return IncomingSourceResponse.builder()
                .id(source.getId())
                .projectId(source.getProjectId())
                .name(source.getName())
                .slug(source.getSlug())
                .providerType(source.getProviderType())
                .status(source.getStatus())
                .ingressPathToken(source.getIngressPathToken())
                .ingressUrl(ingressUrl)
                .verificationMode(source.getVerificationMode())
                .hmacHeaderName(source.getHmacHeaderName())
                .hmacSignaturePrefix(source.getHmacSignaturePrefix())
                .hmacSecretConfigured(source.getHmacSecretEncrypted() != null)
                .rateLimitPerSecond(source.getRateLimitPerSecond())
                .createdAt(source.getCreatedAt())
                .updatedAt(source.getUpdatedAt())
                .build();
    }

    private String buildIngressUrl(String token) {
        if (ingressBaseUrl != null && !ingressBaseUrl.isBlank()) {
            return ingressBaseUrl + "/ingress/" + token;
        }
        return "/ingress/" + token;
    }

    private String generateSlug(String name) {
        String normalized = name.toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-|-$", "");
        return normalized.substring(0, Math.min(normalized.length(), 50));
    }

}
