package com.webhook.platform.api.controller;

import com.webhook.platform.api.domain.entity.AuditLog;
import com.webhook.platform.api.domain.repository.AuditLogRepository;
import com.webhook.platform.api.exception.UnauthorizedException;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
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
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        if (!(authentication instanceof JwtAuthenticationToken)) {
            throw new UnauthorizedException("Authentication required");
        }
        JwtAuthenticationToken jwtAuth = (JwtAuthenticationToken) authentication;
        size = Math.min(size, 100);
        Page<AuditLog> result = auditLogRepository.findByOrganizationIdOrderByCreatedAtDesc(
                jwtAuth.getOrganizationId(), PageRequest.of(page, size));
        return ResponseEntity.ok(result);
    }
}
