package com.webhook.platform.api.controller;

import com.webhook.platform.api.audit.AuditLogSpecification;
import com.webhook.platform.api.domain.entity.AuditLog;
import com.webhook.platform.api.domain.entity.User;
import com.webhook.platform.api.domain.repository.AuditLogRepository;
import com.webhook.platform.api.domain.repository.UserRepository;
import com.webhook.platform.api.dto.AuditLogResponse;
import com.webhook.platform.api.security.AuthContext;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.PrintWriter;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
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
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String resourceType,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        size = Math.min(size, 100);

        Specification<AuditLog> spec = AuditLogSpecification.filter(
                auth.organizationId(), action, status, resourceType,
                parseDate(from, false), parseDate(to, true));

        Page<AuditLog> raw = auditLogRepository.findAll(spec, PageRequest.of(page, size));
        Map<UUID, String> emailMap = resolveEmails(raw.getContent());

        Page<AuditLogResponse> result = raw.map(entry -> toResponse(entry, emailMap));
        return ResponseEntity.ok(result);
    }

    @GetMapping("/export")
    public void exportCsv(
            AuthContext auth,
            HttpServletResponse response,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String resourceType,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) throws Exception {

        response.setContentType("text/csv");
        response.setHeader("Content-Disposition",
                "attachment; filename=audit-log-" + LocalDate.now() + ".csv");

        Specification<AuditLog> spec = AuditLogSpecification.filter(
                auth.organizationId(), action, status, resourceType,
                parseDate(from, false), parseDate(to, true));

        // Stream in batches to avoid OOM
        int batchSize = 500;
        int pageNum = 0;
        long totalExported = 0;

        PrintWriter writer = response.getWriter();
        writer.println("Time,Action,Resource Type,Resource ID,User,Status,Duration (ms),IP,Error");

        while (true) {
            Page<AuditLog> batch = auditLogRepository.findAll(spec, PageRequest.of(pageNum, batchSize));
            if (batch.isEmpty()) break;

            Map<UUID, String> emailMap = resolveEmails(batch.getContent());

            for (AuditLog entry : batch.getContent()) {
                String email = entry.getUserId() != null ? emailMap.getOrDefault(entry.getUserId(), "") : "";
                writer.printf("\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",\"%s\"%n",
                        entry.getCreatedAt(),
                        entry.getAction(),
                        entry.getResourceType(),
                        entry.getResourceId() != null ? entry.getResourceId() : "",
                        email,
                        entry.getStatus(),
                        entry.getDurationMs() != null ? entry.getDurationMs() : "",
                        entry.getClientIp() != null ? entry.getClientIp() : "",
                        escapeCsv(entry.getErrorMessage()));
            }

            totalExported += batch.getNumberOfElements();
            if (!batch.hasNext()) break;
            pageNum++;
        }

        writer.flush();
    }

    private AuditLogResponse toResponse(AuditLog entry, Map<UUID, String> emailMap) {
        return AuditLogResponse.builder()
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
                .details(entry.getDetails())
                .createdAt(entry.getCreatedAt())
                .build();
    }

    private Map<UUID, String> resolveEmails(List<AuditLog> entries) {
        Set<UUID> userIds = entries.stream()
                .map(AuditLog::getUserId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        return userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getEmail));
    }

    private Instant parseDate(String dateStr, boolean endOfDay) {
        if (dateStr == null || dateStr.isBlank()) return null;
        try {
            LocalDate date = LocalDate.parse(dateStr);
            return endOfDay
                    ? date.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)
                    : date.atStartOfDay().toInstant(ZoneOffset.UTC);
        } catch (Exception e) {
            return null;
        }
    }

    private String escapeCsv(String value) {
        if (value == null) return "";
        return value.replace("\"", "\"\"");
    }
}
