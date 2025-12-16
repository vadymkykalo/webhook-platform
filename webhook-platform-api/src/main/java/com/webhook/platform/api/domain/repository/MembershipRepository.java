package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.Membership;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MembershipRepository extends JpaRepository<Membership, UUID> {
    List<Membership> findByUserId(UUID userId);
    List<Membership> findByOrganizationId(UUID organizationId);
    Optional<Membership> findByUserIdAndOrganizationId(UUID userId, UUID organizationId);
    boolean existsByUserIdAndOrganizationId(UUID userId, UUID organizationId);
}
