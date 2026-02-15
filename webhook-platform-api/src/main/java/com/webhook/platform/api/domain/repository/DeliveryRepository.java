package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.Delivery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.webhook.platform.api.domain.enums.DeliveryStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface DeliveryRepository extends JpaRepository<Delivery, UUID>, JpaSpecificationExecutor<Delivery> {
    Page<Delivery> findByEventId(UUID eventId, Pageable pageable);
    Page<Delivery> findByEventIdIn(List<UUID> eventIds, Pageable pageable);

    @Query("SELECT COUNT(d) FROM Delivery d WHERE d.event.projectId = :projectId AND d.createdAt BETWEEN :from AND :to")
    long countByProjectIdAndCreatedAtBetween(@Param("projectId") UUID projectId, @Param("from") Instant from, @Param("to") Instant to);

    @Query("SELECT COUNT(d) FROM Delivery d WHERE d.event.projectId = :projectId AND d.status = :status AND d.createdAt BETWEEN :from AND :to")
    long countByProjectIdAndStatusAndCreatedAtBetween(@Param("projectId") UUID projectId, @Param("status") DeliveryStatus status, @Param("from") Instant from, @Param("to") Instant to);

    @Query(value = """
        SELECT 
            TO_CHAR(DATE_TRUNC('hour', d.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ts,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE d.status = 'SUCCESS') as success,
            COUNT(*) FILTER (WHERE d.status IN ('FAILED', 'DEAD_LETTER')) as failed
        FROM deliveries d
        JOIN events e ON d.event_id = e.id
        WHERE e.project_id = :projectId AND d.created_at BETWEEN :from AND :to
        GROUP BY DATE_TRUNC('hour', d.created_at)
        ORDER BY ts
        """, nativeQuery = true)
    List<Object[]> findDeliveryTimeSeriesByHour(
            @Param("projectId") UUID projectId,
            @Param("from") Instant from,
            @Param("to") Instant to);

    @Query(value = """
        SELECT 
            TO_CHAR(DATE_TRUNC('day', d.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ts,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE d.status = 'SUCCESS') as success,
            COUNT(*) FILTER (WHERE d.status IN ('FAILED', 'DEAD_LETTER')) as failed
        FROM deliveries d
        JOIN events e ON d.event_id = e.id
        WHERE e.project_id = :projectId AND d.created_at BETWEEN :from AND :to
        GROUP BY DATE_TRUNC('day', d.created_at)
        ORDER BY ts
        """, nativeQuery = true)
    List<Object[]> findDeliveryTimeSeriesByDay(
            @Param("projectId") UUID projectId,
            @Param("from") Instant from,
            @Param("to") Instant to);

    @Query(value = """
        SELECT 
            CAST(e.id AS text) as endpoint_id,
            e.url,
            e.enabled,
            COUNT(d.*) as total_deliveries,
            COUNT(*) FILTER (WHERE d.status = 'SUCCESS') as successful,
            COUNT(*) FILTER (WHERE d.status IN ('FAILED', 'DEAD_LETTER')) as failed,
            AVG(da.duration_ms) as avg_latency,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY da.duration_ms) as p95_latency,
            MAX(d.created_at) as last_delivery
        FROM endpoints e
        LEFT JOIN subscriptions s ON s.endpoint_id = e.id
        LEFT JOIN deliveries d ON d.endpoint_id = e.id AND d.created_at BETWEEN :from AND :to
        LEFT JOIN delivery_attempts da ON da.delivery_id = d.id
        WHERE e.project_id = :projectId
        GROUP BY e.id, e.url, e.enabled
        ORDER BY total_deliveries DESC
        LIMIT 10
        """, nativeQuery = true)
    List<Object[]> findEndpointPerformanceByProjectId(
            @Param("projectId") UUID projectId,
            @Param("from") Instant from,
            @Param("to") Instant to);

    @Query("SELECT d FROM Delivery d WHERE d.status = 'DLQ' AND d.event.projectId = :projectId ORDER BY d.failedAt DESC")
    Page<Delivery> findDlqByProjectId(@Param("projectId") UUID projectId, Pageable pageable);

    @Query("SELECT d FROM Delivery d WHERE d.status = 'DLQ' AND d.event.projectId = :projectId AND d.endpointId = :endpointId ORDER BY d.failedAt DESC")
    Page<Delivery> findDlqByProjectIdAndEndpointId(@Param("projectId") UUID projectId, @Param("endpointId") UUID endpointId, Pageable pageable);

    @Query("SELECT COUNT(d) FROM Delivery d WHERE d.status = 'DLQ' AND d.event.projectId = :projectId")
    long countDlqByProjectId(@Param("projectId") UUID projectId);

    @Query("SELECT COUNT(d) FROM Delivery d WHERE d.status = 'DLQ' AND d.event.projectId = :projectId AND d.failedAt >= :since")
    long countDlqByProjectIdSince(@Param("projectId") UUID projectId, @Param("since") Instant since);

    List<Delivery> findByIdInAndStatus(List<UUID> ids, DeliveryStatus status);

    @Modifying
    @Query("DELETE FROM Delivery d WHERE d.status = 'DLQ' AND d.event.projectId = :projectId")
    void deleteDlqByProjectId(@Param("projectId") UUID projectId);
}
