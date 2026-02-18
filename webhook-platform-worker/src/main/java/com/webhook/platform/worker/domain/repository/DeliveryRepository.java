package com.webhook.platform.worker.domain.repository;

import com.webhook.platform.worker.domain.entity.Delivery;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
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
    @Query("UPDATE Delivery d SET d.status = 'PENDING', " +
           "d.nextRetryAt = CURRENT_TIMESTAMP, " +
           "d.attemptCount = CASE WHEN d.attemptCount > 0 THEN d.attemptCount - 1 ELSE 0 END " +
           "WHERE d.status = 'PROCESSING' AND d.lastAttemptAt < :threshold")
    int resetStuckDeliveries(@Param("threshold") Instant threshold);
    
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(value = "SELECT d FROM Delivery d WHERE d.status = :status AND d.nextRetryAt IS NOT NULL AND d.nextRetryAt <= :now ORDER BY d.nextRetryAt ASC")
    List<Delivery> findPendingRetriesForUpdate(
            @Param("status") Delivery.DeliveryStatus status,
            @Param("now") Instant now,
            Pageable pageable
    );

    @Query("SELECT MIN(d.createdAt) FROM Delivery d WHERE d.endpointId = :endpointId AND d.sequenceNumber = :sequenceNumber AND d.status IN ('PENDING', 'PROCESSING')")
    Instant findOldestPendingCreatedAt(
            @Param("endpointId") UUID endpointId,
            @Param("sequenceNumber") Long sequenceNumber
    );
}
