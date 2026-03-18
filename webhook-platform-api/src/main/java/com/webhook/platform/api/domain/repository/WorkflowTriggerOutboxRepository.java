package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.WorkflowTriggerOutbox;
import com.webhook.platform.api.domain.enums.WorkflowTriggerOutboxStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface WorkflowTriggerOutboxRepository extends JpaRepository<WorkflowTriggerOutbox, UUID> {

    @Query(value = """
        UPDATE workflow_trigger_outbox
        SET status = 'PROCESSING', attempts = attempts + 1
        WHERE id IN (
            SELECT id FROM workflow_trigger_outbox
            WHERE status = 'PENDING'
            ORDER BY created_at
            LIMIT :batchSize
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
        """, nativeQuery = true)
    List<WorkflowTriggerOutbox> claimBatch(@Param("batchSize") int batchSize);

    @Modifying
    @Query("DELETE FROM WorkflowTriggerOutbox w WHERE w.status = :status AND w.processedAt < :before")
    int deleteByStatusAndProcessedAtBefore(
            @Param("status") WorkflowTriggerOutboxStatus status,
            @Param("before") Instant before);
}
