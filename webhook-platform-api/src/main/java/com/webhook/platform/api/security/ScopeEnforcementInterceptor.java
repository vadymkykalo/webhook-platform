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
 * <p>{@link RequireScope} resolves method-level first, then class-level; neither means an API-key
 * request is allowed, and a JWT skips this half entirely.
 *
 * <p>Project confinement is structural. {@code AuthContext.organizationId} comes off the key's
 * project, so an organization-only check passes for any project in that org — and the call that
 * did confine a key was opt-in, which a third of {@code {projectId}} routes forgot. Every route
 * whose URI template carries {@code {projectId}} is now compared against the key's own project
 * regardless of what the handler does, unless it declares {@link ProjectScopeExempt}.
 */
@Slf4j
@Component
public class ScopeEnforcementInterceptor implements HandlerInterceptor {

    private static final String PROJECT_ID_PATH_VAR = "projectId";

    /**
     * Enforces {@link RequireAccess}, for both JWT and API-key callers.
     *
     * <p>Before the scope check, not after: scope returns early for a JWT, so a role requirement
     * placed after it would not apply to dashboard callers — exactly the ones a VIEWER is.
     *
     * <p>An authentication that maps to no membership role is refused when a level above READ is
     * declared. That costs the admin endpoints nothing, since none of them declares one; what the
     * old pass-through covered was platform-admin tokens aimed at tenant handlers, safe only
     * because every annotated handler happens to take an {@code AuthContext}.
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
            log.warn("Access level denied: {} declares {} but the caller carries no membership role ({})",
                    handlerMethod.getMethod().getName(), required.value(),
                    authentication == null ? "unauthenticated" : authentication.getClass().getSimpleName());
            throw new ForbiddenException(
                    "This endpoint requires a membership role the caller does not have. A handler that "
                            + "declares an access level is a tenant endpoint; platform-admin credentials "
                            + "belong on /api/v1/admin/**.");
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
