package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.Endpoint;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface EndpointRepository extends JpaRepository<Endpoint, UUID> {
    List<Endpoint> findByProjectId(UUID projectId);
    Page<Endpoint> findByProjectIdAndDeletedAtIsNull(UUID projectId, Pageable pageable);
}
