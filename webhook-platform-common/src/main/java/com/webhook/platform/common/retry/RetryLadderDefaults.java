package com.webhook.platform.common.retry;

/**
 * The retry ladder each direction gets when the customer does not choose one.
 *
 * <p><b>These are the single declaration.</b> Before this class the same two ladders were
 * written out as string literals in thirteen places across the api and worker modules, plus
 * two Flyway column defaults, plus a pair of environment variables — and they had already
 * drifted: the worker's outgoing fallback carried six tiers while its incoming fallback
 * carried five, so the two directions disagreed with each other about a value neither of
 * them was supposed to be deciding.
 *
 * <h2>Why the two directions differ, deliberately</h2>
 *
 * <p>They are not a drift and must not be "fixed" into agreement. Outgoing carries the
 * customer's own event to an endpoint they registered, and holding it for a day is a
 * reasonable thing to promise. Incoming relays somebody else's webhook onward, where a
 * shorter, more decisive give-up is the better promise. The split is stated identically in
 * the Flyway column defaults, in the api services that create the rows, and here.
 *
 * <p>{@code SchemaRetryLadderDefaultsTest} asserts the Flyway defaults still agree with the
 * constants below, so the two cannot drift apart again in silence.
 */
public final class RetryLadderDefaults {

    /** Outgoing: 1m, 5m, 15m, 1h, 6h, 24h. */
    public static final String OUTGOING_DELAYS = "60,300,900,3600,21600,86400";

    public static final int OUTGOING_MAX_ATTEMPTS = 7;

    /** Incoming: 1m, 5m, 15m, 1h, 6h. */
    public static final String INCOMING_DELAYS = "60,300,900,3600,21600";

    public static final int INCOMING_MAX_ATTEMPTS = 5;

    private RetryLadderDefaults() {
    }

    public static RetryLadder outgoing() {
        return RetryLadder.parse(OUTGOING_DELAYS, OUTGOING_MAX_ATTEMPTS);
    }

    public static RetryLadder incoming() {
        return RetryLadder.parse(INCOMING_DELAYS, INCOMING_MAX_ATTEMPTS);
    }
}
