package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Membership;
import com.webhook.platform.api.domain.entity.Organization;
import com.webhook.platform.api.domain.repository.MembershipRepository;
import com.webhook.platform.api.domain.repository.OrganizationRepository;
import com.webhook.platform.api.dto.OrganizationResponse;
import com.webhook.platform.api.dto.UpdateOrganizationRequest;
import com.webhook.platform.api.tenancy.TenantContext;
import jakarta.persistence.EntityManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.webhook.platform.api.exception.ForbiddenException;
import com.webhook.platform.api.exception.NotFoundException;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
public class OrganizationService {

    private final OrganizationRepository organizationRepository;
    private final MembershipRepository membershipRepository;
    private final EntityManager entityManager;

    public OrganizationService(
            OrganizationRepository organizationRepository,
            MembershipRepository membershipRepository,
            EntityManager entityManager) {
        this.organizationRepository = organizationRepository;
        this.membershipRepository = membershipRepository;
        this.entityManager = entityManager;
    }

    public List<OrganizationResponse> getUserOrganizations(UUID userId) {
        List<Membership> memberships = membershipRepository.findByUserId(userId);
        
        return memberships.stream()
                .map(membership -> {
                    Organization org = organizationRepository.findById(membership.getOrganizationId())
                            .orElseThrow(() -> new NotFoundException("Organization not found"));
                    return OrganizationResponse.builder()
                            .id(org.getId())
                            .name(org.getName())
                            .createdAt(org.getCreatedAt())
                            .build();
                })
                .collect(Collectors.toList());
    }

    public OrganizationResponse getOrganization(UUID userId) {
        UUID organizationId = TenantContext.require();
        if (!membershipRepository.existsByUserIdAndOrganizationId(userId, organizationId)) {
            throw new ForbiddenException("Access denied");
        }

        Organization organization = organizationRepository.findById(organizationId)
                .orElseThrow(() -> new NotFoundException("Organization not found"));

        return OrganizationResponse.builder()
                .id(organization.getId())
                .name(organization.getName())
                .createdAt(organization.getCreatedAt())
                .build();
    }

    /**
     * GDPR Article 17 — permanently deletes organization and all associated data.
     * Relies on ON DELETE CASCADE constraints in the schema:
     * organizations → projects → (api_keys, events, endpoints, subscriptions, deliveries, ...)
     * organizations → memberships
     * organizations → audit_logs
     */
    @Transactional
    public void deleteOrganization() {
        UUID organizationId = TenantContext.require();
        Organization organization = organizationRepository.findById(organizationId)
                .orElseThrow(() -> new NotFoundException("Organization not found"));

        log.warn("GDPR DELETE: permanently deleting organization {} ('{}')", organizationId, organization.getName());
        organizationRepository.delete(organization);
        entityManager.flush();
        log.info("GDPR DELETE: organization {} deleted successfully", organizationId);
    }

    @Transactional
    public OrganizationResponse updateOrganization(UpdateOrganizationRequest request) {
        // Was: an {orgId} path variable compared against the token's organization. Both halves
        // are gone -- @RequireOrgAccess already rejects a mismatched path variable, and the
        // organization being updated is now the caller's tenant by construction.
        UUID organizationId = TenantContext.require();

        Organization organization = organizationRepository.findById(organizationId)
                .orElseThrow(() -> new NotFoundException("Organization not found"));

        organization.setName(request.getName().trim());
        organization = organizationRepository.save(organization);
        log.info("Organization {} renamed to '{}'", organizationId, organization.getName());

        return OrganizationResponse.builder()
                .id(organization.getId())
                .name(organization.getName())
                .createdAt(organization.getCreatedAt())
                .build();
    }
}
