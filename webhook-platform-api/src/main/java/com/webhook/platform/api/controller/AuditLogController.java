package com.webhook.platform.api.controller;

import com.webhook.platform.api.domain.entity.AuditLog;
import com.webhook.platform.api.domain.entity.User;
import com.webhook.platform.api.domain.repository.AuditLogRepository;
import com.webhook.platform.api.domain.repository.UserRepository;
import com.webhook.platform.api.dto.AuditLogResponse;
import com.webhook.platform.api.security.AuthContext;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/audit-log")
public class AuditLogController {

    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;

    public AuditLogController(AuditLogRepository auditLogRepository, UserRepository userRepository) {
        this.auditLogRepository = auditLogRepository;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<Page<AuditLogResponse>> list(
            AuthContext auth,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        size = Math.min(size, 100);
        Page<AuditLog> raw = auditLogRepository.findByOrganizationIdOrderByCreatedAtDesc(
                auth.organizationId(), PageRequest.of(page, size));

        // Batch-resolve user emails for the page
        Set<UUID> userIds = raw.getContent().stream()
                .map(AuditLog::getUserId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        Map<UUID, String> emailMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getEmail));

        Page<AuditLogResponse> result = raw.map(entry -> AuditLogResponse.builder()
                .id(entry.getId())
                .action(entry.getAction())
                .resourceType(entry.getResourceType())
                .resourceId(entry.getResourceId())
                .userId(entry.getUserId())
                .userEmail(entry.getUserId() != null ? emailMap.get(entry.getUserId()) : null)
                .organizationId(entry.getOrganizationId())
                .status(entry.getStatus())
                .errorMessage(entry.getErrorMessage())
                .durationMs(entry.getDurationMs())
                .clientIp(entry.getClientIp())
                .createdAt(entry.getCreatedAt())
                .build());

        return ResponseEntity.ok(result);
    }
}
