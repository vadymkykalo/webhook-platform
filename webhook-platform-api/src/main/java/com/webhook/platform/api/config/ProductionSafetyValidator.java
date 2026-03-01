package com.webhook.platform.api.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Validates that dangerous development defaults are not used in production.
 * In production mode (APP_ENV=production), placeholder secrets and unsafe settings
 * cause a startup failure to prevent accidental misconfigurations.
 */
@Component
@Slf4j
public class ProductionSafetyValidator {

    private static final Set<String> PLACEHOLDER_SECRETS = Set.of(
            "dev_encryption_key_32_chars_min",
            "dev_encryption_salt_16_chars",
            "dev_jwt_secret_key_32_chars_minimum",
            "development_master_key_32_chars",
            "changeme",
            "secret",
            "password"
    );

    @Value("${APP_ENV:development}")
    private String appEnv;

    @Value("${webhook.encryption-key}")
    private String encryptionKey;

    @Value("${webhook.encryption-salt}")
    private String encryptionSalt;

    @Value("${jwt.secret:#{null}}")
    private String jwtSecret;

    @Value("${webhook.url-validation.allow-private-ips:false}")
    private boolean allowPrivateIps;

    @Value("${swagger.enabled:true}")
    private boolean swaggerEnabled;

    @EventListener(ApplicationReadyEvent.class)
    public void validateProductionConfig() {
        if (!"production".equalsIgnoreCase(appEnv)) {
            log.info("APP_ENV={} — skipping production safety checks", appEnv);
            return;
        }

        log.info("APP_ENV=production — running production safety checks...");
        List<String> violations = new ArrayList<>();

        if (isPlaceholder(encryptionKey)) {
            violations.add("WEBHOOK_ENCRYPTION_KEY is a placeholder/dev default — must be changed for production");
        }
        if (isPlaceholder(encryptionSalt)) {
            violations.add("WEBHOOK_ENCRYPTION_SALT is a placeholder/dev default — must be changed for production");
        }
        if (jwtSecret != null && isPlaceholder(jwtSecret)) {
            violations.add("JWT_SECRET is a placeholder/dev default — must be changed for production");
        }
        if (allowPrivateIps) {
            violations.add("WEBHOOK_ALLOW_PRIVATE_IPS=true — must be false in production (SSRF risk)");
        }
        if (swaggerEnabled) {
            violations.add("SWAGGER_ENABLED=true — should be false in production (info disclosure)");
        }

        if (!violations.isEmpty()) {
            String message = "PRODUCTION SAFETY CHECK FAILED:\n  - " + String.join("\n  - ", violations);
            log.error(message);
            throw new IllegalStateException(message);
        }

        log.info("Production safety checks passed");
    }

    private boolean isPlaceholder(String value) {
        if (value == null || value.isBlank()) {
            return true;
        }
        String lower = value.toLowerCase().trim();
        return PLACEHOLDER_SECRETS.stream().anyMatch(p -> lower.contains(p));
    }
}
