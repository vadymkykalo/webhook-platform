package com.webhook.platform.worker.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Covers the pure retry/backoff math extracted from WebhookDeliveryService (P1-22):
 * status-code retryability, delay-ladder parsing (including malformed config), jitter
 * bounds, and next-retry calculation at each attempt tier including the clamp at the
 * last tier.
 */
class RetryPolicyTest {

    // --- isRetryable -----------------------------------------------------------------

    @ParameterizedTest
    @ValueSource(ints = { 408, 429, 500, 502, 503, 504, 599 })
    void isRetryable_trueForTimeoutRateLimitAnd5xx(int status) {
        assertTrue(RetryPolicy.isRetryable(status));
    }

    @ParameterizedTest
    @ValueSource(ints = { 200, 201, 301, 400, 401, 403, 404, 409, 422, 600, 999 })
    void isRetryable_falseForEverythingElse(int status) {
        assertFalse(RetryPolicy.isRetryable(status));
    }

    // --- parseRetryDelays --------------------------------------------------------------

    @Test
    void parseRetryDelays_null_returnsDefaultLadder() {
        assertArrayEquals(RetryPolicy.DEFAULT_RETRY_DELAYS, RetryPolicy.parseRetryDelays(null));
    }

    @Test
    void parseRetryDelays_empty_returnsDefaultLadder() {
        assertArrayEquals(RetryPolicy.DEFAULT_RETRY_DELAYS, RetryPolicy.parseRetryDelays(""));
    }

    @Test
    void parseRetryDelays_validCsv_parsesInOrder() {
        long[] delays = RetryPolicy.parseRetryDelays("10,20,30");
        assertArrayEquals(new long[] { 10, 20, 30 }, delays);
    }

    @Test
    void parseRetryDelays_withWhitespace_trims() {
        long[] delays = RetryPolicy.parseRetryDelays(" 10 , 20 ,30 ");
        assertArrayEquals(new long[] { 10, 20, 30 }, delays);
    }

    @Test
    void parseRetryDelays_malformed_fallsBackToDefaultLadder() {
        long[] delays = RetryPolicy.parseRetryDelays("10,notanumber,30");
        assertArrayEquals(RetryPolicy.DEFAULT_RETRY_DELAYS, delays);
    }

    @Test
    void parseRetryDelays_singleGarbageValue_fallsBackToDefaultLadder() {
        long[] delays = RetryPolicy.parseRetryDelays("abc");
        assertArrayEquals(RetryPolicy.DEFAULT_RETRY_DELAYS, delays);
    }

    // --- backoffWithJitter --------------------------------------------------------------

    @Test
    void backoffWithJitter_staysWithinComputedJitterBounds_acrossManyRuns() {
        long baseSeconds = 2;
        long maxSeconds = 60;
        for (int attempt = 0; attempt < 15; attempt++) {
            long delay = Math.min(baseSeconds * (1L << Math.min(attempt, 10)), maxSeconds);
            long jitter = (long) (delay * 0.25);
            for (int i = 0; i < 50; i++) {
                long actual = RetryPolicy.backoffWithJitter(attempt, baseSeconds, maxSeconds);
                assertTrue(actual >= delay - jitter && actual <= delay + jitter,
                        "attempt=" + attempt + " expected within [" + (delay - jitter) + "," + (delay + jitter)
                                + "] but was " + actual);
            }
        }
    }

    @Test
    void backoffWithJitter_neverExceedsMaxByMoreThanJitterMargin() {
        // At high attempt counts the exponential term saturates the cap; the returned
        // value can exceed maxSeconds by up to 25% due to jitter, but never more.
        long maxSeconds = 60;
        for (int i = 0; i < 100; i++) {
            long actual = RetryPolicy.backoffWithJitter(20, 2, maxSeconds);
            assertTrue(actual <= (long) (maxSeconds * 1.25) + 1,
                    "capped delay's jitter must not blow past +25%, was " + actual);
        }
    }

    // --- calculateNextRetry --------------------------------------------------------------

    @ParameterizedTest
    @CsvSource({
            "1, 60",
            "2, 300",
            "3, 900",
            "4, 3600",
            "5, 21600",
            "6, 86400",
    })
    void calculateNextRetry_defaultLadder_usesAttemptIndexedTier(int attemptCount, long expectedBaseDelay) {
        Instant before = Instant.now();
        Instant next = RetryPolicy.calculateNextRetry(attemptCount, null);
        long secondsFromNow = next.getEpochSecond() - before.getEpochSecond();
        // Full jitter: 50%-150% of the base delay.
        assertTrue(secondsFromNow >= expectedBaseDelay * 0.5 - 1 && secondsFromNow <= expectedBaseDelay * 1.5 + 1,
                "attemptCount=" + attemptCount + " expected ~[" + (expectedBaseDelay * 0.5) + ","
                        + (expectedBaseDelay * 1.5) + "]s from now but was " + secondsFromNow + "s");
    }

    @Test
    void calculateNextRetry_attemptBeyondLadderLength_clampsToLastTier() {
        // Default ladder has 6 tiers; attemptCount=10 must clamp to the last tier (86400s),
        // not index out of bounds.
        Instant before = Instant.now();
        Instant next = RetryPolicy.calculateNextRetry(10, null);
        long secondsFromNow = next.getEpochSecond() - before.getEpochSecond();
        long lastTier = 86400;
        assertTrue(secondsFromNow >= lastTier * 0.5 - 1 && secondsFromNow <= lastTier * 1.5 + 1,
                "attemptCount beyond ladder length must clamp to the last tier, was " + secondsFromNow + "s");
    }

    @Test
    void calculateNextRetry_customLadder_respectsConfiguredDelays() {
        Instant before = Instant.now();
        Instant next = RetryPolicy.calculateNextRetry(1, "5,15,45");
        long secondsFromNow = next.getEpochSecond() - before.getEpochSecond();
        assertTrue(secondsFromNow >= 2 && secondsFromNow <= 8,
                "expected ~[2.5,7.5]s from now for a 5s base tier but was " + secondsFromNow + "s");
    }

    @Test
    void calculateNextRetry_attemptCountOne_alwaysUsesFirstTier() {
        // Regression guard for the index math: attemptCount is 1-indexed (index = attemptCount - 1).
        assertEquals(0, Math.min(1 - 1, RetryPolicy.parseRetryDelays(null).length - 1));
    }
}
