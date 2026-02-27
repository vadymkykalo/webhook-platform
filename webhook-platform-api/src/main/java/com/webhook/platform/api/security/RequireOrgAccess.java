package com.webhook.platform.api.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Enforces tenant isolation by verifying that the {@code orgId} path variable
 * matches the {@code organizationId} claim in the current JWT token.
 *
 * <p>
 * Apply this annotation to any controller method that accepts an {@code orgId}
 * path variable. The AOP aspect {@link OrgAccessAspect} will intercept the call
 * and throw {@link com.webhook.platform.api.exception.ForbiddenException} if
 * the
 * authenticated user does not belong to the requested organization.
 * </p>
 *
 * <pre>
 * {@code
 * &#64;RequireOrgAccess
 * @GetMapping
 * public ResponseEntity<List<MemberResponse>> getMembers(
 *         &#64;PathVariable("orgId") UUID orgId, ...) { ... }
 * }
 * </pre>
 *
 * @see OrgAccessAspect
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireOrgAccess {

    /**
     * Name of the {@code @PathVariable} that contains the organization ID.
     * Defaults to {@code "orgId"}.
     */
    String orgIdParam() default "orgId";
}
