package com.webhook.platform.api.tenancy;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Declares that a method runs across every organization rather than inside one.
 *
 * <p>The counterpart to the request path: {@code TenantContextFilter} scopes a request to its
 * caller's organization, and everything that is not a request has to say what it is instead.
 * Schedulers, Kafka consumers and startup work have no caller, so without this they would hit
 * {@link TenantNotResolvedException} on their first query — deliberately, because the two silent
 * alternatives are both wrong (see {@link OrganizationTenantResolver}).
 *
 * <p>Declared at the seam rather than wrapped in the body, for the same reason
 * {@code @RequireAccess} is: a reviewer reading the method signature can see the answer, and
 * {@code BackgroundWorkTenantDeclarationTest} can fail the build on a new {@code @Scheduled}
 * method that declares nothing.
 *
 * <h2>Writing under root</h2>
 *
 * <p>Root scope removes the read filter. Writing still needs care, and Hibernate's rule is worth
 * knowing exactly: on insert it takes the {@code @TenantId} property's value if one is set and
 * the resolver calls the current tenant root, and otherwise stamps the current tenant over it.
 * Under a real tenant, setting the property to a <em>different</em> organization is a
 * {@code PropertyValueException} rather than a silent cross-tenant write.
 *
 * <p>So a system-scoped method that inserts a tenant-scoped row must set {@code organizationId}
 * itself — {@code AuthService.register} does, on the Membership it creates — or the row is
 * written with the sentinel and belongs to nobody. Where that is awkward, read the subjects under
 * root and enter {@link TenantContext#runAs} per subject before writing.
 */
@Documented
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface SystemTenant {

    /**
     * Why this method has no tenant. Free text, read by humans reviewing the annotation.
     */
    String value() default "";
}
