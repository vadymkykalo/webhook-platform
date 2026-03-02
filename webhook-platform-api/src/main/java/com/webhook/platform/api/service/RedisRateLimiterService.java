package com.webhook.platform.api.service;

import com.webhook.platform.api.dto.RateLimitInfo;
import com.webhook.platform.api.dto.RateLimitResult;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
@Slf4j
public class RedisRateLimiterService {

    private static final String KEY_PREFIX = "rate_limiter:project:";
    private static final String SOURCE_KEY_PREFIX = "rate_limiter:source:";
    private static final Duration KEY_TTL = Duration.ofHours(24);

    private final RedissonClient redissonClient;
    private final int defaultRateLimit;
    private final Counter rateLimitHits;
    private final Counter rateLimitExceeded;
    private final Counter rateLimitFallback;

    /**
     * Local in-memory fallback rate limiters (Bucket4j) used when Redis is
     * unavailable.
     * Keyed by projectId to maintain per-project isolation.
     */
    private final ConcurrentMap<UUID, Bucket> localFallbackBuckets = new ConcurrentHashMap<>();

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
        this.rateLimitFallback = Counter.builder("api_rate_limit_fallback_total")
                .description("Number of requests rate-limited via local fallback (Redis unavailable)")
                .register(meterRegistry);
    }

    public boolean tryAcquire(UUID projectId) {
        return tryAcquire(projectId, defaultRateLimit);
    }

    public boolean tryAcquire(UUID projectId, int ratePerSecond) {
        return doTryAcquire(KEY_PREFIX + projectId, projectId, ratePerSecond);
    }

    public RateLimitResult tryAcquireWithInfo(UUID projectId) {
        return tryAcquireWithInfo(projectId, defaultRateLimit);
    }

    public RateLimitResult tryAcquireWithInfo(UUID projectId, int ratePerSecond) {
        try {
            String key = KEY_PREFIX + projectId;
            RRateLimiter limiter = redissonClient.getRateLimiter(key);
            limiter.trySetRate(RateType.OVERALL, ratePerSecond, 1, RateIntervalUnit.SECONDS);
            limiter.expire(KEY_TTL);

            boolean acquired = limiter.tryAcquire(1);
            long available = limiter.availablePermits();
            int remaining = (int) Math.max(0, Math.min(available, ratePerSecond));
            long resetTimestamp = Instant.now().plusSeconds(1).getEpochSecond();

            if (acquired) {
                rateLimitHits.increment();
            } else {
                rateLimitExceeded.increment();
                log.warn("Rate limit exceeded for project: {} (limit: {}/sec)", projectId, ratePerSecond);
            }

            RateLimitInfo info = RateLimitInfo.builder()
                    .limit(ratePerSecond)
                    .remaining(acquired ? remaining : 0)
                    .resetTimestamp(resetTimestamp)
                    .build();

            return RateLimitResult.builder()
                    .acquired(acquired)
                    .info(info)
                    .retryAfterSeconds(acquired ? 0 : 1)
                    .build();
        } catch (Exception e) {
            log.warn("Redis rate limiter unavailable, using local fallback for project {}: {}",
                    projectId, e.getMessage());
            rateLimitFallback.increment();
            boolean acquired = tryLocalFallback(projectId, ratePerSecond);
            RateLimitInfo info = RateLimitInfo.builder()
                    .limit(ratePerSecond)
                    .remaining(acquired ? ratePerSecond - 1 : 0)
                    .resetTimestamp(Instant.now().plusSeconds(1).getEpochSecond())
                    .build();
            return RateLimitResult.builder()
                    .acquired(acquired)
                    .info(info)
                    .retryAfterSeconds(acquired ? 0 : 1)
                    .build();
        }
    }

    public boolean tryAcquireForSource(UUID sourceId, int ratePerSecond) {
        return doTryAcquire(SOURCE_KEY_PREFIX + sourceId, sourceId, ratePerSecond);
    }

    private boolean doTryAcquire(String key, UUID id, int ratePerSecond) {
        try {
            RRateLimiter limiter = redissonClient.getRateLimiter(key);

            limiter.trySetRate(RateType.OVERALL, ratePerSecond, 1, RateIntervalUnit.SECONDS);
            limiter.expire(KEY_TTL);

            boolean acquired = limiter.tryAcquire(1);
            if (acquired) {
                rateLimitHits.increment();
            } else {
                rateLimitExceeded.increment();
                log.warn("Rate limit exceeded for id: {} (limit: {}/sec)", id, ratePerSecond);
            }
            return acquired;
        } catch (Exception e) {
            log.warn("Redis rate limiter unavailable, using local fallback for id {}: {}",
                    id, e.getMessage());
            rateLimitFallback.increment();
            return tryLocalFallback(id, ratePerSecond);
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
            log.debug("Unable to get rate limit info, returning conservative estimate: {}", e.getMessage());
            // Return worst-case estimate: assume limit is close to exhausted
            return RateLimitInfo.builder()
                    .limit(ratePerSecond)
                    .remaining(0)
                    .resetTimestamp(Instant.now().plusSeconds(1).getEpochSecond())
                    .build();
        }
    }

    /**
     * Local in-memory rate limiter fallback using Bucket4j.
     * Provides emergency throttling when Redis is unavailable.
     */
    private boolean tryLocalFallback(UUID projectId, int ratePerSecond) {
        Bucket bucket = localFallbackBuckets.computeIfAbsent(projectId,
                id -> Bucket.builder()
                        .addLimit(Bandwidth.builder()
                                .capacity(ratePerSecond)
                                .refillGreedy(ratePerSecond, Duration.ofSeconds(1))
                                .build())
                        .build());

        boolean acquired = bucket.tryConsume(1);
        if (acquired) {
            rateLimitHits.increment();
        } else {
            rateLimitExceeded.increment();
            log.warn("Local fallback rate limit exceeded for project: {} (limit: {}/sec)", projectId, ratePerSecond);
        }
        return acquired;
    }
}
