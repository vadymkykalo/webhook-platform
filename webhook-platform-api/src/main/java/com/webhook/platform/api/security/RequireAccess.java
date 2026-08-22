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
 * <p>Method-level wins over class-level. The corresponding
 * {@code auth.requireWriteAccess()} / {@code requireOwnerAccess()} calls stay in the handlers
 * as defence in depth: this annotation makes the requirement visible and omission loud, it does
 * not make the imperative check redundant.
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
