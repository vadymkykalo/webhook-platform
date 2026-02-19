package com.webhook.platform.api.audit;

import com.webhook.platform.api.domain.entity.AuditLog;
import com.webhook.platform.api.domain.repository.AuditLogRepository;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Aspect
@Component
@Slf4j
public class AuditLogAspect {

    private final AuditLogRepository auditLogRepository;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "audit-log-writer");
        t.setDaemon(true);
        return t;
    });

    public AuditLogAspect(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
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

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            userId = jwtAuth.getUserId();
            orgId = jwtAuth.getOrganizationId();
        }

        final UUID uid = userId;
        final UUID oid = orgId;

        try {
            Object result = joinPoint.proceed();
            int durationMs = (int) (System.currentTimeMillis() - start);

            executor.execute(() -> saveAuditLog(action, resourceType, resourceId, uid, oid, "SUCCESS", null, durationMs));
            return result;
        } catch (Throwable ex) {
            int durationMs = (int) (System.currentTimeMillis() - start);
            String errorMsg = ex.getMessage() != null ? ex.getMessage().substring(0, Math.min(ex.getMessage().length(), 500)) : null;

            executor.execute(() -> saveAuditLog(action, resourceType, resourceId, uid, oid, "FAILURE", errorMsg, durationMs));
            throw ex;
        }
    }

    public void saveAuditLog(String action, String resourceType, UUID resourceId,
                              UUID userId, UUID orgId, String status, String errorMessage, int durationMs) {
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

    private boolean isResourceIdParam(String name) {
        return name.equals("id") || name.endsWith("Id") || name.endsWith("ID");
    }
}
