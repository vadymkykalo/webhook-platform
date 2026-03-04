package com.webhook.platform.api.audit;

import com.webhook.platform.api.domain.entity.AuditLog;
import com.webhook.platform.api.domain.repository.AuditLogRepository;
import com.webhook.platform.api.security.ApiKeyAuthenticationToken;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Aspect
@Component
@Slf4j
public class AuditLogAspect {

    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "audit-log-writer");
        t.setDaemon(true);
        return t;
    });

    public AuditLogAspect(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
        this.objectMapper = new ObjectMapper()
                .disable(SerializationFeature.FAIL_ON_EMPTY_BEANS);
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
        try {
            if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    @Around("@annotation(auditable)")
    public Object audit(ProceedingJoinPoint joinPoint, Auditable auditable) throws Throwable {
        long start = System.currentTimeMillis();
        String action = auditable.action().name();
        String resourceType = resolveResourceType(auditable, joinPoint);
        UUID resourceId = extractResourceId(joinPoint);
        UUID userId = null;
        UUID orgId = null;
        String clientIp = resolveClientIp();
        String details = extractDetails(joinPoint);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            userId = jwtAuth.getUserId();
            orgId = jwtAuth.getOrganizationId();
        } else if (auth instanceof ApiKeyAuthenticationToken) {
            // API Key auth — resolve orgId from method args (organizationId parameter)
            orgId = extractOrganizationId(joinPoint);
        }

        // Fallback: if orgId is still null, try extracting from method args
        if (orgId == null) {
            orgId = extractOrganizationId(joinPoint);
        }

        final UUID uid = userId;
        final UUID oid = orgId;
        final String ip = clientIp;

        try {
            Object result = joinPoint.proceed();
            int durationMs = (int) (System.currentTimeMillis() - start);

            executor.execute(() -> saveAuditLog(action, resourceType, resourceId, uid, oid, "SUCCESS", null, durationMs, ip, details));
            return result;
        } catch (Throwable ex) {
            int durationMs = (int) (System.currentTimeMillis() - start);
            String errorMsg = ex.getMessage() != null ? ex.getMessage().substring(0, Math.min(ex.getMessage().length(), 500)) : null;

            executor.execute(() -> saveAuditLog(action, resourceType, resourceId, uid, oid, "FAILURE", errorMsg, durationMs, ip, details));
            throw ex;
        }
    }

    public void saveAuditLog(String action, String resourceType, UUID resourceId,
                              UUID userId, UUID orgId, String status, String errorMessage,
                              int durationMs, String clientIp, String details) {
        try {
            AuditLog entry = AuditLog.builder()
                    .action(action)
                    .resourceType(resourceType)
                    .resourceId(resourceId)
                    .userId(userId)
                    .organizationId(orgId)
                    .status(status)
                    .errorMessage(errorMessage)
                    .durationMs(durationMs)
                    .clientIp(clientIp)
                    .details(details)
                    .build();
            auditLogRepository.save(entry);
        } catch (Exception e) {
            log.warn("Failed to save audit log: {}", e.getMessage());
        }
    }

    private String resolveResourceType(Auditable auditable, ProceedingJoinPoint joinPoint) {
        if (!auditable.resourceType().isEmpty()) {
            return auditable.resourceType();
        }
        String className = joinPoint.getTarget().getClass().getSimpleName();
        return className.replace("Service", "");
    }

    private UUID extractResourceId(ProceedingJoinPoint joinPoint) {
        MethodSignature sig = (MethodSignature) joinPoint.getSignature();
        String[] names = sig.getParameterNames();
        Object[] args = joinPoint.getArgs();

        if (names != null) {
            for (int i = 0; i < names.length; i++) {
                if (args[i] instanceof UUID && isResourceIdParam(names[i])) {
                    return (UUID) args[i];
                }
            }
        }

        for (Object arg : args) {
            if (arg instanceof UUID) {
                return (UUID) arg;
            }
        }
        return null;
    }

    private UUID extractOrganizationId(ProceedingJoinPoint joinPoint) {
        MethodSignature sig = (MethodSignature) joinPoint.getSignature();
        String[] names = sig.getParameterNames();
        Object[] args = joinPoint.getArgs();

        if (names != null) {
            for (int i = 0; i < names.length; i++) {
                if (args[i] instanceof UUID && "organizationId".equals(names[i])) {
                    return (UUID) args[i];
                }
            }
        }
        return null;
    }

    private boolean isResourceIdParam(String name) {
        return name.equals("id") || name.endsWith("Id") || name.endsWith("ID");
    }

    private String extractDetails(ProceedingJoinPoint joinPoint) {
        try {
            MethodSignature sig = (MethodSignature) joinPoint.getSignature();
            String[] names = sig.getParameterNames();
            Object[] args = joinPoint.getArgs();
            if (names == null) return null;

            Map<String, Object> details = new LinkedHashMap<>();
            for (int i = 0; i < names.length; i++) {
                if (args[i] == null) continue;
                // Skip UUID params (already captured as resourceId/orgId) and primitives
                if (args[i] instanceof UUID) continue;
                if (args[i] instanceof String || args[i] instanceof Number || args[i] instanceof Boolean) continue;
                if (args[i] instanceof Enum) continue;
                // Capture request DTOs
                String className = args[i].getClass().getSimpleName();
                if (className.endsWith("Request") || className.endsWith("Role")) {
                    details.put(names[i], args[i]);
                }
            }
            if (details.isEmpty()) return null;
            String json = objectMapper.writeValueAsString(details);
            // Limit to 2000 chars
            return json.length() > 2000 ? json.substring(0, 2000) : json;
        } catch (Exception e) {
            return null;
        }
    }

    private String resolveClientIp() {
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) return null;
            HttpServletRequest request = attrs.getRequest();
            String xff = request.getHeader("X-Forwarded-For");
            if (xff != null && !xff.isBlank()) {
                return xff.split(",")[0].trim();
            }
            return request.getRemoteAddr();
        } catch (Exception e) {
            return null;
        }
    }
}
