package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.Event;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EventRepository extends JpaRepository<Event, UUID> {
    Optional<Event> findByProjectIdAndIdempotencyKey(UUID projectId, String idempotencyKey);
    List<Event> findByProjectId(UUID projectId);
    Page<Event> findByProjectId(UUID projectId, Pageable pageable);
}
