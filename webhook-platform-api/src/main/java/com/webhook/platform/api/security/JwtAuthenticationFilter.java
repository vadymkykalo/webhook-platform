package com.webhook.platform.api.security;

import com.webhook.platform.api.domain.enums.MembershipRole;
import com.webhook.platform.api.service.TokenBlacklistService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import org.slf4j.MDC;

import java.io.IOException;
import java.util.Collections;
import java.util.UUID;

@Slf4j
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";
    
    private final JwtUtil jwtUtil;
    private final TokenBlacklistService tokenBlacklistService;

    public JwtAuthenticationFilter(JwtUtil jwtUtil, TokenBlacklistService tokenBlacklistService) {
        this.jwtUtil = jwtUtil;
        this.tokenBlacklistService = tokenBlacklistService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String authHeader = request.getHeader(AUTHORIZATION_HEADER);

        if (authHeader != null && authHeader.startsWith(BEARER_PREFIX)) {
            String token = authHeader.substring(BEARER_PREFIX.length());
            
            try {
                Claims claims = jwtUtil.parseToken(token);

                String jti = claims.getId();
                String tokenType = claims.get("typ", String.class);
                if (!JwtUtil.TOKEN_TYPE_ACCESS.equals(tokenType)) {
                    // Deliberate rejection of anything that isn't an access token -- a refresh
                    // token (or a legacy token with no "typ" claim) must not authenticate
                    // API requests. Previously this only failed by accident (NPE below on the
                    // missing "organizationId" claim, swallowed by the catch block).
                    log.debug("Token jti={} has type={}, expected access, rejecting", jti, tokenType);
                } else if (tokenBlacklistService.isBlacklisted(jti)) {
                    log.debug("Token jti={} is blacklisted, rejecting", jti);
                } else {
                    UUID userId = UUID.fromString(claims.getSubject());

                    if (tokenBlacklistService.isTokenRevokedByEpoch(userId, claims.getIssuedAt())) {
                        log.debug("Token for user {} was issued before revocation epoch, rejecting", userId);
                    } else {
                        UUID organizationId = UUID.fromString(claims.get("organizationId", String.class));
                        MembershipRole role = MembershipRole.valueOf(claims.get("role", String.class));

                        JwtAuthenticationToken authentication = new JwtAuthenticationToken(
                                userId,
                                organizationId,
                                role,
                                Collections.emptyList()
                        );
                        SecurityContextHolder.getContext().setAuthentication(authentication);
                        MDC.put("organizationId", organizationId.toString());
                        MDC.put("userId", userId.toString());
                    }
                }
            } catch (Exception e) {
                log.debug("JWT validation failed: {}", e.getMessage());
            }
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove("organizationId");
            MDC.remove("userId");
            MDC.remove("projectId");
            JwtUtil.clearCache();
        }
    }
}
