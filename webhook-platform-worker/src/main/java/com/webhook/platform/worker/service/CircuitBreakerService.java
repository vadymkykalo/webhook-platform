package com.webhook.platform.worker.service;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
@Slf4j
public class CircuitBreakerService {

    private final CircuitBreakerRegistry circuitBreakerRegistry;
    private final ConcurrentMap<UUID, CircuitBreaker> endpointBreakers = new ConcurrentHashMap<>();
    private final MeterRegistry meterRegistry;

    public CircuitBreakerService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        
        CircuitBreakerConfig defaultConfig = CircuitBreakerConfig.custom()
                .failureRateThreshold(50)
                .slowCallRateThreshold(80)
                .slowCallDurationThreshold(Duration.ofSeconds(10))
                .waitDurationInOpenState(Duration.ofSeconds(30))
                .permittedNumberOfCallsInHalfOpenState(3)
                .minimumNumberOfCalls(5)
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
                .slidingWindowSize(10)
                .build();
        
        this.circuitBreakerRegistry = CircuitBreakerRegistry.of(defaultConfig);
    }

    public CircuitBreaker getCircuitBreaker(UUID endpointId) {
        return endpointBreakers.computeIfAbsent(endpointId, id -> {
            String name = "endpoint-" + id.toString().substring(0, 8);
            CircuitBreaker breaker = circuitBreakerRegistry.circuitBreaker(name);
            
            breaker.getEventPublisher()
                    .onStateTransition(event -> {
                        log.warn("CircuitBreaker {} state transition: {} -> {}",
                                name,
                                event.getStateTransition().getFromState(),
                                event.getStateTransition().getToState());
                        
                        meterRegistry.counter("circuit_breaker_state_transitions_total",
                                "endpoint", name,
                                "from", event.getStateTransition().getFromState().name(),
                                "to", event.getStateTransition().getToState().name()
                        ).increment();
                    })
                    .onError(event -> {
                        log.debug("CircuitBreaker {} recorded error: {}",
                                name, event.getThrowable().getMessage());
                    });
            
            log.info("Created CircuitBreaker for endpoint: {}", endpointId);
            return breaker;
        });
    }

    public boolean isCallPermitted(UUID endpointId) {
        CircuitBreaker breaker = getCircuitBreaker(endpointId);
        boolean permitted = breaker.tryAcquirePermission();
        
        if (!permitted) {
            log.warn("CircuitBreaker OPEN for endpoint {}, rejecting call", endpointId);
            meterRegistry.counter("circuit_breaker_rejected_total",
                    "endpoint", "endpoint-" + endpointId.toString().substring(0, 8)
            ).increment();
        }
        
        return permitted;
    }

    public void recordSuccess(UUID endpointId, long durationMs) {
        CircuitBreaker breaker = getCircuitBreaker(endpointId);
        breaker.onSuccess(durationMs, java.util.concurrent.TimeUnit.MILLISECONDS);
    }

    public void recordFailure(UUID endpointId, Throwable throwable) {
        CircuitBreaker breaker = getCircuitBreaker(endpointId);
        breaker.onError(0, java.util.concurrent.TimeUnit.MILLISECONDS, throwable);
    }

    public CircuitBreaker.State getState(UUID endpointId) {
        return getCircuitBreaker(endpointId).getState();
    }

    public void reset(UUID endpointId) {
        CircuitBreaker breaker = endpointBreakers.get(endpointId);
        if (breaker != null) {
            breaker.reset();
            log.info("Reset CircuitBreaker for endpoint: {}", endpointId);
        }
    }
}
