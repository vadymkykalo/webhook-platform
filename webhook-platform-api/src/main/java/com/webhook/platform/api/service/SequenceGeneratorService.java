package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.repository.DeliveryRepository;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RAtomicLong;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Generates monotonically increasing sequence numbers per endpoint.
 * Used for FIFO ordering guarantees in webhook delivery.
 *
 * <p>The counter itself lives in Redis (a bare {@code INCR} is cheap and fast on the ingest
 * hot path), but Redis is not durable: a flush, an eviction under {@code allkeys-lru}, or a
 * restore from an empty replica all silently reset it. Without a durable backing, that reset
 * makes new events get sequence 1, 2, 3... while {@code ordering_cursors} (Postgres, written
 * by the worker) already holds a much higher "last delivered" value — at which point
 * {@code canDeliver} never matches again and ordering is dead for that endpoint until an
 * operator manually intervenes. {@link #nextSequence} guards against that by
 * reseeding from the durable high-water mark — {@code MAX(sequence_number)} already persisted
 * in {@code deliveries} — the moment it notices the Redis key is gone.
 */
@Service
@Slf4j
public class SequenceGeneratorService {

    private static final String SEQUENCE_KEY_PREFIX = "seq:endpoint:";

    private final RedissonClient redissonClient;
    private final DeliveryRepository deliveryRepository;
    private final MeterRegistry meterRegistry;

    public SequenceGeneratorService(
            RedissonClient redissonClient,
            DeliveryRepository deliveryRepository,
            MeterRegistry meterRegistry) {
        this.redissonClient = redissonClient;
        this.deliveryRepository = deliveryRepository;
        this.meterRegistry = meterRegistry;
    }

    /**
     * Atomically increments and returns the next sequence number for an endpoint.
     * Thread-safe across multiple API instances.
     *
     * <p>Callers should generate this <strong>after</strong> the delivery it will be stamped
     * onto has been durably committed (see {@code EventIngestService
     * #assignSequenceNumbersPostCommit}) — never from inside the ingest transaction. Generating
     * it inside that transaction meant a rollback (including the {@code
     * DataIntegrityViolationException} idempotency-race path) silently burned a sequence
     * number that no delivery would ever carry.
     *
     * @param endpointId the endpoint ID
     * @return the next sequence number (starts from 1)
     */
    public long nextSequence(UUID endpointId) {
        String key = SEQUENCE_KEY_PREFIX + endpointId;
        RAtomicLong counter = redissonClient.getAtomicLong(key);
        reseedFromDurableHighWaterMarkIfMissing(counter, endpointId);
        long seq = counter.incrementAndGet();
        log.debug("Generated sequence {} for endpoint {}", seq, endpointId);
        return seq;
    }

    /**
     * Reseeds the Redis counter from the durable high-water mark if (and only if) the key is
     * currently absent — i.e. this is a cache miss, not the hot path. Redisson (like Redis's
     * own {@code INCR}) treats a missing key as value {@code 0}, so {@code compareAndSet(0,
     * seed)} is the atomic "set only if still absent/zero" primitive here: it only takes
     * effect if the key is still at its just-created default by the time it runs, so a
     * concurrent caller racing the same reseed can't stomp on a value another instance (or a
     * real request that got here first) already established.
     */
    private void reseedFromDurableHighWaterMarkIfMissing(RAtomicLong counter, UUID endpointId) {
        if (counter.isExists()) {
            return;
        }
        long seed = durableHighWaterMark(endpointId);
        if (seed <= 0) {
            return; // nothing to reseed from; incrementAndGet() starting at 1 is already correct
        }
        boolean seeded = counter.compareAndSet(0, seed);
        if (seeded) {
            log.warn("Sequence counter cache miss for endpoint {} — reseeded from durable high-water mark {}",
                    endpointId, seed);
            meterRegistry.counter("webhook_sequence_reseeded_total").increment();
        }
    }

    private long durableHighWaterMark(UUID endpointId) {
        Long max = deliveryRepository.findMaxSequenceNumber(endpointId);
        return max == null ? 0L : max;
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
     * Bumps the counter up to at least {@code minimum} if it is currently behind, via an
     * optimistic compare-and-set loop. Used by the periodic reconciliation job ({@code
     * SequenceReconciliationService}) to self-heal a desync it detects between the Redis
     * counter and the durable high-water mark, without ever moving the counter backwards.
     *
     * @param endpointId the endpoint ID
     * @param minimum the value the counter must be at least
     */
    public void reseedIfBehind(UUID endpointId, long minimum) {
        String key = SEQUENCE_KEY_PREFIX + endpointId;
        RAtomicLong counter = redissonClient.getAtomicLong(key);
        long current;
        int attempts = 0;
        do {
            current = counter.get();
            if (current >= minimum) {
                return;
            }
            attempts++;
        } while (!counter.compareAndSet(current, minimum) && attempts < 10);
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
