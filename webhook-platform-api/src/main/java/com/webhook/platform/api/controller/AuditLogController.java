package com.webhook.platform.api.controller;

import com.webhook.platform.api.domain.entity.AuditLog;
import com.webhook.platform.api.domain.repository.AuditLogRepository;
import com.webhook.platform.api.security.AuthContext;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/audit-log")
public class AuditLogController {

    private final AuditLogRepository auditLogRepository;

    public AuditLogController(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @GetMapping
    public ResponseEntity<Page<AuditLog>> list(
            AuthContext auth,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        size = Math.min(size, 100);
        Page<AuditLog> result = auditLogRepository.findByOrganizationIdOrderByCreatedAtDesc(
                auth.organizationId(), PageRequest.of(page, size));
        return ResponseEntity.ok(result);
    }
}
