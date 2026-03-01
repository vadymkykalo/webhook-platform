package com.webhook.platform.api.security;

import com.webhook.platform.api.domain.enums.MembershipRole;
import com.webhook.platform.api.exception.ForbiddenException;

import java.util.UUID;

/**
 * Unified authentication context resolved from either JWT or API Key.
 * Controllers declare this as a method parameter — Spring resolves it
 * automatically via {@link AuthContextArgumentResolver}.
 *
 * <ul>
 *   <li>JWT auth → userId + organizationId + role from token, apiKeyProjectId = null</li>
 *   <li>API Key auth → userId = null, organizationId from project lookup, role = API_KEY,
 *       apiKeyProjectId = key's project</li>
 * </ul>
 */
public record AuthContext(
        UUID userId,
        UUID organizationId,
        MembershipRole role,
        UUID apiKeyProjectId
) {

    public void requireWriteAccess() {
        RbacUtil.requireWriteAccess(role);
    }

    public void requireOwnerAccess() {
        RbacUtil.requireOwnerAccess(role);
    }

    /**
     * For API Key auth: validates that the requested projectId matches the key's project.
     * For JWT auth: no-op (org-level validation happens in the service layer).
     */
    public void validateProjectAccess(UUID requestedProjectId) {
        if (apiKeyProjectId != null && !apiKeyProjectId.equals(requestedProjectId)) {
            throw new ForbiddenException("API key does not have access to this project");
        }
    }

    public boolean isApiKey() {
        return role == MembershipRole.API_KEY;
    }

    /**
     * Returns userId or throws if this is an API Key context (userId is null).
     * Use in endpoints that require a real user identity (e.g. org membership, profile).
     */
    public UUID requireUserId() {
        if (userId == null) {
            throw new ForbiddenException("This operation requires user authentication (JWT). API keys are not supported.");
        }
        return userId;
    }
}
