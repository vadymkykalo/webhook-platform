package com.webhook.platform.api.tenancy;

import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.function.Supplier;

/**
 * The organization whose rows the current thread is allowed to see.
 *
 * <p>ADR-0006 moved three of the four authorization questions from an opt-in call to something
 * a handler cannot omit. This type is how the fourth one — "is this row inside the caller's
 * organization?" — stops being a parameter threaded through ~186 service signatures and becomes
 * a property of data access: {@link OrganizationTenantResolver} reads this on every session and
 * Hibernate adds the {@code organization_id} predicate itself.
 *
 * <h2>Three states, and why none of them is a default</h2>
 *
 * <ul>
 *   <li><b>A tenant</b> — set by {@code TenantContextFilter} from the authenticated request, or
 *       by {@link #runAs} on a public path that discovered its tenant from a token or slug.</li>
 *   <li><b>{@link #SYSTEM}</b> — entered explicitly by {@link #runAsSystem} / {@link #callAsSystem}.
 *       The resolver reports it as Hibernate's <em>root</em> tenant, for which no predicate is
 *       added at all, so a system path really does see every organization.</li>
 *   <li><b>Unset</b> — a hard failure. {@link OrganizationTenantResolver} throws rather than
 *       guessing, because the two plausible guesses are both wrong: filtering on a sentinel would
 *       silently return zero rows to a background job, and filtering on nothing would silently
 *       reopen the hole this exists to close.</li>
 * </ul>
 *
 * <p>Scopes nest and restore, so entering system scope inside a request and leaving it puts the
 * request's own tenant back. That nesting is what lets authentication itself work: resolving an
 * API key reads {@code api_keys} and {@code projects}, both tenant-scoped tables, before any
 * tenant is known.
 */
public final class TenantContext {

    /**
     * Hibernate's <em>root</em> tenant: sessions opened under it get no tenant predicate.
     *
     * <p>The value is arbitrary and never compared against a real {@code organization_id} — the
     * resolver's {@code isRoot} intercepts it before Hibernate builds a predicate from it. It is
     * the nil UUID so that a value which somehow reached a query would match nothing rather than
     * matching some real organization.
     */
    public static final UUID SYSTEM = new UUID(0L, 0L);

    private static final ThreadLocal<UUID> CURRENT = new ThreadLocal<>();


    private TenantContext() {
    }

    /** The current tenant, or {@code null} when none has been entered. */
    public static UUID current() {
        return CURRENT.get();
    }

    /**
     * The current tenant, or a failure if none has been entered.
     *
     * <p>For the handful of places that need the organization as a <em>value</em> rather than as
     * an ambient filter — chiefly native queries, which Hibernate's discriminator does not reach.
     * Prefer letting the filter do the work; reach for this only where it cannot.
     */
    public static UUID require() {
        UUID tenant = CURRENT.get();
        if (tenant == null) {
            throw new TenantNotResolvedException(
                    "No tenant scope on this thread, and this code needs the organization as a value. "
                            + "See TenantContext for how each kind of caller enters a scope.");
        }
        return tenant;
    }

    /** True while the current thread is inside {@link #runAsSystem} or {@link #callAsSystem}. */
    public static boolean isSystem() {
        return SYSTEM.equals(CURRENT.get());
    }

    /**
     * Sets the tenant for the rest of the thread's work, returning what was there before.
     *
     * <p>Prefer {@link #runAs}; this exists for the servlet filter, whose set and clear are on
     * either side of {@code filterChain.doFilter}.
     */
    public static UUID set(UUID organizationId) {
        UUID previous = CURRENT.get();
        CURRENT.set(organizationId);
        return previous;
    }

    /** Restores a previous tenant, clearing the context when {@code previous} is null. */
    public static void restore(UUID previous) {
        if (previous == null) {
            CURRENT.remove();
        } else {
            CURRENT.set(previous);
        }
    }

    public static void clear() {
        CURRENT.remove();
    }

    /** Runs {@code body} confined to one organization, restoring the previous scope afterwards. */
    public static void runAs(UUID organizationId, Runnable body) {
        callAs(organizationId, () -> {
            body.run();
            return null;
        });
    }

    /** Calls {@code body} confined to one organization, restoring the previous scope afterwards. */
    public static <T> T callAs(UUID organizationId, Supplier<T> body) {
        if (organizationId == null) {
            throw new IllegalArgumentException("Cannot enter a null tenant scope; use runAsSystem for system work");
        }
        UUID previous = set(organizationId);
        try {
            return body.get();
        } finally {
            restore(previous);
        }
    }

    /**
     * Runs {@code body} across every organization.
     *
     * <p>Every call site is a deliberate statement that this work has no tenant: a scheduler, a
     * Kafka consumer, or the authentication lookup that has to read {@code api_keys} before it
     * knows whose key it is. Reach for it only when that sentence is true.
     */
    public static void runAsSystem(Runnable body) {
        callAsSystem(() -> {
            body.run();
            return null;
        });
    }

    /** {@link #runAsSystem} for work that returns a value. */
    public static <T> T callAsSystem(Supplier<T> body) {
        UUID previous = set(SYSTEM);
        try {
            return body.get();
        } finally {
            restore(previous);
        }
    }

    /** {@link #callAsSystem} for work that throws checked exceptions. */
    public static <T> T callAsSystemChecked(Callable<T> body) throws Exception {
        UUID previous = set(SYSTEM);
        try {
            return body.call();
        } finally {
            restore(previous);
        }
    }
}
