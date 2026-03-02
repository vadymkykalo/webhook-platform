package com.webhook.platform.worker.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RPermitExpirableSemaphore;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Service
@Slf4j
public class RedisConcurrencyControlService {

    private static final String KEY_PREFIX = "concurrency:endpoint:";
    private static final Duration KEY_TTL = Duration.ofHours(24);

    private final RedissonClient redissonClient;
    private final ConcurrentHashMap<String, String> acquiredPermits = new ConcurrentHashMap<>();
    private final Cache<UUID, AtomicInteger> localPermits = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterAccess(Duration.ofMinutes(5))
            .build();
    private final int maxConcurrentPerEndpoint;
    private final Counter concurrencyAcquired;
    private final Counter concurrencyRejected;
    private final Counter concurrencyReleased;
    private final Counter concurrencyFallback;
    private final AtomicInteger activePermits = new AtomicInteger(0);

    public RedisConcurrencyControlService(
            RedissonClient redissonClient,
            MeterRegistry meterRegistry,
            @Value("${webhook.max-concurrent-per-endpoint:10}") int maxConcurrentPerEndpoint) {
        this.redissonClient = redissonClient;
        this.maxConcurrentPerEndpoint = maxConcurrentPerEndpoint;
        
        this.concurrencyAcquired = Counter.builder("webhook_concurrency_acquired_total")
                .description("Number of concurrency permits acquired")
                .register(meterRegistry);
        this.concurrencyRejected = Counter.builder("webhook_concurrency_rejected_total")
                .description("Number of concurrency permits rejected")
                .register(meterRegistry);
        this.concurrencyReleased = Counter.builder("webhook_concurrency_released_total")
                .description("Number of concurrency permits released")
                .register(meterRegistry);
        this.concurrencyFallback = Counter.builder("webhook_concurrency_fallback_total")
                .description("Number of concurrency checks via local fallback (Redis unavailable)")
                .register(meterRegistry);
        
        Gauge.builder("webhook_concurrency_active_permits", activePermits, AtomicInteger::get)
                .description("Number of currently held permits")
                .register(meterRegistry);
    }

    public boolean tryAcquire(UUID endpointId) {
        String key = KEY_PREFIX + endpointId;
        String threadKey = endpointId + ":" + Thread.currentThread().getId();
        
        try {
            RPermitExpirableSemaphore semaphore = redissonClient.getPermitExpirableSemaphore(key);
            semaphore.trySetPermits(maxConcurrentPerEndpoint);
            
            String permitId = semaphore.tryAcquire(100, TimeUnit.MILLISECONDS);
            if (permitId != null) {
                acquiredPermits.put(threadKey, permitId);
                semaphore.expire(KEY_TTL);
                activePermits.incrementAndGet();
                concurrencyAcquired.increment();
                return true;
            }
            
            concurrencyRejected.increment();
            log.debug("Concurrency limit reached for endpoint: {} (max: {})", endpointId, maxConcurrentPerEndpoint);
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted while acquiring permit for endpoint: {}", endpointId);
            return false;
        } catch (Exception e) {
            log.warn("Redis concurrency control unavailable for endpoint {}, using local fallback: {}",
                    endpointId, e.getMessage());
            concurrencyFallback.increment();
            return tryAcquireLocal(endpointId);
        }
    }

    private boolean tryAcquireLocal(UUID endpointId) {
        AtomicInteger permits = localPermits.get(endpointId, k -> new AtomicInteger(0));
        int current = permits.incrementAndGet();
        if (current <= maxConcurrentPerEndpoint) {
            activePermits.incrementAndGet();
            concurrencyAcquired.increment();
            return true;
        }
        permits.decrementAndGet();
        concurrencyRejected.increment();
        log.debug("Local concurrency limit reached for endpoint: {} (max: {})", endpointId, maxConcurrentPerEndpoint);
        return false;
    }

    private void releaseLocal(UUID endpointId) {
        AtomicInteger permits = localPermits.getIfPresent(endpointId);
        if (permits != null) {
            permits.decrementAndGet();
        }
    }

    public void release(UUID endpointId) {
        String key = KEY_PREFIX + endpointId;
        String threadKey = endpointId + ":" + Thread.currentThread().getId();
        
        String permitId = acquiredPermits.remove(threadKey);
        if (permitId != null) {
            try {
                RPermitExpirableSemaphore semaphore = redissonClient.getPermitExpirableSemaphore(key);
                semaphore.release(permitId);
                activePermits.decrementAndGet();
                concurrencyReleased.increment();
            } catch (Exception e) {
                log.warn("Failed to release permit for endpoint {}: {}", endpointId, e.getMessage());
                activePermits.decrementAndGet();
            }
        } else {
            releaseLocal(endpointId);
            activePermits.decrementAndGet();
            concurrencyReleased.increment();
        }
    }

}
