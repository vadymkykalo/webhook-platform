package com.webhook.platform.api.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RRateLimiter;
import org.redisson.api.RedissonClient;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthRateLimiterServiceTest {

    @Mock
    private RedissonClient redissonClient;

    private MeterRegistry meterRegistry;
    private AuthRateLimiterService service;

    private static final int LOGIN_RATE = 5;
    private static final int REGISTER_RATE = 3;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        service = new AuthRateLimiterService(redissonClient, meterRegistry, LOGIN_RATE, REGISTER_RATE);
    }

    @Test
    void allowLogin_redisAvailable_shouldUseRedis() {
        RRateLimiter limiter = mock(RRateLimiter.class);
        when(redissonClient.getRateLimiter(anyString())).thenReturn(limiter);
        when(limiter.tryAcquire(1)).thenReturn(true);

        assertTrue(service.allowLogin("127.0.0.1", "user@test.com"));
        assertEquals(0, getFallbackCount());
    }

    @Test
    void allowLogin_redisAvailable_limitExceeded() {
        RRateLimiter limiter = mock(RRateLimiter.class);
        when(redissonClient.getRateLimiter(anyString())).thenReturn(limiter);
        when(limiter.tryAcquire(1)).thenReturn(false);

        assertFalse(service.allowLogin("127.0.0.1", null));
    }

    @Test
    void allowLogin_redisDown_shouldUseLocalFallback() {
        when(redissonClient.getRateLimiter(anyString()))
                .thenThrow(new RuntimeException("Redis connection refused"));

        // First call within limit — should be allowed
        assertTrue(service.allowLogin("127.0.0.1", null));
        assertTrue(getFallbackCount() > 0);
    }

    @Test
    void allowLogin_redisDown_localFallbackShouldEnforceLimit() {
        when(redissonClient.getRateLimiter(anyString()))
                .thenThrow(new RuntimeException("Redis connection refused"));

        // Exhaust all tokens
        for (int i = 0; i < LOGIN_RATE; i++) {
            assertTrue(service.allowLogin("10.0.0.1", null),
                    "Attempt " + (i + 1) + " should be allowed");
        }

        // Next should be rejected
        assertFalse(service.allowLogin("10.0.0.1", null),
                "Request exceeding limit should be rejected by local fallback");
    }

    @Test
    void allowRegister_redisDown_localFallbackShouldEnforceLimit() {
        when(redissonClient.getRateLimiter(anyString()))
                .thenThrow(new RuntimeException("Redis connection refused"));

        // Exhaust register limit
        for (int i = 0; i < REGISTER_RATE; i++) {
            assertTrue(service.allowRegister("10.0.0.2"), "Register " + (i + 1) + " should be allowed");
        }

        // Next should be rejected
        assertFalse(service.allowRegister("10.0.0.2"),
                "Registration exceeding limit should be rejected");
    }

    private double getFallbackCount() {
        Counter counter = meterRegistry.find("auth_rate_limit_fallback_total").counter();
        return counter != null ? counter.count() : 0;
    }
}
