package com.webhook.platform.worker.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RAtomicLong;
import org.redisson.api.RBucket;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.UUID;

/**
 * Redis-backed circuit breaker with shared state across all worker pods.
 *
 * State model (3 Redis keys per endpoint):
 *   cb:{id}:open  — marker key with TTL = waitDuration. EXISTS → OPEN, absent → CLOSED.
 *                    When TTL expires the circuit auto-transitions to CLOSED and new calls
 *                    act as "probes" (equivalent to HALF_OPEN). If failures recur the
 *                    circuit re-opens immediately.
 *   cb:{id}:fails — failure counter in the current evaluation window (TTL-based expiry).
 *   cb:{id}:calls — total-call counter in the current evaluation window.
 *
 * On Redis failure the breaker is fail-open (permits all calls).
 */
@Service
@Slf4j
public class CircuitBreakerService {

    private static final String KEY_PREFIX = "cb:";

    private final RedissonClient redissonClient;
    private final Counter stateTransitionCounter;
    private final Counter rejectedCounter;
    private final int failureRateThreshold;
    private final int minimumNumberOfCalls;
    private final int waitDurationSeconds;
    private final int windowTtlSeconds;

    public CircuitBreakerService(
            RedissonClient redissonClient,
            MeterRegistry meterRegistry,
            @Value("${circuit-breaker.failure-rate-threshold:50}") int failureRateThreshold,
            @Value("${circuit-breaker.minimum-calls:5}") int minimumNumberOfCalls,
            @Value("${circuit-breaker.wait-duration-seconds:30}") int waitDurationSeconds,
            @Value("${circuit-breaker.window-ttl-seconds:120}") int windowTtlSeconds) {
        this.redissonClient = redissonClient;
        this.failureRateThreshold = failureRateThreshold;
        this.minimumNumberOfCalls = minimumNumberOfCalls;
        this.waitDurationSeconds = waitDurationSeconds;
        this.windowTtlSeconds = windowTtlSeconds;

        this.stateTransitionCounter = Counter.builder("circuit_breaker_state_transitions_total")
                .description("Circuit breaker state transitions")
                .register(meterRegistry);
        this.rejectedCounter = Counter.builder("circuit_breaker_rejected_total")
                .description("Calls rejected by open circuit breaker")
                .register(meterRegistry);

        log.info("Redis circuit breaker initialized: failureRate={}%, minCalls={}, waitDuration={}s, windowTTL={}s",
                failureRateThreshold, minimumNumberOfCalls, waitDurationSeconds, windowTtlSeconds);
    }

    public boolean isCallPermitted(UUID endpointId) {
        try {
            RBucket<String> openBucket = redissonClient.getBucket(openKey(endpointId));
            if (openBucket.isExists()) {
                log.warn("CircuitBreaker OPEN for endpoint {}, rejecting call", endpointId);
                rejectedCounter.increment();
                return false;
            }
            return true;
        } catch (Exception e) {
            log.warn("Redis unavailable for circuit breaker check, permitting call for endpoint {}: {}",
                    endpointId, e.getMessage());
            return true;
        }
    }

    public void recordSuccess(UUID endpointId, long durationMs) {
        try {
            RAtomicLong calls = redissonClient.getAtomicLong(callsKey(endpointId));
            calls.incrementAndGet();
            calls.expire(Duration.ofSeconds(windowTtlSeconds));
        } catch (Exception e) {
            log.debug("Redis unavailable for circuit breaker success recording: {}", e.getMessage());
        }
    }

    public void recordFailure(UUID endpointId, Throwable throwable) {
        try {
            RAtomicLong fails = redissonClient.getAtomicLong(failsKey(endpointId));
            long failCount = fails.incrementAndGet();
            fails.expire(Duration.ofSeconds(windowTtlSeconds));

            RAtomicLong calls = redissonClient.getAtomicLong(callsKey(endpointId));
            long callCount = calls.incrementAndGet();
            calls.expire(Duration.ofSeconds(windowTtlSeconds));

            if (callCount >= minimumNumberOfCalls) {
                long failureRate = (failCount * 100) / callCount;
                if (failureRate >= failureRateThreshold) {
                    tripCircuit(endpointId, failureRate);
                }
            }
        } catch (Exception e) {
            log.debug("Redis unavailable for circuit breaker failure recording: {}", e.getMessage());
        }
    }

    public void reset(UUID endpointId) {
        try {
            redissonClient.getKeys().delete(
                    openKey(endpointId),
                    failsKey(endpointId),
                    callsKey(endpointId));
            log.info("Reset circuit breaker for endpoint: {}", endpointId);
        } catch (Exception e) {
            log.warn("Failed to reset circuit breaker for endpoint {}: {}", endpointId, e.getMessage());
        }
    }

    private void tripCircuit(UUID endpointId, long failureRate) {
        RBucket<String> openBucket = redissonClient.getBucket(openKey(endpointId));
        openBucket.set("1", Duration.ofSeconds(waitDurationSeconds));
        // Reset counters so the next evaluation window starts fresh after circuit reopens
        redissonClient.getKeys().delete(failsKey(endpointId), callsKey(endpointId));
        log.warn("CircuitBreaker OPENED for endpoint {} (failure rate: {}%, wait: {}s)",
                endpointId, failureRate, waitDurationSeconds);
        stateTransitionCounter.increment();
    }

    private String openKey(UUID endpointId) {
        return KEY_PREFIX + endpointId + ":open";
    }

    private String failsKey(UUID endpointId) {
        return KEY_PREFIX + endpointId + ":fails";
    }

    private String callsKey(UUID endpointId) {
        return KEY_PREFIX + endpointId + ":calls";
    }
}
