package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.Membership;
import com.webhook.platform.api.domain.enums.MembershipRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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

    Optional<Membership> findByInviteToken(String inviteToken);

    long countByOrganizationIdAndRole(UUID organizationId, MembershipRole role);

    @Query("SELECT m, u FROM Membership m JOIN User u ON m.userId = u.id WHERE m.organizationId = :orgId")
    List<Object[]> findMembersWithUsers(@Param("orgId") UUID organizationId);
}
