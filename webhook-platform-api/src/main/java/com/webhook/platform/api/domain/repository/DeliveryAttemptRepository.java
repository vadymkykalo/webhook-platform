package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.DeliveryAttempt;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface DeliveryAttemptRepository extends JpaRepository<DeliveryAttempt, UUID> {
    List<DeliveryAttempt> findByDeliveryIdOrderByAttemptNumberAsc(UUID deliveryId);
    
    @Modifying(clearAutomatically = true)
    @Query(value = """
        WITH rows_to_delete AS (
            SELECT id 
            FROM delivery_attempts 
            WHERE created_at < :cutoffTime 
            ORDER BY created_at ASC 
            LIMIT :limit
        )
        DELETE FROM delivery_attempts 
        WHERE id IN (SELECT id FROM rows_to_delete)
        """, nativeQuery = true)
    int deleteOldAttempts(@Param("cutoffTime") Instant cutoffTime, @Param("limit") int limit);
    
    @Modifying(clearAutomatically = true)
    @Query(value = """
        WITH rows_to_delete AS (
            SELECT id FROM (
                SELECT id, 
                       ROW_NUMBER() OVER (PARTITION BY delivery_id ORDER BY attempt_number DESC) as rn
                FROM delivery_attempts
            ) t
            WHERE t.rn > :maxAttemptsPerDelivery
            LIMIT :limit
        )
        DELETE FROM delivery_attempts 
        WHERE id IN (SELECT id FROM rows_to_delete)
        """, nativeQuery = true)
    int deleteExcessAttemptsPerDelivery(@Param("maxAttemptsPerDelivery") int maxAttemptsPerDelivery, @Param("limit") int limit);
    
    @Query(value = "SELECT COUNT(*) FROM delivery_attempts", nativeQuery = true)
    long countAllAttempts();

    @Query(value = """
        SELECT AVG(da.duration_ms) FROM delivery_attempts da
        JOIN deliveries d ON da.delivery_id = d.id
        JOIN events e ON d.event_id = e.id
        WHERE e.project_id = :projectId AND da.created_at BETWEEN :from AND :to
        """, nativeQuery = true)
    Double findAverageLatencyByProjectIdAndAttemptedAtBetween(
            @Param("projectId") UUID projectId,
            @Param("from") Instant from,
            @Param("to") Instant to);

    @Query(value = """
        SELECT PERCENTILE_CONT(:percentile) WITHIN GROUP (ORDER BY da.duration_ms)
        FROM delivery_attempts da
        JOIN deliveries d ON da.delivery_id = d.id
        JOIN events e ON d.event_id = e.id
        WHERE e.project_id = :projectId AND da.created_at BETWEEN :from AND :to
        """, nativeQuery = true)
    Long findLatencyPercentileByProjectId(
            @Param("projectId") UUID projectId,
            @Param("from") Instant from,
            @Param("to") Instant to,
            @Param("percentile") double percentile);

    @Query(value = """
        SELECT 
            TO_CHAR(DATE_TRUNC('hour', da.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ts,
            COUNT(*) as total,
            AVG(da.duration_ms) as avg_latency
        FROM delivery_attempts da
        JOIN deliveries d ON da.delivery_id = d.id
        JOIN events e ON d.event_id = e.id
        WHERE e.project_id = :projectId AND da.created_at BETWEEN :from AND :to
        GROUP BY DATE_TRUNC('hour', da.created_at)
        ORDER BY ts
        """, nativeQuery = true)
    List<Object[]> findLatencyTimeSeriesByHour(
            @Param("projectId") UUID projectId,
            @Param("from") Instant from,
            @Param("to") Instant to);

    @Query(value = """
        SELECT 
            TO_CHAR(DATE_TRUNC('day', da.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ts,
            COUNT(*) as total,
            AVG(da.duration_ms) as avg_latency
        FROM delivery_attempts da
        JOIN deliveries d ON da.delivery_id = d.id
        JOIN events e ON d.event_id = e.id
        WHERE e.project_id = :projectId AND da.created_at BETWEEN :from AND :to
        GROUP BY DATE_TRUNC('day', da.created_at)
        ORDER BY ts
        """, nativeQuery = true)
    List<Object[]> findLatencyTimeSeriesByDay(
            @Param("projectId") UUID projectId,
            @Param("from") Instant from,
            @Param("to") Instant to);
}
