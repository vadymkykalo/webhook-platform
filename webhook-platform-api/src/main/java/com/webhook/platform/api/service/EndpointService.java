package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Endpoint;
import com.webhook.platform.api.domain.repository.EndpointRepository;
import com.webhook.platform.api.dto.EndpointRequest;
import com.webhook.platform.api.dto.EndpointResponse;
import com.webhook.platform.common.util.CryptoUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class EndpointService {

    private final EndpointRepository endpointRepository;
    private final String encryptionKey;

    public EndpointService(
            EndpointRepository endpointRepository,
            @Value("${webhook.encryption-key:development_master_key_32_chars}") String encryptionKey) {
        this.endpointRepository = endpointRepository;
        this.encryptionKey = encryptionKey;
    }

    @Transactional
    public EndpointResponse createEndpoint(UUID projectId, EndpointRequest request) {
        CryptoUtils.EncryptedData encrypted = CryptoUtils.encryptSecret(request.getSecret(), encryptionKey);
        
        Endpoint endpoint = Endpoint.builder()
                .projectId(projectId)
                .url(request.getUrl())
                .description(request.getDescription())
                .secretEncrypted(encrypted.getCiphertext())
                .secretIv(encrypted.getIv())
                .enabled(request.getEnabled() != null ? request.getEnabled() : true)
                .rateLimitPerSecond(request.getRateLimitPerSecond())
                .build();
        
        endpoint = endpointRepository.save(endpoint);
        return mapToResponse(endpoint);
    }

    public EndpointResponse getEndpoint(UUID id) {
        Endpoint endpoint = endpointRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Endpoint not found"));
        return mapToResponse(endpoint);
    }

    public List<EndpointResponse> listEndpoints(UUID projectId) {
        return endpointRepository.findAll().stream()
                .filter(e -> e.getProjectId().equals(projectId))
                .filter(e -> e.getDeletedAt() == null)
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public EndpointResponse updateEndpoint(UUID id, EndpointRequest request) {
        Endpoint endpoint = endpointRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Endpoint not found"));
        
        endpoint.setUrl(request.getUrl());
        endpoint.setDescription(request.getDescription());
        
        if (request.getSecret() != null && !request.getSecret().isEmpty()) {
            CryptoUtils.EncryptedData encrypted = CryptoUtils.encryptSecret(request.getSecret(), encryptionKey);
            endpoint.setSecretEncrypted(encrypted.getCiphertext());
            endpoint.setSecretIv(encrypted.getIv());
        }
        
        if (request.getEnabled() != null) {
            endpoint.setEnabled(request.getEnabled());
        }
        
        endpoint.setRateLimitPerSecond(request.getRateLimitPerSecond());
        endpoint = endpointRepository.save(endpoint);
        
        return mapToResponse(endpoint);
    }

    @Transactional
    public void deleteEndpoint(UUID id) {
        Endpoint endpoint = endpointRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Endpoint not found"));
        
        endpoint.setDeletedAt(Instant.now());
        endpointRepository.save(endpoint);
    }

    private EndpointResponse mapToResponse(Endpoint endpoint) {
        return EndpointResponse.builder()
                .id(endpoint.getId())
                .projectId(endpoint.getProjectId())
                .url(endpoint.getUrl())
                .description(endpoint.getDescription())
                .enabled(endpoint.getEnabled())
                .rateLimitPerSecond(endpoint.getRateLimitPerSecond())
                .createdAt(endpoint.getCreatedAt())
                .updatedAt(endpoint.getUpdatedAt())
                .build();
    }
}
