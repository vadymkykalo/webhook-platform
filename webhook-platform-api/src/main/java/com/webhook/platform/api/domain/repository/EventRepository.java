package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.Event;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EventRepository extends JpaRepository<Event, UUID> {
    Optional<Event> findByProjectIdAndIdempotencyKey(UUID projectId, String idempotencyKey);
    List<Event> findByProjectId(UUID projectId);
    Page<Event> findByProjectId(UUID projectId, Pageable pageable);

    @Query("SELECT COUNT(e) FROM Event e WHERE e.projectId = :projectId AND e.createdAt BETWEEN :from AND :to")
    long countByProjectIdAndCreatedAtBetween(@Param("projectId") UUID projectId, @Param("from") Instant from, @Param("to") Instant to);

    @Query(value = """
        SELECT 
            CAST(e.id AS text),
            e.event_type,
            e.created_at,
            COUNT(d.id) as delivery_count
        FROM events e
        LEFT JOIN deliveries d ON d.event_id = e.id
        WHERE e.project_id = :projectId
        GROUP BY e.id, e.event_type, e.created_at
        ORDER BY e.created_at DESC
        LIMIT 10
        """, nativeQuery = true)
    List<Object[]> findRecentEventsWithDeliveryCount(@Param("projectId") UUID projectId);

    @Query(value = """
        SELECT 
            e.event_type as event_type,
            COUNT(*) as event_count,
            COUNT(*) FILTER (WHERE d.status = 'SUCCESS') as success_count
        FROM events e
        LEFT JOIN deliveries d ON d.event_id = e.id
        WHERE e.project_id = :projectId AND e.created_at BETWEEN :from AND :to
        GROUP BY e.event_type
        ORDER BY event_count DESC
        LIMIT 10
        """, nativeQuery = true)
    List<Object[]> findEventTypeBreakdownByProjectId(
            @Param("projectId") UUID projectId,
            @Param("from") Instant from,
            @Param("to") Instant to);
}
