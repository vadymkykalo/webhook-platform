package com.webhook.platform.common.security;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Whether an endpoint's retired signing secret is still worth signing with.
 *
 * <p>A rotation opens a window: for {@code graceHours} after {@code rotatedAt} the worker
 * signs each delivery with both the new secret and the one being retired, so a receiver who
 * has not deployed the new one yet keeps verifying. Outside the window only the current
 * secret is used.
 *
 * <p>It is a function of a timestamp rather than a method on the entity because there are two
 * {@code Endpoint} entities — one in {@code api}, one in {@code worker} — and a rule about
 * when a signature stops being valid is not something to keep two copies of. Taking
 * {@code now} as an argument is what makes the boundary testable without waiting a day.
 */
public final class SecretRotationWindow {

    private SecretRotationWindow() {
    }

    /**
     * @param rotatedAt  when the secret was rotated, or {@code null} if it never was
     * @param graceHours the endpoint's grace period; {@code null} or non-positive closes the
     *                   window immediately, which is how an endpoint opts out of dual-signing
     * @param now        the current instant
     */
    public static boolean isOpen(Instant rotatedAt, Integer graceHours, Instant now) {
        if (rotatedAt == null || graceHours == null || graceHours <= 0) {
            return false;
        }
        // Inclusive of the boundary instant: at exactly rotatedAt + graceHours the window is
        // still open. A receiver reading "24 hours" has until the end of the 24th hour, and
        // erring toward one extra signature is the harmless direction of this comparison.
        return !now.isAfter(rotatedAt.plus(graceHours, ChronoUnit.HOURS));
    }
}
