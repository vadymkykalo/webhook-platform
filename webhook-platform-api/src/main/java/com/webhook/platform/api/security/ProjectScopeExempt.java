package com.webhook.platform.api.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Explicit, greppable opt-out from the automatic project-tenancy check that
 * {@link ScopeEnforcementInterceptor} applies to every route whose resolved
 * URL contains a {@code {projectId}} path variable.
 *
 * <p>By default, any such route is confined to an API key's own project: the
 * interceptor compares the {@code projectId} path variable against
 * {@code ApiKeyAuthenticationToken.getProjectId()} and throws
 * {@link com.webhook.platform.api.exception.ForbiddenException} on mismatch,
 * before the handler method runs. This is unconditional and does not depend
 * on the handler calling {@code AuthContext.validateProjectAccess(...)} —
 * that was the original defect: the check existed but was opt-in per
 * handler, and about a third of {@code {projectId}} routes never called it.
 *
 * <p>Apply this annotation — at the method or class level — only for a
 * genuine exception: a route that legitimately needs to accept a
 * {@code {projectId}} path segment without confining the caller to that
 * project. {@link #reason()} is mandatory so "no check here" reads as a
 * deliberate, reviewable decision in a diff and in a `grep`, never a silent
 * omission.
 *
 * <p>No production controller needs this exemption today — every
 * {@code {projectId}} route is a genuine per-project resource. The mechanism
 * exists so a future, real exception has a sanctioned way to opt out instead
 * of reviving the ad-hoc-coverage problem this mechanism replaced.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface ProjectScopeExempt {

    /**
     * Why this route is deliberately exempt from the automatic {@code
     * {projectId}} tenancy check. Required — an exemption without a stated
     * reason defeats the point of the annotation.
     */
    String reason();
}
