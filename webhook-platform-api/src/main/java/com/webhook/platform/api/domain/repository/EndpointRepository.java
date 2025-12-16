package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.Endpoint;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface EndpointRepository extends JpaRepository<Endpoint, UUID> {
    java.util.List<Endpoint> findByProjectId(UUID projectId);
}
