package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.AlertEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.UUID;

@Repository
public interface AlertEventRepository extends JpaRepository<AlertEvent, UUID> {
    Page<AlertEvent> findByProjectIdOrderByCreatedAtDesc(UUID projectId, Pageable pageable);

    long countByProjectIdAndResolvedFalse(UUID projectId);

    @Modifying
    @Query("UPDATE AlertEvent e SET e.resolved = true, e.resolvedAt = :now WHERE e.projectId = :projectId AND e.resolved = false")
    int resolveAllByProjectId(@Param("projectId") UUID projectId, @Param("now") Instant now);

    @Modifying
    @Query("UPDATE AlertEvent e SET e.resolved = true, e.resolvedAt = :now WHERE e.id = :id AND e.projectId = :projectId")
    int resolveById(@Param("id") UUID id, @Param("projectId") UUID projectId, @Param("now") Instant now);

    @Modifying
    @Query(value = "DELETE FROM alert_events WHERE created_at < :cutoff", nativeQuery = true)
    int deleteOlderThan(@Param("cutoff") Instant cutoff);
}
