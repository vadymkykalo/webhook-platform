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
}
