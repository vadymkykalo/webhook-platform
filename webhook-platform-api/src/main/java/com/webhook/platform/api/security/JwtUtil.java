package com.webhook.platform.api.security;

import com.webhook.platform.api.domain.enums.MembershipRole;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class JwtUtil {

    private final SecretKey secretKey;
    private final long accessTokenExpiration;
    private final long refreshTokenExpiration;
    
    // Request-scoped cache to avoid parsing same token multiple times per request
    private static final ThreadLocal<Map<String, Claims>> REQUEST_CACHE = 
            ThreadLocal.withInitial(ConcurrentHashMap::new);

    public JwtUtil(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.access-token-expiration:900000}") long accessTokenExpiration,
            @Value("${jwt.refresh-token-expiration:86400000}") long refreshTokenExpiration) {
        if (secret == null || secret.isBlank() || secret.length() < 32) {
            throw new IllegalStateException(
                    "JWT_SECRET must be set and at least 32 characters. " +
                            "Set it via environment variable JWT_SECRET or property jwt.secret");
        }
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessTokenExpiration = accessTokenExpiration;
        this.refreshTokenExpiration = refreshTokenExpiration;
    }

    /**
     * Value of the {@code typ} claim stamped on every access token. Consumers (notably
     * {@code JwtAuthenticationFilter}) must reject any bearer token whose {@code typ} is
     * not this value, rather than accepting anything that merely parses.
     */
    public static final String TOKEN_TYPE_ACCESS = "access";

    /**
     * Value of the {@code typ} claim stamped on every refresh token. Consumers (notably
     * {@code AuthService#refreshToken}) must reject any token presented to the refresh
     * endpoint whose {@code typ} is not this value.
     */
    public static final String TOKEN_TYPE_REFRESH = "refresh";

    public String generateAccessToken(UUID userId, UUID organizationId, MembershipRole role) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", userId.toString());
        claims.put("organizationId", organizationId.toString());
        claims.put("role", role.name());
        claims.put("typ", TOKEN_TYPE_ACCESS);

        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .claims(claims)
                .subject(userId.toString())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + accessTokenExpiration))
                .signWith(secretKey)
                .compact();
    }

    public String generateRefreshToken(UUID userId) {
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .claim("typ", TOKEN_TYPE_REFRESH)
                .subject(userId.toString())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + refreshTokenExpiration))
                .signWith(secretKey)
                .compact();
    }

    public Claims parseToken(String token) {
        // Check cache first to avoid redundant HMAC verification
        Map<String, Claims> cache = REQUEST_CACHE.get();
        Claims cached = cache.get(token);
        if (cached != null) {
            return cached;
        }
        
        // Parse and cache
        Claims claims = Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        cache.put(token, claims);
        return claims;
    }
    
    /**
     * Clears the request-scoped token cache.
     * Should be called at the end of request processing (e.g., in filter's finally block).
     */
    public static void clearCache() {
        REQUEST_CACHE.remove();
    }

    public UUID getUserIdFromToken(String token) {
        Claims claims = parseToken(token);
        return UUID.fromString(claims.getSubject());
    }

    public UUID getOrganizationIdFromToken(String token) {
        Claims claims = parseToken(token);
        return UUID.fromString(claims.get("organizationId", String.class));
    }

    public MembershipRole getRoleFromToken(String token) {
        Claims claims = parseToken(token);
        return MembershipRole.valueOf(claims.get("role", String.class));
    }

    public String getJtiFromToken(String token) {
        Claims claims = parseToken(token);
        return claims.getId();
    }

    /**
     * Returns the {@code typ} claim ({@link #TOKEN_TYPE_ACCESS} or {@link #TOKEN_TYPE_REFRESH}),
     * or {@code null} for tokens issued before this claim existed. Callers must treat a
     * {@code null}/unexpected value as "wrong token type", not as "any type is fine".
     */
    public String getTokenType(String token) {
        Claims claims = parseToken(token);
        return claims.get("typ", String.class);
    }

    public Date getExpirationFromToken(String token) {
        Claims claims = parseToken(token);
        return claims.getExpiration();
    }

    public Date getIssuedAtFromToken(String token) {
        Claims claims = parseToken(token);
        return claims.getIssuedAt();
    }

    public boolean validateToken(String token) {
        try {
            parseToken(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
