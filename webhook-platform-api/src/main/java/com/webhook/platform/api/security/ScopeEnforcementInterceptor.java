package com.webhook.platform.api.security;

import com.webhook.platform.api.domain.enums.ApiKeyScope;
import com.webhook.platform.api.domain.enums.MembershipRole;
import com.webhook.platform.api.exception.ForbiddenException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import java.util.Map;
import java.util.UUID;

/**
 * Enforces three things before a handler runs: the {@link RequireAccess} level, the
 * {@link RequireScope} annotation for API-key requests, and the structural
 * {@code {projectId}} tenancy guard described below.
 *
 * <h2>API-key read/write scope ({@link RequireScope})</h2>
 * <p>Resolution order:
 * <ol>
 *   <li>Method-level {@code @RequireScope} (most specific)</li>
 *   <li>Class-level {@code @RequireScope}</li>
 *   <li>If neither exists — API key requests are <b>allowed</b> (backward-compat default;
 *       existing RBAC via {@code auth.requireWriteAccess()} still applies)</li>
 * </ol>
 * <p>For non-API-key authentication (JWT), this half of the check is a no-op.</p>
 *
 * <h2>API-key project confinement</h2>
 * <p>{@code AuthContext.organizationId} is derived from an API key's project, so a
 * service-layer check that only compares organization IDs passes for <b>any</b>
 * project in that org. The only thing that ever confined a key to its own project
 * was {@code AuthContext.validateProjectAccess(projectId)} — an opt-in call that a
 * handler could simply forget, and about a third of {@code {projectId}} routes did.
 *
 * <p>This interceptor now enforces that confinement <b>structurally</b>: for any
 * route whose resolved URI template contains a {@code {projectId}} path variable,
 * the value actually present in the request path is compared against the API key's
 * own project, regardless of whether the handler method binds that path variable or
 * calls {@code validateProjectAccess} itself. A route opts out only via the explicit
 * {@link ProjectScopeExempt} annotation — see its Javadoc for when that's legitimate.
 *
 * <p>Existing per-handler {@code validateProjectAccess(...)} calls are left in place
 * as harmless defence-in-depth rather than removed.
 */
@Slf4j
@Component
public class ScopeEnforcementInterceptor implements HandlerInterceptor {

    private static final String PROJECT_ID_PATH_VAR = "projectId";

    /**
     * Enforces {@link RequireAccess}, for both JWT and API-key callers.
     *
     * <p>Runs before the scope check below, not after: scope is an API-key concept and that
     * check returns early for a JWT, so a role requirement placed after it would silently not
     * apply to dashboard callers — which are exactly the ones a VIEWER is.
     *
     * <p>The role is read straight off the authentication token. Unlike
     * {@code AuthContextArgumentResolver}, which resolves an API key's Project to find its
     * Organization, nothing here needs a database lookup.
     *
     * <p>A platform-admin token is not a tenant identity and carries no membership role;
     * {@code /api/v1/admin/**} is gated on the PLATFORM_ADMIN authority in
     * {@code SecurityConfig} instead, so those requests pass through untouched.
     */
    private void enforceAccessLevel(HandlerMethod handlerMethod, Authentication authentication) {
        RequireAccess required = handlerMethod.getMethodAnnotation(RequireAccess.class);
        if (required == null) {
            required = handlerMethod.getBeanType().getAnnotation(RequireAccess.class);
        }
        if (required == null || required.value() == AccessLevel.READ) {
            return;
        }

        MembershipRole role;
        ApiKeyScope scope = null;
        if (authentication instanceof JwtAuthenticationToken jwt) {
            role = jwt.getRole();
        } else if (authentication instanceof ApiKeyAuthenticationToken apiKey) {
            role = MembershipRole.API_KEY;
            scope = apiKey.getScope();
        } else {
            return;
        }

        // Deliberately the same RbacUtil the handlers call, rather than a second implementation
        // of "what write access means". Two implementations would be two things to keep in
        // step, and the whole point of this annotation is that there is one answer.
        if (required.value() == AccessLevel.OWNER) {
            RbacUtil.requireOwnerAccess(role);
        } else {
            RbacUtil.requireWriteAccess(role, scope);
        }
    }


    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod handlerMethod)) {
            return true;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        enforceProjectScope(request, handlerMethod, authentication);
        enforceAccessLevel(handlerMethod, authentication);

        if (!(authentication instanceof ApiKeyAuthenticationToken apiKeyAuth)) {
            return true;
        }

        RequireScope methodAnnotation = handlerMethod.getMethodAnnotation(RequireScope.class);
        RequireScope classAnnotation = handlerMethod.getBeanType().getAnnotation(RequireScope.class);

        RequireScope effective = methodAnnotation != null ? methodAnnotation : classAnnotation;
        if (effective == null) {
            return true;
        }

        ApiKeyScope required = effective.value();
        ApiKeyScope actual = apiKeyAuth.getScope();

        if (required == ApiKeyScope.READ_WRITE && actual == ApiKeyScope.READ_ONLY) {
            log.warn("API key scope denied: required={}, actual={}, method={}.{}, projectId={}",
                    required, actual,
                    handlerMethod.getBeanType().getSimpleName(),
                    handlerMethod.getMethod().getName(),
                    apiKeyAuth.getProjectId());
            throw new ForbiddenException("API key scope insufficient. Required: " + required + ", actual: " + actual);
        }

        return true;
    }

    /**
     * Structural, path-based project-tenancy guard. Runs for every request,
     * independent of the {@link RequireScope} check above and of anything the handler
     * method itself does.
     */
    private void enforceProjectScope(HttpServletRequest request, HandlerMethod handlerMethod,
                                      Authentication authentication) {
        if (!(authentication instanceof ApiKeyAuthenticationToken apiKeyAuth)) {
            // JWT / platform-admin auth: project access within an org is governed by
            // org membership at the service layer. Only API
            // keys are meant to be confined to a single project.
            return;
        }

        if (isProjectScopeExempt(handlerMethod)) {
            return;
        }

        Object templateVars = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (!(templateVars instanceof Map<?, ?> vars)) {
            return;
        }

        Object rawProjectId = vars.get(PROJECT_ID_PATH_VAR);
        if (rawProjectId == null) {
            return;
        }

        UUID pathProjectId;
        try {
            pathProjectId = UUID.fromString(rawProjectId.toString());
        } catch (IllegalArgumentException e) {
            log.warn("ScopeEnforcementInterceptor: {} path variable '{}' on {}.{} is not a UUID",
                    PROJECT_ID_PATH_VAR, rawProjectId,
                    handlerMethod.getBeanType().getSimpleName(), handlerMethod.getMethod().getName());
            throw new ForbiddenException("Invalid project identifier");
        }

        if (!pathProjectId.equals(apiKeyAuth.getProjectId())) {
            log.warn("Project scope violation: API key for project {} attempted {} {} (project {}) via {}.{}",
                    apiKeyAuth.getProjectId(), request.getMethod(), request.getRequestURI(), pathProjectId,
                    handlerMethod.getBeanType().getSimpleName(), handlerMethod.getMethod().getName());
            throw new ForbiddenException("API key does not have access to this project");
        }
    }

    private boolean isProjectScopeExempt(HandlerMethod handlerMethod) {
        return handlerMethod.getMethodAnnotation(ProjectScopeExempt.class) != null
                || handlerMethod.getBeanType().getAnnotation(ProjectScopeExempt.class) != null;
    }
}
