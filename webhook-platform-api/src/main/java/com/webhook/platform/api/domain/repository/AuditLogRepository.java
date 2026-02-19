package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {
    Page<AuditLog> findByOrganizationIdOrderByCreatedAtDesc(UUID organizationId, Pageable pageable);
}
