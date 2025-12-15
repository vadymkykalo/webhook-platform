package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Subscription;
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

    public SubscriptionService(SubscriptionRepository subscriptionRepository) {
        this.subscriptionRepository = subscriptionRepository;
    }

    @Transactional
    public SubscriptionResponse createSubscription(UUID projectId, SubscriptionRequest request) {
        Subscription subscription = Subscription.builder()
                .projectId(projectId)
                .endpointId(request.getEndpointId())
                .eventType(request.getEventType())
                .enabled(request.getEnabled() != null ? request.getEnabled() : true)
                .build();
        
        subscription = subscriptionRepository.save(subscription);
        return mapToResponse(subscription);
    }

    public SubscriptionResponse getSubscription(UUID id) {
        Subscription subscription = subscriptionRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));
        return mapToResponse(subscription);
    }

    public List<SubscriptionResponse> listSubscriptions(UUID projectId) {
        return subscriptionRepository.findAll().stream()
                .filter(s -> s.getProjectId().equals(projectId))
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public SubscriptionResponse updateSubscription(UUID id, SubscriptionRequest request) {
        Subscription subscription = subscriptionRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Subscription not found"));
        
        if (request.getEndpointId() != null) {
            subscription.setEndpointId(request.getEndpointId());
        }
        if (request.getEventType() != null) {
            subscription.setEventType(request.getEventType());
        }
        if (request.getEnabled() != null) {
            subscription.setEnabled(request.getEnabled());
        }
        
        subscription = subscriptionRepository.save(subscription);
        return mapToResponse(subscription);
    }

    @Transactional
    public void deleteSubscription(UUID id) {
        subscriptionRepository.deleteById(id);
    }

    private SubscriptionResponse mapToResponse(Subscription subscription) {
        return SubscriptionResponse.builder()
                .id(subscription.getId())
                .projectId(subscription.getProjectId())
                .endpointId(subscription.getEndpointId())
                .eventType(subscription.getEventType())
                .enabled(subscription.getEnabled())
                .createdAt(subscription.getCreatedAt())
                .updatedAt(subscription.getUpdatedAt())
                .build();
    }
}
