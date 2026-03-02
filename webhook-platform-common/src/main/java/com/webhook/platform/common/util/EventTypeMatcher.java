package com.webhook.platform.common.util;

/**
 * Matches event types against subscription patterns.
 * <p>
 * Supported patterns:
 * <ul>
 *   <li>{@code order.completed} — exact match</li>
 *   <li>{@code order.*} — single-segment wildcard (matches {@code order.completed}, not {@code order.line.added})</li>
 *   <li>{@code order.**} — multi-segment wildcard (matches {@code order.completed} and {@code order.line.added})</li>
 *   <li>{@code *} — matches any single-segment event type</li>
 *   <li>{@code **} — catch-all, matches everything</li>
 * </ul>
 */
public final class EventTypeMatcher {

    private EventTypeMatcher() {
    }

    /**
     * Returns {@code true} if the concrete {@code eventType} matches the given {@code pattern}.
     *
     * @param pattern   subscription pattern (may contain {@code *} or {@code **})
     * @param eventType concrete event type being ingested (no wildcards)
     */
    public static boolean matches(String pattern, String eventType) {
        if (pattern == null || eventType == null) {
            return false;
        }
        if (pattern.equals(eventType)) {
            return true;
        }
        if (pattern.equals("**")) {
            return true;
        }

        String[] patternParts = pattern.split("\\.");
        String[] eventParts = eventType.split("\\.");

        return matchParts(patternParts, 0, eventParts, 0);
    }

    private static boolean matchParts(String[] pattern, int pi, String[] event, int ei) {
        while (pi < pattern.length && ei < event.length) {
            String seg = pattern[pi];
            if ("**".equals(seg)) {
                // ** at the end matches everything remaining
                if (pi == pattern.length - 1) {
                    return true;
                }
                // try matching ** against 0..N remaining event segments
                for (int skip = ei; skip <= event.length; skip++) {
                    if (matchParts(pattern, pi + 1, event, skip)) {
                        return true;
                    }
                }
                return false;
            } else if ("*".equals(seg)) {
                // single-segment wildcard — matches exactly one segment
                pi++;
                ei++;
            } else {
                if (!seg.equals(event[ei])) {
                    return false;
                }
                pi++;
                ei++;
            }
        }

        // skip trailing ** patterns
        while (pi < pattern.length && "**".equals(pattern[pi])) {
            pi++;
        }

        return pi == pattern.length && ei == event.length;
    }

    /**
     * Returns {@code true} if the pattern string contains wildcard characters.
     */
    public static boolean isWildcard(String pattern) {
        return pattern != null && pattern.contains("*");
    }

    /**
     * Validates that a pattern is syntactically correct.
     * Rules: segments separated by dots, each segment is lowercase alphanumeric/underscore, or {@code *}, or {@code **}.
     */
    public static boolean isValidPattern(String pattern) {
        if (pattern == null || pattern.isBlank()) {
            return false;
        }
        String[] parts = pattern.split("\\.");
        for (String part : parts) {
            if (part.isEmpty()) {
                return false;
            }
            if ("*".equals(part) || "**".equals(part)) {
                continue;
            }
            if (!part.matches("[a-z][a-z0-9_]*")) {
                return false;
            }
        }
        return true;
    }
}
