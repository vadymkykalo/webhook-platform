package com.webhook.platform.api.tenancy;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.webhook.platform.api.security.ApiKeyAuthenticationToken;
import com.webhook.platform.api.security.JwtAuthenticationToken;
import com.webhook.platform.api.security.PlatformAdminAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Turns the authenticated identity into the tenant scope the rest of the request runs in.
 *
 * <p>Runs after the three authentication filters and before anything that touches the database,
 * so a handler, a service and a repository all see the same organization without any of them
 * being handed one. This is the request half of making org ownership a
 * property of data access; {@link TenantContext#runAsSystem} is the other half.
 *
 * <h2>What each kind of caller maps to</h2>
 *
 * <ul>
 *   <li><b>JWT</b> — the organization in the token.</li>
 *   <li><b>API key</b> — the organization owning the key's project, resolved during
 *       authentication.</li>
 *   <li><b>Platform admin</b> — {@link TenantContext#SYSTEM}. A platform admin is not a member of
 *       any organization; {@code /api/v1/admin/**} is gated on the PLATFORM_ADMIN authority in
 *       {@code SecurityConfig} and is meant to see across tenants. Giving it a tenant would
 *       break it, and giving it none would fail every query.</li>
 *   <li><b>Unauthenticated</b> — nothing is set. The whitelisted public paths
 *       ({@code /ingress/**}, {@code /tunnel/**}, {@code /hook/**}) have a tenant but no caller
 *       identity, so they discover their own organization from the token or slug in the URL and
 *       enter it with {@link TenantContext#runAs}. Leaving the scope unset here is what forces
 *       them to: the first unscoped query throws {@link TenantNotResolvedException}.</li>
 * </ul>
 *
 * <p>The previous scope is restored in a {@code finally}, which on a real request means clearing
 * it: Tomcat threads are pooled, and a leaked {@code ThreadLocal} would hand one request's tenant
 * to the next request on that thread — the one failure mode of this design that would be worse
 * than the problem it solves. Restoring rather than clearing outright matters where a request is
 * dispatched on a thread that already had a scope: MockMvc runs the whole chain on the calling
 * thread, so an unconditional clear would wipe the scope of the test that made the call.
 *
 * <h2>Why this is not a {@code @Component}</h2>
 *
 * <p>Any {@code Filter} bean is also registered directly with the servlet container, where it
 * runs <em>before</em> the security filter chain. For the authentication filters that is
 * harmless. For this one it would be fatal: it would run while the {@code SecurityContext} is
 * still empty, set no tenant, and — being a {@code OncePerRequestFilter} — decline to run again
 * in the position where the identity actually exists. It is constructed by {@code SecurityConfig}
 * instead, so the chain is the only place it appears.
 */
public class TenantContextFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        java.util.UUID previous = TenantContext.current();
        if (authentication instanceof JwtAuthenticationToken jwt) {
            TenantContext.set(jwt.getOrganizationId());
        } else if (authentication instanceof ApiKeyAuthenticationToken apiKey) {
            TenantContext.set(apiKey.getOrganizationId());
        } else if (authentication instanceof PlatformAdminAuthenticationToken) {
            TenantContext.set(TenantContext.SYSTEM);
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.restore(previous);
        }
    }
}
