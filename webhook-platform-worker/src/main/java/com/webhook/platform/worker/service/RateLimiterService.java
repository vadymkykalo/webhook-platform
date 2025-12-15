package com.webhook.platform.worker.service;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
public class RateLimiterService {

    private final Map<UUID, Bucket> buckets = new ConcurrentHashMap<>();
    
    public boolean tryAcquire(UUID endpointId, Integer rateLimit) {
        if (rateLimit == null || rateLimit <= 0) {
            return true;
        }
        
        Bucket bucket = buckets.computeIfAbsent(endpointId, 
            id -> createBucket(rateLimit));
        
        return bucket.tryConsume(1);
    }
    
    private Bucket createBucket(int permitsPerSecond) {
        Bandwidth limit = Bandwidth.classic(permitsPerSecond, 
            Refill.intervally(permitsPerSecond, Duration.ofSeconds(1)));
        return Bucket.builder()
            .addLimit(limit)
            .build();
    }
    
    public void evictBucket(UUID endpointId) {
        buckets.remove(endpointId);
    }
}
