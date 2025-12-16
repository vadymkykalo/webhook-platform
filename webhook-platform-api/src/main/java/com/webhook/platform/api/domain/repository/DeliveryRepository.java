package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.Delivery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface DeliveryRepository extends JpaRepository<Delivery, UUID> {
    Page<Delivery> findByEventId(UUID eventId, Pageable pageable);
    Page<Delivery> findByEventIdIn(List<UUID> eventIds, Pageable pageable);
}
