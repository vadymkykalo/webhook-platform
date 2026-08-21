package com.webhook.platform.api.security;

import com.webhook.platform.api.domain.enums.MembershipRole;
import com.webhook.platform.api.service.TokenBlacklistService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * P1-19: {@link JwtUtil} caches parsed claims in a static
 * {@code ThreadLocal<Map<String, Claims>>} (REQUEST_CACHE) to avoid
 * re-verifying the same token's HMAC signature multiple times within one
 * request. That is only safe because {@link JwtAuthenticationFilter}
 * unconditionally clears it in a {@code finally} block after the filter
 * chain returns - see the javadoc on {@code JwtUtil.REQUEST_CACHE} for the
 * full invariant, including why it would leak a previous request's claims
 * across requests if virtual threads were ever pooled/reused instead of
 * spawned fresh per request.
 *
 * <p>This test proves the clearing half of that invariant holds for a real
 * request through the real filter (not a mocked JwtUtil, which would never
 * touch the actual cache).
 */
class JwtAuthenticationFilterTest {

    private static final String SECRET = "test-secret-key-at-least-32-characters-long-for-hmac";

    @Test
    void requestCacheIsEmptyOnThisThreadAfterFilterChainCompletes() throws Exception {
        JwtUtil jwtUtil = new JwtUtil(SECRET, 900_000L, 86_400_000L);
        TokenBlacklistService blacklistService = mock(TokenBlacklistService.class);
        when(blacklistService.isBlacklisted(anyString())).thenReturn(false);
        when(blacklistService.isTokenRevokedByEpoch(any(), any())).thenReturn(false);

        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtUtil, blacklistService);

        String token = jwtUtil.generateAccessToken(UUID.randomUUID(), UUID.randomUUID(), MembershipRole.OWNER);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        // Sanity check: the token is actually parsed (and therefore cached)
        // during the request, so the post-request assertion below is proving
        // something was cleared, not that nothing was ever cached.
        assertThat(jwtUtil.validateToken(token)).isTrue();

        filter.doFilter(request, response, chain);

        @SuppressWarnings("unchecked")
        ThreadLocal<Map<String, Claims>> requestCache =
                (ThreadLocal<Map<String, Claims>>) ReflectionTestUtils.getField(JwtUtil.class, "REQUEST_CACHE");

        assertThat(requestCache.get())
                .as("JwtUtil's per-request claims cache must be empty on this thread once the filter chain " +
                        "returns, or a future request handled on the same thread would start out with another " +
                        "request's already-parsed claims")
                .isEmpty();
    }

    @Test
    void requestCacheIsEmptyEvenWhenTokenIsRejected() throws Exception {
        JwtUtil jwtUtil = new JwtUtil(SECRET, 900_000L, 86_400_000L);
        TokenBlacklistService blacklistService = mock(TokenBlacklistService.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtUtil, blacklistService);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer not-a-real-jwt");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        @SuppressWarnings("unchecked")
        ThreadLocal<Map<String, Claims>> requestCache =
                (ThreadLocal<Map<String, Claims>>) ReflectionTestUtils.getField(JwtUtil.class, "REQUEST_CACHE");

        assertThat(requestCache.get()).isEmpty();
    }
}
