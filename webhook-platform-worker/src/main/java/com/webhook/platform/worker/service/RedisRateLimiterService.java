package com.webhook.platform.worker.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RRateLimiter;
import org.redisson.api.RateIntervalUnit;
import org.redisson.api.RateType;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.UUID;

@Service
@Slf4j
public class RedisRateLimiterService {

    private static final String KEY_PREFIX = "rate_limiter:endpoint:";
    private static final Duration KEY_TTL = Duration.ofHours(24);

    private final RedissonClient redissonClient;
    private final MeterRegistry meterRegistry;
    private final Counter rateLimitHits;
    private final Counter rateLimitMisses;

    public RedisRateLimiterService(RedissonClient redissonClient, MeterRegistry meterRegistry) {
        this.redissonClient = redissonClient;
        this.meterRegistry = meterRegistry;
        this.rateLimitHits = Counter.builder("webhook_rate_limit_hits_total")
                .description("Number of requests that passed rate limiting")
                .register(meterRegistry);
        this.rateLimitMisses = Counter.builder("webhook_rate_limit_exceeded_total")
                .description("Number of requests rejected by rate limiting")
                .register(meterRegistry);
    }

    public boolean tryAcquire(UUID endpointId, int ratePerSecond) {
        if (ratePerSecond <= 0) {
            rateLimitHits.increment();
            return true;
        }

        try {
            String key = KEY_PREFIX + endpointId;
            RRateLimiter limiter = redissonClient.getRateLimiter(key);
            
            limiter.trySetRate(RateType.OVERALL, ratePerSecond, 1, RateIntervalUnit.SECONDS);
            limiter.expire(KEY_TTL);

            boolean acquired = limiter.tryAcquire(1);
            if (acquired) {
                rateLimitHits.increment();
            } else {
                rateLimitMisses.increment();
                log.debug("Rate limit exceeded for endpoint: {} (limit: {}/sec)", endpointId, ratePerSecond);
            }
            return acquired;
        } catch (Exception e) {
            log.warn("Redis rate limiter unavailable, allowing request: {}", e.getMessage());
            rateLimitHits.increment();
            return true;
        }
    }

}
