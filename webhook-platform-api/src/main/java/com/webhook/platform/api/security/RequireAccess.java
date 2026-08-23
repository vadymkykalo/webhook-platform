package com.webhook.platform.api.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * The {@link AccessLevel} a handler requires, enforced by {@link ScopeEnforcementInterceptor}
 * before the handler runs.
 *
 * <p>This replaces reading a handler's body to find out who may call it. Three handlers once
 * shipped reachable by a {@code VIEWER} JWT and a {@code READ_ONLY} API key — one returned a
 * real HMAC signature computed with an Endpoint's signing secret, another fired a signed
 * outbound request from the platform — because the guard was an imperative call somebody had
 * not written, and nothing anywhere said it was missing. See ADR-0006.
 *
 * <p>Method-level wins over class-level.
 *
 * <h2>And the {@code auth.requireWriteAccess()} call in the handler?</h2>
 *
 * <p>It stays, and ADR-0015 is why — but not for the reason the earlier wording here gave. It is
 * not a second opinion: {@link ScopeEnforcementInterceptor} calls the same {@link RbacUtil} the
 * handler does, so the two cannot disagree about what WRITE means. They can only disagree about
 * whether they run, and the interceptor is now the more reliable of the two — it cannot be
 * forgotten, and {@code AccessLevelInterceptorCoverageTest} proves it is reached.
 *
 * <p>So the imperative call is redundant as a check. Deleting 79 of them is still the wrong
 * trade: the change is large, it is on the authorization path, and it buys tidiness. Write the
 * annotation on a new handler and copy the imperative call from its neighbours; do not start a
 * campaign in either direction.
 *
 * <p>{@code MutatingHandlerAccessDeclarationTest} fails the build when a state-changing handler
 * carries neither this annotation nor a documented exemption.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ ElementType.METHOD, ElementType.TYPE })
public @interface RequireAccess {

    AccessLevel value();
}
