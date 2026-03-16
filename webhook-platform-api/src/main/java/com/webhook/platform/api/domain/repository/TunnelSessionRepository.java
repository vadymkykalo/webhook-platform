package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.TunnelSession;
import com.webhook.platform.api.domain.enums.TunnelStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TunnelSessionRepository extends JpaRepository<TunnelSession, UUID> {

    Optional<TunnelSession> findByTunnelToken(String tunnelToken);

    Optional<TunnelSession> findByPublicSlug(String publicSlug);

    List<TunnelSession> findByOrganizationIdAndStatus(UUID organizationId, TunnelStatus status);

    List<TunnelSession> findByUserIdAndStatus(UUID userId, TunnelStatus status);

    List<TunnelSession> findByOrganizationIdAndProjectIdAndStatus(UUID organizationId, UUID projectId, TunnelStatus status);

    Optional<TunnelSession> findByIdAndOrganizationId(UUID id, UUID organizationId);

    long countByOrganizationIdAndStatus(UUID organizationId, TunnelStatus status);

    @Modifying
    @Query("UPDATE TunnelSession t SET t.status = 'EXPIRED', t.closedAt = :now " +
           "WHERE t.status = 'ACTIVE' AND t.lastHeartbeat < :threshold")
    int expireStale(Instant threshold, Instant now);
}
