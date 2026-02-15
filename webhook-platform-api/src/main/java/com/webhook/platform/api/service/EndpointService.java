package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Endpoint;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.repository.EndpointRepository;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.dto.EndpointRequest;
import com.webhook.platform.api.dto.EndpointResponse;
import com.webhook.platform.api.dto.EndpointTestResponse;
import com.webhook.platform.common.security.UrlValidator;
import com.webhook.platform.common.util.CryptoUtils;
import com.webhook.platform.common.util.WebhookSignatureUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
public class EndpointService {

    private final EndpointRepository endpointRepository;
    private final ProjectRepository projectRepository;
    private final WebClient webClient;
    private final String encryptionKey;
    private final boolean allowPrivateIps;
    private final List<String> allowedHosts;

    public EndpointService(
            EndpointRepository endpointRepository,
            ProjectRepository projectRepository,
            WebClient.Builder webClientBuilder,
            @Value("${webhook.encryption-key:development_master_key_32_chars}") String encryptionKey,
            @Value("${webhook.url-validation.allow-private-ips:false}") boolean allowPrivateIps,
            @Value("${webhook.url-validation.allowed-hosts:}") List<String> allowedHosts) {
        this.endpointRepository = endpointRepository;
        this.projectRepository = projectRepository;
        this.webClient = webClientBuilder
                .defaultHeader("User-Agent", "WebhookPlatform/1.0-Test")
                .build();
        this.encryptionKey = encryptionKey;
        this.allowPrivateIps = allowPrivateIps;
        this.allowedHosts = allowedHosts;
    }

    private void validateProjectOwnership(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new RuntimeException("Access denied");
        }
    }

    @Transactional
    public EndpointResponse createEndpoint(UUID projectId, EndpointRequest request, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        UrlValidator.validateWebhookUrl(request.getUrl(), allowPrivateIps, allowedHosts);
        
        // Auto-generate secret if not provided
        String secret = request.getSecret();
        if (secret == null || secret.isBlank()) {
            secret = CryptoUtils.generateSecureToken(32);
        }
        CryptoUtils.EncryptedData encrypted = CryptoUtils.encryptSecret(secret, encryptionKey);
        
        Endpoint endpoint = Endpoint.builder()
                .projectId(projectId)
                .url(request.getUrl())
                .description(request.getDescription())
                .secretEncrypted(encrypted.getCiphertext())
                .secretIv(encrypted.getIv())
                .rateLimitPerSecond(request.getRateLimitPerSecond())
                .allowedSourceIps(request.getAllowedSourceIps())
                .build();
        
        if (request.getEnabled() != null) {
            endpoint.setEnabled(request.getEnabled());
        }
        
        endpoint = endpointRepository.saveAndFlush(endpoint);
        return mapToResponseWithSecret(endpoint, secret);
    }

    public EndpointResponse getEndpoint(UUID id, UUID organizationId) {
        Endpoint endpoint = endpointRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Endpoint not found"));
        validateProjectOwnership(endpoint.getProjectId(), organizationId);
        return mapToResponse(endpoint);
    }

    public List<EndpointResponse> listEndpoints(UUID projectId, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        return endpointRepository.findAll().stream()
                .filter(e -> e.getProjectId().equals(projectId))
                .filter(e -> e.getDeletedAt() == null)
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public EndpointResponse updateEndpoint(UUID id, EndpointRequest request, UUID organizationId) {
        Endpoint endpoint = endpointRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Endpoint not found"));
        validateProjectOwnership(endpoint.getProjectId(), organizationId);
        
        UrlValidator.validateWebhookUrl(request.getUrl(), allowPrivateIps, allowedHosts);
        
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
        
        if (request.getAllowedSourceIps() != null) {
            endpoint.setAllowedSourceIps(request.getAllowedSourceIps());
        }
        
        endpoint = endpointRepository.saveAndFlush(endpoint);
        
        return mapToResponse(endpoint);
    }

    @Transactional
    public void deleteEndpoint(UUID id, UUID organizationId) {
        Endpoint endpoint = endpointRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Endpoint not found"));
        validateProjectOwnership(endpoint.getProjectId(), organizationId);
        
        endpoint.setDeletedAt(Instant.now());
        endpointRepository.save(endpoint);
    }

    @Transactional
    public EndpointResponse rotateSecret(UUID id, UUID organizationId) {
        Endpoint endpoint = endpointRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Endpoint not found"));
        validateProjectOwnership(endpoint.getProjectId(), organizationId);
        
        String newSecret = CryptoUtils.generateSecureToken(32);
        CryptoUtils.EncryptedData encrypted = CryptoUtils.encryptSecret(newSecret, encryptionKey);
        
        endpoint.setSecretEncrypted(encrypted.getCiphertext());
        endpoint.setSecretIv(encrypted.getIv());
        endpoint = endpointRepository.saveAndFlush(endpoint);
        
        return mapToResponseWithSecret(endpoint, newSecret);
    }

    public EndpointTestResponse testEndpoint(UUID id, UUID organizationId) {
        Endpoint endpoint = endpointRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Endpoint not found"));
        validateProjectOwnership(endpoint.getProjectId(), organizationId);
        
        if (!endpoint.getEnabled()) {
            return EndpointTestResponse.builder()
                    .success(false)
                    .message("Endpoint is disabled")
                    .build();
        }
        
        try {
            UrlValidator.validateWebhookUrl(endpoint.getUrl(), allowPrivateIps, allowedHosts);
        } catch (UrlValidator.InvalidUrlException e) {
            return EndpointTestResponse.builder()
                    .success(false)
                    .errorMessage("SSRF protection: " + e.getMessage())
                    .message("Endpoint URL validation failed")
                    .build();
        }
        
        String secret = CryptoUtils.decryptSecret(
                endpoint.getSecretEncrypted(),
                endpoint.getSecretIv(),
                encryptionKey
        );
        
        String testPayload = "{\"test\":true,\"message\":\"This is a test webhook\",\"timestamp\":\"" 
                + Instant.now().toString() + "\"}";
        long timestamp = System.currentTimeMillis();
        String signature = WebhookSignatureUtils.buildSignatureHeader(secret, timestamp, testPayload);
        
        long startTime = System.currentTimeMillis();
        
        try {
            EndpointTestResponse response = webClient.post()
                    .uri(endpoint.getUrl())
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("X-Signature", signature)
                    .header("X-Event-Id", UUID.randomUUID().toString())
                    .header("X-Delivery-Id", UUID.randomUUID().toString())
                    .header("X-Timestamp", String.valueOf(timestamp))
                    .header("X-Test", "true")
                    .bodyValue(testPayload)
                    .exchangeToMono(resp -> {
                        int status = resp.statusCode().value();
                        return resp.bodyToMono(String.class)
                                .defaultIfEmpty("")
                                .map(responseBody -> new com.webhook.platform.api.dto.TestResult(status, responseBody));
                    })
                    .timeout(Duration.ofSeconds(10))
                    .blockOptional()
                    .map(result -> {
                        long latency = System.currentTimeMillis() - startTime;
                        boolean success = result.getStatus() >= 200 && result.getStatus() < 300;
                        String responseBody = result.getResponseBody();
                        
                        return EndpointTestResponse.builder()
                                .success(success)
                                .httpStatusCode(result.getStatus())
                                .responseBody(responseBody.length() > 500 ? responseBody.substring(0, 500) : responseBody)
                                .latencyMs(latency)
                                .message(success ? "Endpoint test successful" : "Endpoint returned non-2xx status")
                                .build();
                    })
                    .orElse(EndpointTestResponse.builder()
                            .success(false)
                            .errorMessage("No response received")
                            .latencyMs(System.currentTimeMillis() - startTime)
                            .message("Endpoint test failed")
                            .build());
            
            return response;
        } catch (Exception e) {
            long latency = System.currentTimeMillis() - startTime;
            log.error("Endpoint test failed for {}: {}", endpoint.getUrl(), e.getMessage());
            return EndpointTestResponse.builder()
                    .success(false)
                    .errorMessage(e.getMessage())
                    .latencyMs(latency)
                    .message("Endpoint test failed: " + e.getClass().getSimpleName())
                    .build();
        }
    }

    private EndpointResponse mapToResponse(Endpoint endpoint) {
        return mapToResponseWithSecret(endpoint, null);
    }

    private EndpointResponse mapToResponseWithSecret(Endpoint endpoint, String secret) {
        return EndpointResponse.builder()
                .id(endpoint.getId())
                .projectId(endpoint.getProjectId())
                .url(endpoint.getUrl())
                .description(endpoint.getDescription())
                .enabled(endpoint.getEnabled())
                .rateLimitPerSecond(endpoint.getRateLimitPerSecond())
                .allowedSourceIps(endpoint.getAllowedSourceIps())
                .mtlsEnabled(endpoint.getMtlsEnabled())
                .verificationStatus(endpoint.getVerificationStatus() != null ? endpoint.getVerificationStatus().name() : "PENDING")
                .verificationAttemptedAt(endpoint.getVerificationAttemptedAt())
                .verificationCompletedAt(endpoint.getVerificationCompletedAt())
                .verificationSkipReason(endpoint.getVerificationSkipReason())
                .createdAt(endpoint.getCreatedAt())
                .updatedAt(endpoint.getUpdatedAt())
                .secret(secret)
                .build();
    }

    @Transactional
    public EndpointResponse configureMtls(UUID projectId, UUID endpointId, 
            com.webhook.platform.api.dto.MtlsConfigRequest request, UUID organizationId) {
        Endpoint endpoint = endpointRepository.findById(endpointId)
                .orElseThrow(() -> new RuntimeException("Endpoint not found"));
        validateProjectOwnership(endpoint.getProjectId(), organizationId);

        if (!endpoint.getProjectId().equals(projectId)) {
            throw new RuntimeException("Endpoint not found in project");
        }

        CryptoUtils.EncryptedData encryptedCert = CryptoUtils.encryptSecret(request.getClientCert(), encryptionKey);
        CryptoUtils.EncryptedData encryptedKey = CryptoUtils.encryptSecret(request.getClientKey(), encryptionKey);

        endpoint.setMtlsEnabled(true);
        endpoint.setClientCertEncrypted(encryptedCert.getCiphertext());
        endpoint.setClientCertIv(encryptedCert.getIv());
        endpoint.setClientKeyEncrypted(encryptedKey.getCiphertext());
        endpoint.setClientKeyIv(encryptedKey.getIv());
        endpoint.setCaCert(request.getCaCert());

        endpoint = endpointRepository.saveAndFlush(endpoint);
        log.info("Configured mTLS for endpoint {}", endpointId);

        return mapToResponse(endpoint);
    }

    @Transactional
    public EndpointResponse disableMtls(UUID projectId, UUID endpointId, UUID organizationId) {
        Endpoint endpoint = endpointRepository.findById(endpointId)
                .orElseThrow(() -> new RuntimeException("Endpoint not found"));
        validateProjectOwnership(endpoint.getProjectId(), organizationId);

        if (!endpoint.getProjectId().equals(projectId)) {
            throw new RuntimeException("Endpoint not found in project");
        }

        endpoint.setMtlsEnabled(false);
        endpoint.setClientCertEncrypted(null);
        endpoint.setClientCertIv(null);
        endpoint.setClientKeyEncrypted(null);
        endpoint.setClientKeyIv(null);
        endpoint.setCaCert(null);

        endpoint = endpointRepository.saveAndFlush(endpoint);
        log.info("Disabled mTLS for endpoint {}", endpointId);

        return mapToResponse(endpoint);
    }
}
