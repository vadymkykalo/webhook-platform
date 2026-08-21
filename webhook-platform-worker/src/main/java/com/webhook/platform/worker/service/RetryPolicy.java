package com.webhook.platform.worker.service;

import lombok.extern.slf4j.Slf4j;

import java.time.Instant;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Pure, side-effect-free retry/backoff math used by {@link WebhookDeliveryService}.
 * Pulled out of that class so the arithmetic — status-code retryability, delay
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

    /**
     * Upper bound (worst case) on the total time a delivery can spend retrying before the
     * ladder is exhausted: every tier hit at the top of {@link #calculateNextRetry}'s full-jitter
     * range (1.5x base delay), summed across {@code maxAttempts} attempts with the same
     * last-tier clamp {@code calculateNextRetry} uses for attempts beyond the ladder's length.
     *
     * <p>Used at startup to check the retry ladder actually fits inside
     * {@code delivery.escalation.hard-cap-hours} — StaleDeliveryEscalationService escalates
     * any PENDING delivery older than that cap straight to DLQ regardless of attempt count, so
     * if the ladder's worst case exceeds the cap, the last tiers can never fire.
     */
    static long worstCaseSpanSeconds(long[] delays, int maxAttempts) {
        long total = 0;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            int index = Math.min(attempt - 1, delays.length - 1);
            total += Math.round(delays[index] * 1.5);
        }
        return total;
    }

    /**
     * Fails fast if the given retry ladder's worst-case span doesn't fit inside the given
     * hard-cap (both in seconds). See {@link #worstCaseSpanSeconds}.
     */
    static void validateLadderFitsCap(String retryDelaysStr, int maxAttempts, long hardCapSeconds) {
        long[] delays = parseRetryDelays(retryDelaysStr);
        long worstCase = worstCaseSpanSeconds(delays, maxAttempts);
        if (worstCase > hardCapSeconds) {
            throw new IllegalStateException(String.format(
                    "Retry ladder/escalation cap mismatch: the default retry ladder [%s] over %d attempts " +
                    "has a worst-case span of %ds (%.1fh), which exceeds delivery.escalation.hard-cap-hours " +
                    "of %ds (%.1fh). At that cap, later retry tiers would never fire before the delivery is " +
                    "escalated to DLQ. Either shorten retry.ladder.default-delays-seconds / " +
                    "retry.ladder.default-max-attempts, or raise delivery.escalation.hard-cap-hours, so the " +
                    "two agree.",
                    retryDelaysStr, maxAttempts, worstCase, worstCase / 3600.0, hardCapSeconds, hardCapSeconds / 3600.0));
        }
    }
}
