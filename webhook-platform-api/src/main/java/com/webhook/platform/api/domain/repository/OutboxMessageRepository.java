package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.enums.OutboxStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface OutboxMessageRepository extends JpaRepository<OutboxMessage, UUID> {
    @Query("SELECT o FROM OutboxMessage o WHERE o.status = :status ORDER BY o.createdAt ASC")
    List<OutboxMessage> findByStatusOrderByCreatedAtAsc(OutboxStatus status);
}
