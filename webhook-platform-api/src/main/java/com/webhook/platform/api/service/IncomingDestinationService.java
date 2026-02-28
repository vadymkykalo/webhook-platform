package com.webhook.platform.api.service;

import com.webhook.platform.api.audit.AuditAction;
import com.webhook.platform.api.audit.Auditable;
import com.webhook.platform.api.domain.entity.IncomingDestination;
import com.webhook.platform.api.domain.entity.IncomingSource;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.common.enums.IncomingAuthType;
import com.webhook.platform.api.domain.repository.IncomingDestinationRepository;
import com.webhook.platform.api.domain.repository.IncomingSourceRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.IncomingDestinationRequest;
import com.webhook.platform.api.dto.IncomingDestinationResponse;
import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;
import com.webhook.platform.common.security.UrlValidator;
import com.webhook.platform.common.util.CryptoUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class IncomingDestinationService {

    private final IncomingDestinationRepository destinationRepository;
    private final IncomingSourceRepository sourceRepository;
    private final ProjectRepository projectRepository;
    private final String encryptionKey;
    private final String encryptionSalt;
    private final boolean allowPrivateIps;
    private final List<String> allowedHosts;

    public IncomingDestinationService(
            IncomingDestinationRepository destinationRepository,
            IncomingSourceRepository sourceRepository,
            ProjectRepository projectRepository,
            @Value("${webhook.encryption-key}") String encryptionKey,
            @Value("${webhook.encryption-salt}") String encryptionSalt,
            @Value("${webhook.url-validation.allow-private-ips:false}") boolean allowPrivateIps,
            @Value("${webhook.url-validation.allowed-hosts:}") List<String> allowedHosts) {
        this.destinationRepository = destinationRepository;
        this.sourceRepository = sourceRepository;
        this.projectRepository = projectRepository;
        this.encryptionKey = encryptionKey;
        this.encryptionSalt = encryptionSalt;
        this.allowPrivateIps = allowPrivateIps;
        this.allowedHosts = allowedHosts;
    }

    private void validateSourceOwnership(UUID sourceId, UUID organizationId) {
        IncomingSource source = sourceRepository.findById(sourceId)
                .orElseThrow(() -> new NotFoundException("Incoming source not found"));
        Project project = projectRepository.findById(source.getProjectId())
                .orElseThrow(() -> new NotFoundException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }
    }

    @Auditable(action = AuditAction.CREATE, resourceType = "IncomingDestination")
    @Transactional
    public IncomingDestinationResponse createDestination(UUID sourceId, IncomingDestinationRequest request, UUID organizationId) {
        validateSourceOwnership(sourceId, organizationId);
        UrlValidator.validateWebhookUrl(request.getUrl(), allowPrivateIps, allowedHosts);

        IncomingDestination destination = IncomingDestination.builder()
                .incomingSourceId(sourceId)
                .url(request.getUrl())
                .authType(request.getAuthType() != null ? request.getAuthType() : IncomingAuthType.NONE)
                .customHeadersJson(request.getCustomHeadersJson())
                .enabled(request.getEnabled() != null ? request.getEnabled() : true)
                .maxAttempts(request.getMaxAttempts() != null ? request.getMaxAttempts() : 5)
                .timeoutSeconds(request.getTimeoutSeconds() != null ? request.getTimeoutSeconds() : 30)
                .retryDelays(request.getRetryDelays() != null ? request.getRetryDelays() : "60,300,900,3600,21600")
                .build();

        // Encrypt auth config if provided
        if (request.getAuthConfig() != null && !request.getAuthConfig().isBlank()) {
            CryptoUtils.EncryptedData encrypted = CryptoUtils.encryptSecret(
                    request.getAuthConfig(), encryptionKey, encryptionSalt);
            destination.setAuthConfigEncrypted(encrypted.getCiphertext());
            destination.setAuthConfigIv(encrypted.getIv());
        }

        destination = destinationRepository.saveAndFlush(destination);
        log.info("Created incoming destination: id={}, sourceId={}, url={}", destination.getId(), sourceId, request.getUrl());
        return mapToResponse(destination);
    }

    public IncomingDestinationResponse getDestination(UUID id, UUID organizationId) {
        IncomingDestination destination = destinationRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Incoming destination not found"));
        validateSourceOwnership(destination.getIncomingSourceId(), organizationId);
        return mapToResponse(destination);
    }

    public Page<IncomingDestinationResponse> listDestinations(UUID sourceId, UUID organizationId, Pageable pageable) {
        validateSourceOwnership(sourceId, organizationId);
        return destinationRepository.findByIncomingSourceId(sourceId, pageable)
                .map(this::mapToResponse);
    }

    @Auditable(action = AuditAction.UPDATE, resourceType = "IncomingDestination")
    @Transactional
    public IncomingDestinationResponse updateDestination(UUID id, IncomingDestinationRequest request, UUID organizationId) {
        IncomingDestination destination = destinationRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Incoming destination not found"));
        validateSourceOwnership(destination.getIncomingSourceId(), organizationId);

        UrlValidator.validateWebhookUrl(request.getUrl(), allowPrivateIps, allowedHosts);

        destination.setUrl(request.getUrl());

        if (request.getAuthType() != null) {
            destination.setAuthType(request.getAuthType());
        }
        if (request.getAuthConfig() != null && !request.getAuthConfig().isBlank()) {
            CryptoUtils.EncryptedData encrypted = CryptoUtils.encryptSecret(
                    request.getAuthConfig(), encryptionKey, encryptionSalt);
            destination.setAuthConfigEncrypted(encrypted.getCiphertext());
            destination.setAuthConfigIv(encrypted.getIv());
        }
        if (request.getCustomHeadersJson() != null) {
            destination.setCustomHeadersJson(request.getCustomHeadersJson());
        }
        if (request.getEnabled() != null) {
            destination.setEnabled(request.getEnabled());
        }
        if (request.getMaxAttempts() != null) {
            destination.setMaxAttempts(request.getMaxAttempts());
        }
        if (request.getTimeoutSeconds() != null) {
            destination.setTimeoutSeconds(request.getTimeoutSeconds());
        }
        if (request.getRetryDelays() != null) {
            destination.setRetryDelays(request.getRetryDelays());
        }

        destination = destinationRepository.saveAndFlush(destination);
        log.info("Updated incoming destination: id={}", id);
        return mapToResponse(destination);
    }

    @Auditable(action = AuditAction.DELETE, resourceType = "IncomingDestination")
    @Transactional
    public void deleteDestination(UUID id, UUID organizationId) {
        IncomingDestination destination = destinationRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Incoming destination not found"));
        validateSourceOwnership(destination.getIncomingSourceId(), organizationId);
        destinationRepository.delete(destination);
        log.info("Deleted incoming destination: id={}", id);
    }

    private IncomingDestinationResponse mapToResponse(IncomingDestination destination) {
        return IncomingDestinationResponse.builder()
                .id(destination.getId())
                .incomingSourceId(destination.getIncomingSourceId())
                .url(destination.getUrl())
                .authType(destination.getAuthType())
                .authConfigured(destination.getAuthConfigEncrypted() != null)
                .customHeadersJson(destination.getCustomHeadersJson())
                .enabled(destination.getEnabled())
                .maxAttempts(destination.getMaxAttempts())
                .timeoutSeconds(destination.getTimeoutSeconds())
                .retryDelays(destination.getRetryDelays())
                .createdAt(destination.getCreatedAt())
                .updatedAt(destination.getUpdatedAt())
                .build();
    }

}
