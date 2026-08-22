package com.webhook.platform.worker.service;

import java.util.concurrent.ThreadLocalRandom;

/**
 * Attempt-level policy that is not the retry ladder: which HTTP statuses are worth another
 * attempt, and how long to wait when an attempt is deferred rather than made.
 *
 * <p>The ladder itself — parsing, tier clamping, jitter, exhaustion and the hard-cap fit —
 * now lives in {@link com.webhook.platform.common.retry.RetryLadder}, shared with the api
 * module so a ladder can be rejected where it is written. Nothing here holds a default
 * ladder any more; both directions declare theirs once in
 * {@link com.webhook.platform.common.retry.RetryLadderDefaults}.
 */
final class RetryPolicy {

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
     * Backoff for a <em>deferral</em> — the attempt was never made because a rate limit,
     * concurrency cap or open circuit breaker turned it away — as opposed to the retry
     * ladder, which governs attempts that were made and failed.
     *
     * <p>Exponential, {@code base * 2^attempt} capped at {@code maxSeconds}, with ±25%
     * jitter.
     *
     * <p>Both directions now share this. The incoming pipeline previously had its own
     * copy that shifted to {@code 1<<6} instead of {@code 1<<10} and jittered 50%–150%
     * instead of ±25%, so an incoming forward turned away by a rate limit backed off on a
     * visibly different curve from an outgoing delivery turned away by the same kind of
     * limit. Nothing intended that; it was a copy that drifted.
     */
    static long backoffWithJitter(int attempt, long baseSeconds, long maxSeconds) {
        long delay = Math.min(baseSeconds * (1L << Math.min(attempt, 10)), maxSeconds);
        long jitter = (long) (delay * 0.25);
        return delay - jitter + ThreadLocalRandom.current().nextLong(2 * jitter + 1);
    }
}
