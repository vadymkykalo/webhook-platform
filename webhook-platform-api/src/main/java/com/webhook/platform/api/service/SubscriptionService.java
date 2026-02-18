package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.Project;
import com.webhook.platform.api.domain.entity.Subscription;
import com.webhook.platform.api.domain.repository.ProjectRepository;
import com.webhook.platform.api.domain.repository.SubscriptionRepository;
import com.webhook.platform.api.dto.SubscriptionRequest;
import com.webhook.platform.api.dto.SubscriptionResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class SubscriptionService {

    private final SubscriptionRepository subscriptionRepository;
    private final ProjectRepository projectRepository;
    private final ObjectMapper objectMapper;

    public SubscriptionService(
            SubscriptionRepository subscriptionRepository,
            ProjectRepository projectRepository,
            ObjectMapper objectMapper) {
        this.subscriptionRepository = subscriptionRepository;
        this.projectRepository = projectRepository;
        this.objectMapper = objectMapper;
    }

    private void validateProjectOwnership(UUID projectId, UUID organizationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("Project not found"));
        if (!project.getOrganizationId().equals(organizationId)) {
            throw new RuntimeException("Access denied");
        }
    }

    @Transactional
    public SubscriptionResponse createSubscription(UUID projectId, SubscriptionRequest request, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        validatePayloadTemplate(request.getPayloadTemplate());
        Subscription subscription = Subscription.builder()
                .projectId(projectId)
                .endpointId(request.getEndpointId())
                .eventType(request.getEventType())
                .enabled(request.getEnabled() != null ? request.getEnabled() : true)
                .orderingEnabled(request.getOrderingEnabled() != null ? request.getOrderingEnabled() : false)
                .maxAttempts(request.getMaxAttempts() != null ? request.getMaxAttempts() : 7)
                .timeoutSeconds(request.getTimeoutSeconds() != null ? request.getTimeoutSeconds() : 30)
                .retryDelays(request.getRetryDelays() != null ? request.getRetryDelays() : "60,300,900,3600,21600,86400")
                .payloadTemplate(request.getPayloadTemplate())
                .customHeaders(request.getCustomHeaders())
                .build();
        
        subscription = subscriptionRepository.saveAndFlush(subscription);
        return mapToResponse(subscription);
    }

    public SubscriptionResponse getSubscription(UUID id, UUID organizationId) {
        Subscription subscription = subscriptionRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));
        validateProjectOwnership(subscription.getProjectId(), organizationId);
        return mapToResponse(subscription);
    }

    public List<SubscriptionResponse> listSubscriptions(UUID projectId, UUID organizationId) {
        validateProjectOwnership(projectId, organizationId);
        return subscriptionRepository.findByProjectId(projectId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public SubscriptionResponse updateSubscription(UUID id, SubscriptionRequest request, UUID organizationId) {
        Subscription subscription = subscriptionRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));
        validateProjectOwnership(subscription.getProjectId(), organizationId);
        
        if (request.getEndpointId() != null) {
            subscription.setEndpointId(request.getEndpointId());
        }
        if (request.getEventType() != null) {
            subscription.setEventType(request.getEventType());
        }
        if (request.getEnabled() != null) {
            subscription.setEnabled(request.getEnabled());
        }
        if (request.getOrderingEnabled() != null) {
            subscription.setOrderingEnabled(request.getOrderingEnabled());
        }
        if (request.getMaxAttempts() != null) {
            subscription.setMaxAttempts(request.getMaxAttempts());
        }
        if (request.getTimeoutSeconds() != null) {
            subscription.setTimeoutSeconds(request.getTimeoutSeconds());
        }
        if (request.getRetryDelays() != null) {
            subscription.setRetryDelays(request.getRetryDelays());
        }
        if (request.getPayloadTemplate() != null) {
            validatePayloadTemplate(request.getPayloadTemplate());
            subscription.setPayloadTemplate(request.getPayloadTemplate());
        }
        if (request.getCustomHeaders() != null) {
            subscription.setCustomHeaders(request.getCustomHeaders());
        }
        
        subscription = subscriptionRepository.saveAndFlush(subscription);
        return mapToResponse(subscription);
    }

    @Transactional
    public void deleteSubscription(UUID id, UUID organizationId) {
        Subscription subscription = subscriptionRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));
        validateProjectOwnership(subscription.getProjectId(), organizationId);
        subscriptionRepository.deleteById(id);
    }

    private void validatePayloadTemplate(String template) {
        if (template == null || template.isBlank()) {
            return;
        }
        try {
            objectMapper.readTree(template);
        } catch (Exception e) {
            throw new RuntimeException("Invalid payload template: not valid JSON - " + e.getMessage());
        }
    }

    private SubscriptionResponse mapToResponse(Subscription subscription) {
        return SubscriptionResponse.builder()
                .id(subscription.getId())
                .projectId(subscription.getProjectId())
                .endpointId(subscription.getEndpointId())
                .eventType(subscription.getEventType())
                .enabled(subscription.getEnabled())
                .orderingEnabled(subscription.getOrderingEnabled())
                .maxAttempts(subscription.getMaxAttempts())
                .timeoutSeconds(subscription.getTimeoutSeconds())
                .retryDelays(subscription.getRetryDelays())
                .payloadTemplate(subscription.getPayloadTemplate())
                .customHeaders(subscription.getCustomHeaders())
                .createdAt(subscription.getCreatedAt())
                .updatedAt(subscription.getUpdatedAt())
                .build();
    }
}
