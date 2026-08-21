package com.webhook.platform.worker.service;

import lombok.extern.slf4j.Slf4j;

import java.time.Instant;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Pure, side-effect-free retry/backoff math used by {@link WebhookDeliveryService}.
 * Pulled out of that class (P1-22) so the arithmetic — status-code retryability, delay
 * parsing, jitter, and the last-tier clamp — can be unit tested without standing up any
 * of WebhookDeliveryService's 18 collaborators.
 *
 * <p>Behaviour-preserving extraction: every method here is a verbatim copy of what used
 * to be a private method on WebhookDeliveryService.
 */
@Slf4j
final class RetryPolicy {

    static final long[] DEFAULT_RETRY_DELAYS = { 60, 300, 900, 3600, 21600, 86400 };

    private RetryPolicy() {
    }

    /**
     * HTTP status codes that are worth retrying: request timeout, rate-limited, and any
     * 5xx server error.
     */
    static boolean isRetryable(int statusCode) {
        return statusCode == 408 || statusCode == 429 || (statusCode >= 500 && statusCode < 600);
    }

    /**
     * Parses a comma-separated retry-delay ladder (seconds). Falls back to
     * {@link #DEFAULT_RETRY_DELAYS} when the input is null/empty or malformed.
     */
    static long[] parseRetryDelays(String retryDelaysStr) {
        if (retryDelaysStr == null || retryDelaysStr.isEmpty()) {
            return DEFAULT_RETRY_DELAYS;
        }
        try {
            String[] parts = retryDelaysStr.split(",");
            long[] delays = new long[parts.length];
            for (int i = 0; i < parts.length; i++) {
                delays[i] = Long.parseLong(parts[i].trim());
            }
            return delays;
        } catch (NumberFormatException e) {
            log.warn("Invalid retry delays format: {}, using defaults", retryDelaysStr);
            return DEFAULT_RETRY_DELAYS;
        }
    }

    /**
     * Next retry instant for the given (1-indexed) attempt count, applying the parsed
     * delay ladder with the clamp at the last tier for attempts beyond the ladder's
     * length, then full jitter (50%-150% of the base delay).
     */
    static Instant calculateNextRetry(int attemptCount, String retryDelaysStr) {
        long[] delays = parseRetryDelays(retryDelaysStr);
        int index = Math.min(attemptCount - 1, delays.length - 1);
        long baseDelay = delays[index];
        // Full jitter: 50%-150% of base delay to prevent thundering herd
        double jitterMultiplier = 0.5 + ThreadLocalRandom.current().nextDouble(1.0);
        long jitteredDelay = (long) (baseDelay * jitterMultiplier);
        return Instant.now().plusSeconds(jitteredDelay);
    }

    /**
     * Exponential backoff with +/-25% jitter.
     * base * 2^attempt capped at maxSeconds.
     */
    static long backoffWithJitter(int attempt, long baseSeconds, long maxSeconds) {
        long delay = Math.min(baseSeconds * (1L << Math.min(attempt, 10)), maxSeconds);
        long jitter = (long) (delay * 0.25);
        return delay - jitter + ThreadLocalRandom.current().nextLong(2 * jitter + 1);
    }
}
