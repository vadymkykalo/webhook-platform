package com.webhook.platform.worker.domain.repository;

import com.webhook.platform.worker.domain.entity.OrderingCursor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface OrderingCursorRepository extends JpaRepository<OrderingCursor, UUID> {

    /**
     * Upserts the cursor atomically.
     * Only updates if new sequence > current sequence.
     */
    @Modifying
    @Query(value = """
        INSERT INTO ordering_cursors (endpoint_id, last_delivered_sequence, updated_at)
        VALUES (:endpointId, :sequence, CURRENT_TIMESTAMP)
        ON CONFLICT (endpoint_id)
        DO UPDATE SET
            last_delivered_sequence = GREATEST(ordering_cursors.last_delivered_sequence, :sequence),
            updated_at = CURRENT_TIMESTAMP
        WHERE :sequence > ordering_cursors.last_delivered_sequence
        """, nativeQuery = true)
    void upsertCursor(@Param("endpointId") UUID endpointId, @Param("sequence") long sequence);
}
