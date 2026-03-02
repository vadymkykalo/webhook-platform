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

    // --- Event Time Machine: cursor-based scanning (no OFFSET, highload-safe) ---

    @Query(value = """
        SELECT e.* FROM events e
        WHERE e.project_id = :projectId
          AND e.created_at >= :fromDate AND e.created_at <= :toDate
          AND (e.created_at, e.id) > (:cursorCreatedAt, :cursorId)
        ORDER BY e.created_at, e.id
        LIMIT :batchSize
        """, nativeQuery = true)
    List<Event> findByCursorForReplay(
            @Param("projectId") UUID projectId,
            @Param("fromDate") Instant fromDate,
            @Param("toDate") Instant toDate,
            @Param("cursorCreatedAt") Instant cursorCreatedAt,
            @Param("cursorId") UUID cursorId,
            @Param("batchSize") int batchSize);

    @Query(value = """
        SELECT e.* FROM events e
        WHERE e.project_id = :projectId
          AND e.created_at >= :fromDate AND e.created_at <= :toDate
          AND e.event_type = :eventType
          AND (e.created_at, e.id) > (:cursorCreatedAt, :cursorId)
        ORDER BY e.created_at, e.id
        LIMIT :batchSize
        """, nativeQuery = true)
    List<Event> findByCursorForReplayWithEventType(
            @Param("projectId") UUID projectId,
            @Param("fromDate") Instant fromDate,
            @Param("toDate") Instant toDate,
            @Param("eventType") String eventType,
            @Param("cursorCreatedAt") Instant cursorCreatedAt,
            @Param("cursorId") UUID cursorId,
            @Param("batchSize") int batchSize);

    @Query(value = """
        SELECT COUNT(*) FROM events e
        WHERE e.project_id = :projectId
          AND e.created_at >= :fromDate AND e.created_at <= :toDate
        """, nativeQuery = true)
    long countForReplay(
            @Param("projectId") UUID projectId,
            @Param("fromDate") Instant fromDate,
            @Param("toDate") Instant toDate);

    @Query(value = """
        SELECT COUNT(*) FROM events e
        WHERE e.project_id = :projectId
          AND e.created_at >= :fromDate AND e.created_at <= :toDate
          AND e.event_type = :eventType
        """, nativeQuery = true)
    long countForReplayWithEventType(
            @Param("projectId") UUID projectId,
            @Param("fromDate") Instant fromDate,
            @Param("toDate") Instant toDate,
            @Param("eventType") String eventType);
}
