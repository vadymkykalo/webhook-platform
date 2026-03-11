package com.webhook.platform.api.security;

import com.webhook.platform.api.domain.enums.ApiKeyScope;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;

import java.util.Collection;
import java.util.UUID;

public class ApiKeyAuthenticationToken extends AbstractAuthenticationToken {

    private final String apiKey;
    private final UUID projectId;
    private final ApiKeyScope scope;

    public ApiKeyAuthenticationToken(String apiKey) {
        super(null);
        this.apiKey = apiKey;
        this.projectId = null;
        this.scope = null;
        setAuthenticated(false);
    }

    public ApiKeyAuthenticationToken(String apiKey, UUID projectId, ApiKeyScope scope, Collection<? extends GrantedAuthority> authorities) {
        super(authorities);
        this.apiKey = apiKey;
        this.projectId = projectId;
        this.scope = scope;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return apiKey;
    }

    @Override
    public Object getPrincipal() {
        return projectId;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public ApiKeyScope getScope() {
        return scope;
    }
}
