package com.webhook.platform.api.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Validates that dangerous development defaults are not used in production.
 * In production mode (APP_ENV=production), placeholder secrets and unsafe settings
 * cause a startup failure to prevent accidental misconfigurations.
 *
 * Runs from {@link PostConstruct} (P0-14c) rather than {@code ApplicationReadyEvent}:
 * the latter fires after the embedded connector is already bound and serving traffic,
 * leaving a live window where an insecure config is reachable before the check throws.
 * {@link SecurityConfigValidator} already uses this pattern; this class now matches it.
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

    // The exact values .env.dist ships for each secret. A production deployment that
    // still has one of these means the operator copied .env.dist -> .env and never
    // rotated the secret (P0-14c) -- a fixed substring denylist alone lets values like
    // "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" through, so this is checked in addition to it.
    private static final Map<String, String> SHIPPED_DEFAULTS = Map.ofEntries(
            Map.entry("JWT_SECRET", "dev_jwt_secret_key_32_chars_minimum"),
            Map.entry("WEBHOOK_ENCRYPTION_KEY", "dev_encryption_key_32_chars_min!"),
            Map.entry("WEBHOOK_ENCRYPTION_SALT", "dev_encryption_salt_16_chars"),
            Map.entry("DB_PASSWORD", "webhook_dev_pass_12345"),
            Map.entry("REDIS_PASSWORD", "webhook_redis_pass"),
            Map.entry("MINIO_ROOT_PASSWORD", "minio_dev_password_12345")
    );

    // Floor for the Shannon-entropy estimate (bits, frequency-based) of a secret value.
    // Chosen to comfortably clear any real generateSecureToken()/openssl-rand style
    // secret (which land well over 100 bits) while rejecting repeated characters,
    // short dictionary words, and other low-randomness placeholders.
    private static final double MIN_SECRET_ENTROPY_BITS = 40.0;

    @Value("${APP_ENV:development}")
    private String appEnv;

    @Value("${webhook.encryption-key}")
    private String encryptionKey;

    @Value("${webhook.encryption-salt}")
    private String encryptionSalt;

    @Value("${jwt.secret:#{null}}")
    private String jwtSecret;

    // Bound directly to the raw env vars rather than their Spring-mapped properties:
    // these are read purely to gate startup, so there's no need to introduce (or
    // depend on) an application.yml property for each one.
    @Value("${DB_PASSWORD:}")
    private String dbPassword;

    @Value("${REDIS_PASSWORD:}")
    private String redisPassword;

    // Not yet consumed by the app itself (MinIO integration is optional/future, see
    // .env.dist) but still validated per P0-14c so a shipped default doesn't sit
    // unnoticed in a production .env — see docker-compose.yml, which now forwards it
    // to the api container purely for this check.
    @Value("${MINIO_ROOT_PASSWORD:}")
    private String minioRootPassword;

    @Value("${cors.allowed-origins:}")
    private String corsAllowedOrigins;

    @Value("${webhook.url-validation.allow-private-ips:false}")
    private boolean allowPrivateIps;

    @Value("${swagger.enabled:true}")
    private boolean swaggerEnabled;

    @PostConstruct
    public void validateProductionConfig() {
        if (!"production".equalsIgnoreCase(appEnv)) {
            log.info("APP_ENV={} — skipping production safety checks", appEnv);
            return;
        }

        log.info("APP_ENV=production — running production safety checks...");
        List<String> violations = new ArrayList<>();

        validateSecret(violations, "WEBHOOK_ENCRYPTION_KEY", "WEBHOOK_ENCRYPTION_KEY", encryptionKey);
        validateSecret(violations, "WEBHOOK_ENCRYPTION_SALT", "WEBHOOK_ENCRYPTION_SALT", encryptionSalt);
        validateSecret(violations, "JWT_SECRET", "JWT_SECRET", jwtSecret);
        // The app authenticates to Postgres with DB_PASSWORD; POSTGRES_PASSWORD (which sets
        // the DB's own bootstrap password in docker-compose) isn't forwarded into the api
        // container at all. Both ship the same default in .env.dist, so validating the one
        // the app actually receives covers the case the task calls out without adding a new
        // secret to the api container's environment.
        validateSecret(violations, "POSTGRES_PASSWORD (checked via DB_PASSWORD)", "DB_PASSWORD", dbPassword);
        validateSecret(violations, "REDIS_PASSWORD", "REDIS_PASSWORD", redisPassword);
        validateSecret(violations, "MINIO_ROOT_PASSWORD", "MINIO_ROOT_PASSWORD", minioRootPassword);

        if (allowPrivateIps) {
            violations.add("WEBHOOK_ALLOW_PRIVATE_IPS=true — must be false in production (SSRF risk)");
        }
        if (swaggerEnabled) {
            violations.add("SWAGGER_ENABLED=true — should be false in production (info disclosure)");
        }
        if (corsAllowedOrigins != null && !corsAllowedOrigins.isBlank()) {
            String lower = corsAllowedOrigins.toLowerCase();
            if (lower.contains("localhost") || lower.contains("127.0.0.1")) {
                violations.add("CORS_ALLOWED_ORIGINS still references localhost/127.0.0.1 ("
                        + corsAllowedOrigins + ") — set it to your real origin(s) for production");
            }
        }

        if (!violations.isEmpty()) {
            String message = "PRODUCTION SAFETY CHECK FAILED:\n  - " + String.join("\n  - ", violations);
            log.error(message);
            throw new IllegalStateException(message);
        }

        log.info("Production safety checks passed");
    }

    /**
     * Rejects a secret if it's blank (nothing to check — a required var missing
     * entirely is already enforced by docker-compose's {@code ${VAR:?must be set}}
     * guard before the JVM even starts), a known placeholder substring, exactly the
     * value shipped in {@code .env.dist}, or below the entropy floor.
     *
     * @param displayName name used in the violation message (may differ from
     *                     {@code shippedDefaultsKey} when the checked variable is an
     *                     alias for the one .env.dist documents)
     * @param shippedDefaultsKey key into {@link #SHIPPED_DEFAULTS}
     */
    private void validateSecret(List<String> violations, String displayName, String shippedDefaultsKey, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        if (isPlaceholder(value)) {
            violations.add(displayName + " is a placeholder/dev default — must be changed for production");
            return;
        }
        String shippedDefault = SHIPPED_DEFAULTS.get(shippedDefaultsKey);
        if (shippedDefault != null && shippedDefault.equals(value)) {
            violations.add(displayName + " is unchanged from the .env.dist shipped default — must be changed for production");
            return;
        }
        double entropyBits = estimateEntropyBits(value);
        if (entropyBits < MIN_SECRET_ENTROPY_BITS) {
            violations.add(String.format(java.util.Locale.ROOT,
                    "%s has too little entropy (~%.1f bits) to be a real secret — must be changed for production",
                    displayName, entropyBits));
        }
    }

    private boolean isPlaceholder(String value) {
        if (value == null || value.isBlank()) {
            return true;
        }
        String lower = value.toLowerCase().trim();
        return PLACEHOLDER_SECRETS.stream().anyMatch(lower::contains);
    }

    /**
     * Frequency-based Shannon entropy of the value, in total bits (per-character
     * entropy times length). Not a substitute for a real randomness source, but
     * enough to reject repeated characters, short/simple values, and other
     * obviously-not-random placeholders.
     */
    private static double estimateEntropyBits(String value) {
        Map<Character, Integer> frequency = new HashMap<>();
        for (char c : value.toCharArray()) {
            frequency.merge(c, 1, Integer::sum);
        }
        int length = value.length();
        double bitsPerChar = 0.0;
        for (int count : frequency.values()) {
            double p = (double) count / length;
            bitsPerChar -= p * (Math.log(p) / Math.log(2));
        }
        return bitsPerChar * length;
    }
}
