package com.webhook.platform.worker.domain.repository;

import com.webhook.platform.worker.domain.entity.Delivery;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface DeliveryRepository extends JpaRepository<Delivery, UUID> {
    
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

    @Query("SELECT d FROM Delivery d WHERE d.endpointId = :endpointId AND d.sequenceNumber = :sequenceNumber AND d.orderingEnabled = true")
    List<Delivery> findByEndpointIdAndSequenceNumber(
            @Param("endpointId") UUID endpointId,
            @Param("sequenceNumber") Long sequenceNumber
    );
}
