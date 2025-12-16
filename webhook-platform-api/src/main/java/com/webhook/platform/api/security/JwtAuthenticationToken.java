package com.webhook.platform.api.security;

import com.webhook.platform.api.domain.enums.MembershipRole;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;

import java.util.Collection;
import java.util.UUID;

public class JwtAuthenticationToken extends AbstractAuthenticationToken {

    private final UUID userId;
    private final UUID organizationId;
    private final MembershipRole role;

    public JwtAuthenticationToken(
            UUID userId,
            UUID organizationId,
            MembershipRole role,
            Collection<? extends GrantedAuthority> authorities) {
        super(authorities);
        this.userId = userId;
        this.organizationId = organizationId;
        this.role = role;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Object getPrincipal() {
        return userId;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getOrganizationId() {
        return organizationId;
    }

    public MembershipRole getRole() {
        return role;
    }
}
