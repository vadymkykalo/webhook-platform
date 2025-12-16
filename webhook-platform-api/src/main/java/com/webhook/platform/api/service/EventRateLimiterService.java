package com.webhook.platform.api.service;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
public class EventRateLimiterService {

    private final Map<UUID, Bucket> buckets = new ConcurrentHashMap<>();
    private final int defaultRateLimit;

    public EventRateLimiterService(
            @Value("${event.ingestion.rate-limit-per-second:100}") int defaultRateLimit) {
        this.defaultRateLimit = defaultRateLimit;
    }

    public boolean tryAcquire(UUID projectId) {
        Bucket bucket = buckets.computeIfAbsent(projectId, 
            id -> createBucket(defaultRateLimit));
        
        boolean acquired = bucket.tryConsume(1);
        if (!acquired) {
            log.warn("Rate limit exceeded for project: {}", projectId);
        }
        return acquired;
    }

    public long getSecondsToWaitForRefill(UUID projectId) {
        Bucket bucket = buckets.get(projectId);
        if (bucket == null) {
            return 1;
        }
        return Math.max(1, bucket.tryConsumeAndReturnRemaining(0)
                .getNanosToWaitForRefill() / 1_000_000_000);
    }

    private Bucket createBucket(int permitsPerSecond) {
        Bandwidth limit = Bandwidth.classic(permitsPerSecond, 
            Refill.intervally(permitsPerSecond, Duration.ofSeconds(1)));
        return Bucket.builder()
            .addLimit(limit)
            .build();
    }

    public void evictBucket(UUID projectId) {
        buckets.remove(projectId);
    }
}
