package com.webhook.platform.worker.domain.repository;

import com.webhook.platform.worker.domain.entity.Delivery;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import org.springframework.data.jpa.repository.Modifying;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface DeliveryRepository extends JpaRepository<Delivery, UUID> {

    @Modifying
    @Query(value = "UPDATE deliveries SET status = 'PENDING', " +
           "next_retry_at = now(), updated_at = now(), version = version + 1 " +
           "WHERE status = 'PROCESSING' AND (last_attempt_at < :threshold OR (last_attempt_at IS NULL AND updated_at < :threshold))", nativeQuery = true)
    int resetStuckDeliveries(@Param("threshold") Instant threshold);
    
    @Query(value = """
            SELECT id FROM (
                SELECT d.id,
                       ROW_NUMBER() OVER (PARTITION BY d.endpoint_id ORDER BY d.next_retry_at ASC) AS rn_ep,
                       ROW_NUMBER() OVER (PARTITION BY e.project_id ORDER BY d.next_retry_at ASC) AS rn_proj
                FROM deliveries d
                JOIN endpoints e ON d.endpoint_id = e.id
                WHERE d.status = :#{#status.name()} AND d.next_retry_at IS NOT NULL AND d.next_retry_at <= :now
            ) sub WHERE rn_ep <= :maxPerEndpoint AND rn_proj <= :maxPerProject
            ORDER BY rn_proj ASC, rn_ep ASC LIMIT :limit
            """, nativeQuery = true)
    List<UUID> findPendingRetryIds(
            @Param("status") Delivery.DeliveryStatus status,
            @Param("now") Instant now,
            @Param("limit") int limit,
            @Param("maxPerEndpoint") int maxPerEndpoint,
            @Param("maxPerProject") int maxPerProject
    );

    @Query(value = """
            SELECT * FROM deliveries WHERE id IN :ids ORDER BY next_retry_at ASC FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<Delivery> lockByIds(@Param("ids") List<UUID> ids);

    @Modifying
    @Query(value = "UPDATE deliveries SET status = 'PROCESSING', " +
            "last_attempt_at = now(), updated_at = now(), version = version + 1 " +
            "WHERE id = :id AND status = 'PENDING'", nativeQuery = true)
    int claimForProcessing(@Param("id") UUID id);

    @Modifying
    @Query(value = "UPDATE deliveries SET attempt_count = attempt_count + 1, " +
            "updated_at = now(), version = version + 1 " +
            "WHERE id = :id", nativeQuery = true)
    int incrementAttemptCount(@Param("id") UUID id);

    @Query("SELECT MIN(d.createdAt) FROM Delivery d WHERE d.endpointId = :endpointId AND d.sequenceNumber = :sequenceNumber AND d.status IN ('PENDING', 'PROCESSING')")
    Instant findOldestPendingCreatedAt(
            @Param("endpointId") UUID endpointId,
            @Param("sequenceNumber") Long sequenceNumber
    );

    @Query("SELECT COUNT(d) FROM Delivery d WHERE d.status = 'PENDING' AND d.createdAt > :since")
    long countPending(@Param("since") Instant since);

    @Query("SELECT COUNT(d) FROM Delivery d WHERE d.status = 'PROCESSING' AND d.createdAt > :since")
    long countProcessing(@Param("since") Instant since);

    @Query("SELECT COUNT(d) FROM Delivery d WHERE d.status = 'DLQ' AND d.createdAt > :since")
    long countDlq(@Param("since") Instant since);
}
