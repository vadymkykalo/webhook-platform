package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.Membership;
import com.webhook.platform.api.domain.entity.Organization;
import com.webhook.platform.api.domain.repository.MembershipRepository;
import com.webhook.platform.api.domain.repository.OrganizationRepository;
import com.webhook.platform.api.dto.OrganizationResponse;
import com.webhook.platform.api.dto.UpdateOrganizationRequest;
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

    public OrganizationService(
            OrganizationRepository organizationRepository,
            MembershipRepository membershipRepository) {
        this.organizationRepository = organizationRepository;
        this.membershipRepository = membershipRepository;
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

    public OrganizationResponse getOrganization(UUID orgId, UUID userId) {
        if (!membershipRepository.existsByUserIdAndOrganizationId(userId, orgId)) {
            throw new ForbiddenException("Access denied");
        }

        Organization organization = organizationRepository.findById(orgId)
                .orElseThrow(() -> new NotFoundException("Organization not found"));

        return OrganizationResponse.builder()
                .id(organization.getId())
                .name(organization.getName())
                .createdAt(organization.getCreatedAt())
                .build();
    }

    @Transactional
    public OrganizationResponse updateOrganization(UUID orgId, UUID organizationId, UpdateOrganizationRequest request) {
        if (!orgId.equals(organizationId)) {
            throw new ForbiddenException("Access denied");
        }

        Organization organization = organizationRepository.findById(orgId)
                .orElseThrow(() -> new NotFoundException("Organization not found"));

        organization.setName(request.getName().trim());
        organization = organizationRepository.save(organization);
        log.info("Organization {} renamed to '{}'", orgId, organization.getName());

        return OrganizationResponse.builder()
                .id(organization.getId())
                .name(organization.getName())
                .createdAt(organization.getCreatedAt())
                .build();
    }
}
