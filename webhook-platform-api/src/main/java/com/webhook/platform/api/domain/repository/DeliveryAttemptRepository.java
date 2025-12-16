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
    
    @Modifying
    @Query(value = "DELETE FROM delivery_attempts WHERE id IN (SELECT id FROM delivery_attempts WHERE created_at < :cutoffTime ORDER BY created_at ASC LIMIT :limit)", nativeQuery = true)
    int deleteOldAttempts(@Param("cutoffTime") Instant cutoffTime, @Param("limit") int limit);
}
