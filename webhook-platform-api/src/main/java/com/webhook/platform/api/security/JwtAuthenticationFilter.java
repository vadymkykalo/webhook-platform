package com.webhook.platform.api.security;

import com.webhook.platform.api.domain.enums.MembershipRole;
import com.webhook.platform.api.service.TokenBlacklistService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

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
                if (jwtUtil.validateToken(token)) {
                    String jti = jwtUtil.getJtiFromToken(token);
                    if (tokenBlacklistService.isBlacklisted(jti)) {
                        log.debug("Token jti={} is blacklisted, rejecting", jti);
                    } else {
                        UUID userId = jwtUtil.getUserIdFromToken(token);

                        if (tokenBlacklistService.isTokenRevokedByEpoch(userId, jwtUtil.getIssuedAtFromToken(token))) {
                            log.debug("Token for user {} was issued before revocation epoch, rejecting", userId);
                        } else {
                            UUID organizationId = jwtUtil.getOrganizationIdFromToken(token);
                            MembershipRole role = jwtUtil.getRoleFromToken(token);

                            JwtAuthenticationToken authentication = new JwtAuthenticationToken(
                                    userId,
                                    organizationId,
                                    role,
                                    Collections.emptyList()
                            );
                            SecurityContextHolder.getContext().setAuthentication(authentication);
                        }
                    }
                }
            } catch (Exception e) {
                log.debug("JWT validation failed: {}", e.getMessage());
            }
        }

        filterChain.doFilter(request, response);
    }
}
