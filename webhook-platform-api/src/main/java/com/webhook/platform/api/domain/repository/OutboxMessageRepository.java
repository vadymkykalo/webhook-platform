package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface OutboxMessageRepository extends JpaRepository<OutboxMessage, UUID> {
    @Query(value = """
            SELECT * FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY kafka_key ORDER BY created_at ASC) AS rn
                FROM outbox_messages WHERE status = :status
            ) sub WHERE rn <= :maxPerKey ORDER BY created_at ASC LIMIT :limit FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<OutboxMessage> findPendingBatchForUpdate(@Param("status") String status, @Param("limit") int limit, @Param("maxPerKey") int maxPerKey);

    @Query(value = """
            SELECT * FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY kafka_key ORDER BY created_at ASC) AS rn
                FROM outbox_messages WHERE status = :status AND retry_count < :maxRetries
            ) sub WHERE rn <= :maxPerKey ORDER BY created_at ASC LIMIT :limit FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<OutboxMessage> findFailedMessagesForRetry(@Param("status") String status, @Param("maxRetries") int maxRetries, @Param("limit") int limit, @Param("maxPerKey") int maxPerKey);
    
    @Modifying
    @Query(value = "DELETE FROM outbox_messages WHERE id IN (SELECT id FROM outbox_messages WHERE status = :status AND created_at < :cutoffTime ORDER BY created_at ASC LIMIT :limit)", nativeQuery = true)
    int deleteOldPublishedMessages(@Param("status") String status, @Param("cutoffTime") Instant cutoffTime, @Param("limit") int limit);

    long countByStatus(OutboxStatus status);

    @Query(value = "SELECT MIN(created_at) FROM outbox_messages WHERE status = 'PENDING'", nativeQuery = true)
    Instant findOldestPendingCreatedAt();

    @Modifying
    @Query(value = "UPDATE outbox_messages SET status = 'PENDING' WHERE status = 'SENDING' AND updated_at < :cutoff", nativeQuery = true)
    int recoverStuckSendingMessages(@Param("cutoff") Instant cutoff);
}
