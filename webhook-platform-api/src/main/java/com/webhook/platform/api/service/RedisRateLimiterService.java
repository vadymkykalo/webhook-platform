package com.webhook.platform.api.service;

import com.webhook.platform.api.dto.RateLimitInfo;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RRateLimiter;
import org.redisson.api.RateIntervalUnit;
import org.redisson.api.RateType;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Service
@Slf4j
public class RedisRateLimiterService {

    private static final String KEY_PREFIX = "rate_limiter:project:";
    private static final Duration KEY_TTL = Duration.ofHours(24);

    private final RedissonClient redissonClient;
    private final int defaultRateLimit;
    private final Counter rateLimitHits;
    private final Counter rateLimitExceeded;

    public RedisRateLimiterService(
            RedissonClient redissonClient,
            MeterRegistry meterRegistry,
            @Value("${event.ingestion.rate-limit-per-second:100}") int defaultRateLimit) {
        this.redissonClient = redissonClient;
        this.defaultRateLimit = defaultRateLimit;
        
        this.rateLimitHits = Counter.builder("api_rate_limit_hits_total")
                .description("Number of requests that passed rate limiting")
                .register(meterRegistry);
        this.rateLimitExceeded = Counter.builder("api_rate_limit_exceeded_total")
                .description("Number of requests rejected by rate limiting")
                .register(meterRegistry);
    }

    public boolean tryAcquire(UUID projectId) {
        return tryAcquire(projectId, defaultRateLimit);
    }

    public boolean tryAcquire(UUID projectId, int ratePerSecond) {
        try {
            String key = KEY_PREFIX + projectId;
            RRateLimiter limiter = redissonClient.getRateLimiter(key);
            
            limiter.trySetRate(RateType.OVERALL, ratePerSecond, 1, RateIntervalUnit.SECONDS);
            limiter.expire(KEY_TTL);

            boolean acquired = limiter.tryAcquire(1);
            if (acquired) {
                rateLimitHits.increment();
            } else {
                rateLimitExceeded.increment();
                log.warn("Rate limit exceeded for project: {} (limit: {}/sec)", projectId, ratePerSecond);
            }
            return acquired;
        } catch (Exception e) {
            log.warn("Redis rate limiter unavailable, allowing request: {}", e.getMessage());
            rateLimitHits.increment();
            return true;
        }
    }

    public long getSecondsToWaitForRefill(UUID projectId) {
        try {
            String key = KEY_PREFIX + projectId;
            RRateLimiter limiter = redissonClient.getRateLimiter(key);
            return Math.max(1, limiter.availablePermits() > 0 ? 0 : 1);
        } catch (Exception e) {
            return 1;
        }
    }

    public RateLimitInfo getRateLimitInfo(UUID projectId) {
        return getRateLimitInfo(projectId, defaultRateLimit);
    }

    public RateLimitInfo getRateLimitInfo(UUID projectId, int ratePerSecond) {
        try {
            String key = KEY_PREFIX + projectId;
            RRateLimiter limiter = redissonClient.getRateLimiter(key);
            long available = limiter.availablePermits();
            int remaining = (int) Math.max(0, Math.min(available, ratePerSecond));
            long resetTimestamp = Instant.now().plusSeconds(1).getEpochSecond();
            
            return RateLimitInfo.builder()
                    .limit(ratePerSecond)
                    .remaining(remaining)
                    .resetTimestamp(resetTimestamp)
                    .build();
        } catch (Exception e) {
            log.debug("Unable to get rate limit info: {}", e.getMessage());
            return RateLimitInfo.builder()
                    .limit(ratePerSecond)
                    .remaining(ratePerSecond)
                    .resetTimestamp(Instant.now().plusSeconds(1).getEpochSecond())
                    .build();
        }
    }

}
