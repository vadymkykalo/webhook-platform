package com.webhook.platform.worker.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RPermitExpirableSemaphore;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

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
    private final int maxConcurrentPerEndpoint;
    private final Counter concurrencyAcquired;
    private final Counter concurrencyRejected;
    private final Counter concurrencyReleased;
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
            log.warn("Redis concurrency control unavailable, allowing request: {}", e.getMessage());
            concurrencyAcquired.increment();
            return true;
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
        }
    }

}
