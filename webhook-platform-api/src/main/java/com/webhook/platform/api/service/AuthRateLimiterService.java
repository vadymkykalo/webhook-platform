package com.webhook.platform.api.service;

import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RRateLimiter;
import org.redisson.api.RateIntervalUnit;
import org.redisson.api.RateType;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
@Slf4j
public class AuthRateLimiterService {

    private static final String LOGIN_IP_KEY_PREFIX = "rate_limiter:auth:login:ip:";
    private static final String LOGIN_EMAIL_KEY_PREFIX = "rate_limiter:auth:login:email:";
    private static final String REGISTER_KEY_PREFIX = "rate_limiter:auth:register:";
    private static final Duration KEY_TTL = Duration.ofMinutes(5);

    private final RedissonClient redissonClient;
    private final int loginRateLimit;
    private final int registerRateLimit;

    public AuthRateLimiterService(
            RedissonClient redissonClient,
            @Value("${auth.rate-limit.login-per-minute:10}") int loginRateLimit,
            @Value("${auth.rate-limit.register-per-minute:5}") int registerRateLimit) {
        this.redissonClient = redissonClient;
        this.loginRateLimit = loginRateLimit;
        this.registerRateLimit = registerRateLimit;
    }

    public boolean allowLogin(String ip, String email) {
        boolean ipAllowed = tryAcquire(LOGIN_IP_KEY_PREFIX + ip, loginRateLimit);
        if (!ipAllowed) {
            return false;
        }
        if (email != null && !email.isBlank()) {
            return tryAcquire(LOGIN_EMAIL_KEY_PREFIX + email.toLowerCase().trim(), loginRateLimit);
        }
        return true;
    }

    public boolean allowRegister(String ip) {
        return tryAcquire(REGISTER_KEY_PREFIX + ip, registerRateLimit);
    }

    private boolean tryAcquire(String key, int ratePerMinute) {
        try {
            RRateLimiter limiter = redissonClient.getRateLimiter(key);
            limiter.trySetRate(RateType.OVERALL, ratePerMinute, 1, RateIntervalUnit.MINUTES);
            limiter.expire(KEY_TTL);
            boolean acquired = limiter.tryAcquire(1);
            if (!acquired) {
                log.warn("Auth rate limit exceeded for key: {}", key);
            }
            return acquired;
        } catch (Exception e) {
            log.warn("Auth rate limiter unavailable, allowing request: {}", e.getMessage());
            return true;
        }
    }
}
