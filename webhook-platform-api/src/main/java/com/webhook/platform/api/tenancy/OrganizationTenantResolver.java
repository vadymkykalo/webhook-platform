package com.webhook.platform.api.tenancy;

import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Tells Hibernate which organization the session it is opening belongs to.
 *
 * <p>Hibernate calls this for every session and adds {@code organization_id = ?} to every query
 * against an entity carrying {@code @TenantId} — including {@code find()} by primary key, which
 * is what makes this a real confinement rather than a convention. A repository method cannot
 * forget it and a new repository method inherits it.
 *
 * <h2>Root, not a sentinel</h2>
 *
 * <p>{@link #isRoot} is Hibernate 6's hook for "this session sees everything": when it returns
 * true, no predicate is built at all. That is what {@link TenantContext#SYSTEM} means, and it is
 * why the outbox poller and the Kafka consumers keep working. The rejected alternative was a
 * sentinel organization id, which would have filtered every background query down to zero rows —
 * the same bug as forgetting the filter, but silent in the other direction.
 *
 * <h2>Why an unset tenant throws</h2>
 *
 * <p>Returning null is not an option Hibernate offers, and neither available fallback is safe: a
 * sentinel breaks system work, and "no filter" is precisely the opt-in default ADR-0006 exists
 * to remove. Failing loudly means an uncovered path shows up as a 500 in a test run rather than
 * as a cross-tenant read in production.
 */
@Component
public class OrganizationTenantResolver implements CurrentTenantIdentifierResolver<UUID> {

    /**
     * True until this application context has finished starting.
     *
     * <p>Spring Data builds and validates every repository's queries while the context comes up,
     * and Hibernate asks for a tenant identifier as it does — on the startup thread, where nothing
     * has entered a scope. Throwing there protects nothing and simply prevents the application from
     * starting. Startup is system work by definition: the framework wiring itself up, plus the
     * {@code @PostConstruct} readers that legitimately read across organizations.
     *
     * <p>State on the bean rather than a static, because a test JVM runs several application
     * contexts: a static flag would be switched off by the first context to start and would then
     * break the startup of every context after it.
     */
    private volatile boolean startingUp = true;

    /** Ends the startup grace window; called from {@code TenancyConfig} on ApplicationReadyEvent. */
    public void applicationStarted() {
        this.startingUp = false;
    }

    @Override
    public UUID resolveCurrentTenantIdentifier() {
        UUID tenant = TenantContext.current();
        if (tenant == null && startingUp) {
            // Repository metadata being built during context startup -- see startingUp.
            return TenantContext.SYSTEM;
        }
        if (tenant == null) {
            throw new TenantNotResolvedException(
                    "No tenant scope on this thread. A request path must go through TenantContextFilter; "
                            + "background work (schedulers, Kafka consumers, WebSocket handlers) must wrap itself "
                            + "in TenantContext.runAsSystem(...); a public path must resolve its organization and "
                            + "use TenantContext.runAs(...).");
        }
        return tenant;
    }

    /**
     * False: a session may legitimately outlive a change of scope.
     *
     * <p>Validating would make Hibernate reject an existing session whose tenant no longer matches
     * the resolver — which is exactly what happens when a request enters
     * {@link TenantContext#callAsSystem} while a transaction is open. Nesting is a supported
     * pattern here, so this check would fire on correct code.
     */
    @Override
    public boolean validateExistingCurrentSessions() {
        return false;
    }

    @Override
    public boolean isRoot(UUID tenantId) {
        return TenantContext.SYSTEM.equals(tenantId);
    }
}
