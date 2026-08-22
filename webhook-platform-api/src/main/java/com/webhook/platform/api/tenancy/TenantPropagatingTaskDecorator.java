package com.webhook.platform.api.tenancy;

import org.springframework.core.task.TaskDecorator;

import java.util.UUID;

/**
 * Carries the submitting thread's tenant scope onto the thread that runs the task.
 *
 * <p>{@link TenantContext} is a {@code ThreadLocal}, so an {@code @Async} method would otherwise
 * start with no scope at all and fail on its first query. Every {@code @Async} method here is
 * work handed off from a request that already knows whose data it is — dispatching an alert for
 * a rule, running a replay session, triggering workflows for a project — so inheriting the
 * caller's tenant is both the safe answer and the accurate one.
 *
 * <p>An {@code @Async} call made from a system-scoped path inherits {@link TenantContext#SYSTEM}
 * the same way, which is what a scheduler handing work to a pool wants. A submission from a
 * thread with no scope at all propagates nothing, and the task fails the way any unscoped code
 * does — loudly, rather than by quietly reading another tenant's rows.
 */
public class TenantPropagatingTaskDecorator implements TaskDecorator {

    @Override
    public Runnable decorate(Runnable runnable) {
        UUID captured = TenantContext.current();
        return () -> {
            if (captured == null) {
                runnable.run();
                return;
            }
            UUID previous = TenantContext.set(captured);
            try {
                runnable.run();
            } finally {
                TenantContext.restore(previous);
            }
        };
    }
}
