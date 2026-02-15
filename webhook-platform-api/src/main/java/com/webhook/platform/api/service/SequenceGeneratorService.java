package com.webhook.platform.api.service;

import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RAtomicLong;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Generates monotonically increasing sequence numbers per endpoint.
 * Used for FIFO ordering guarantees in webhook delivery.
 */
@Service
@Slf4j
public class SequenceGeneratorService {

    private static final String SEQUENCE_KEY_PREFIX = "seq:endpoint:";

    private final RedissonClient redissonClient;

    public SequenceGeneratorService(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    /**
     * Atomically increments and returns the next sequence number for an endpoint.
     * Thread-safe across multiple API instances.
     *
     * @param endpointId the endpoint ID
     * @return the next sequence number (starts from 1)
     */
    public long nextSequence(UUID endpointId) {
        String key = SEQUENCE_KEY_PREFIX + endpointId;
        RAtomicLong counter = redissonClient.getAtomicLong(key);
        long seq = counter.incrementAndGet();
        log.debug("Generated sequence {} for endpoint {}", seq, endpointId);
        return seq;
    }

    /**
     * Returns the current sequence number for an endpoint without incrementing.
     *
     * @param endpointId the endpoint ID
     * @return the current sequence number (0 if no events yet)
     */
    public long currentSequence(UUID endpointId) {
        String key = SEQUENCE_KEY_PREFIX + endpointId;
        RAtomicLong counter = redissonClient.getAtomicLong(key);
        return counter.get();
    }

    /**
     * Resets the sequence counter for an endpoint.
     * Use with caution - typically only for testing or endpoint recreation.
     *
     * @param endpointId the endpoint ID
     */
    public void resetSequence(UUID endpointId) {
        String key = SEQUENCE_KEY_PREFIX + endpointId;
        RAtomicLong counter = redissonClient.getAtomicLong(key);
        counter.set(0);
        log.info("Reset sequence counter for endpoint {}", endpointId);
    }
}
