package com.webhook.platform.worker.service;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RBucket;
import org.redisson.api.RScoredSortedSet;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Manages ordering buffer for FIFO delivery guarantees.
 * Tracks last delivered sequence per endpoint and buffers out-of-order deliveries.
 */
@Service
@Slf4j
public class OrderingBufferService {

    private static final String DELIVERED_SEQ_KEY_PREFIX = "seq:delivered:";
    private static final String BUFFER_KEY_PREFIX = "seq:buffer:";

    private final RedissonClient redissonClient;
    private final MeterRegistry meterRegistry;
    private final Duration gapTimeout;
    private final Duration deliveredSeqTtl;
    private final Duration bufferTtl;

    public OrderingBufferService(
            RedissonClient redissonClient,
            MeterRegistry meterRegistry,
            @Value("${ordering.gap-timeout-seconds:60}") int gapTimeoutSeconds,
            @Value("${ordering.delivered-seq-ttl-hours:24}") int deliveredSeqTtlHours,
            @Value("${ordering.buffer-ttl-minutes:10}") int bufferTtlMinutes) {
        this.redissonClient = redissonClient;
        this.meterRegistry = meterRegistry;
        this.gapTimeout = Duration.ofSeconds(gapTimeoutSeconds);
        this.deliveredSeqTtl = Duration.ofHours(deliveredSeqTtlHours);
        this.bufferTtl = Duration.ofMinutes(bufferTtlMinutes);
    }

    /**
     * Checks if a delivery with the given sequence can be delivered now.
     * Returns true if this is the next expected sequence.
     *
     * @param endpointId the endpoint ID
     * @param sequenceNumber the sequence number to check
     * @return true if delivery can proceed, false if it should be buffered
     */
    public boolean canDeliver(UUID endpointId, long sequenceNumber) {
        Long lastDelivered = getLastDeliveredSequence(endpointId);
        
        if (lastDelivered == null) {
            // First delivery for this endpoint - only allow seq=1
            return sequenceNumber == 1;
        }
        
        // Allow delivery only if this is the next expected sequence
        return sequenceNumber == lastDelivered + 1;
    }

    /**
     * Gets the last successfully delivered sequence number for an endpoint.
     *
     * @param endpointId the endpoint ID
     * @return the last delivered sequence, or null if none
     */
    public Long getLastDeliveredSequence(UUID endpointId) {
        String key = DELIVERED_SEQ_KEY_PREFIX + endpointId;
        RBucket<Long> bucket = redissonClient.getBucket(key);
        return bucket.get();
    }

    /**
     * Marks a sequence as successfully delivered.
     * This advances the "cursor" for the endpoint.
     *
     * @param endpointId the endpoint ID
     * @param sequenceNumber the delivered sequence number
     */
    public void markDelivered(UUID endpointId, long sequenceNumber) {
        String key = DELIVERED_SEQ_KEY_PREFIX + endpointId;
        RBucket<Long> bucket = redissonClient.getBucket(key);
        
        Long current = bucket.get();
        if (current == null || sequenceNumber > current) {
            bucket.set(sequenceNumber, deliveredSeqTtl);
            log.debug("Marked sequence {} as delivered for endpoint {}", sequenceNumber, endpointId);
            meterRegistry.counter("webhook_ordering_sequence_advanced").increment();
        }
    }

    /**
     * Adds a delivery to the waiting buffer.
     * Buffered deliveries are released when their preceding sequence is delivered.
     *
     * @param endpointId the endpoint ID
     * @param deliveryId the delivery ID to buffer
     * @param sequenceNumber the sequence number
     */
    public void bufferDelivery(UUID endpointId, UUID deliveryId, long sequenceNumber) {
        String key = BUFFER_KEY_PREFIX + endpointId;
        RScoredSortedSet<String> buffer = redissonClient.getScoredSortedSet(key);
        buffer.add(sequenceNumber, deliveryId.toString());
        buffer.expire(bufferTtl);
        
        int bufferSize = buffer.size();
        log.debug("Buffered delivery {} (seq={}) for endpoint {}, buffer size: {}", deliveryId, sequenceNumber, endpointId, bufferSize);
        if (bufferSize > 100) {
            log.warn("Ordering buffer growing large for endpoint {}: {} deliveries buffered", endpointId, bufferSize);
        }
        meterRegistry.counter("webhook_ordering_buffered_total").increment();
        meterRegistry.gauge("webhook_ordering_buffer_size", buffer, RScoredSortedSet::size);
    }

    /**
     * Gets deliveries that are ready for delivery after a sequence was delivered.
     * Returns deliveries with sequential sequence numbers starting from nextExpected.
     *
     * @param endpointId the endpoint ID
     * @return list of delivery IDs ready for delivery
     */
    public List<UUID> getReadyDeliveries(UUID endpointId) {
        Long lastDelivered = getLastDeliveredSequence(endpointId);
        long nextExpected = (lastDelivered == null) ? 1 : lastDelivered + 1;
        
        String key = BUFFER_KEY_PREFIX + endpointId;
        RScoredSortedSet<String> buffer = redissonClient.getScoredSortedSet(key);
        
        List<UUID> ready = new ArrayList<>();
        
        // Get deliveries with the next expected sequence
        Collection<String> entries = buffer.valueRange(nextExpected, true, nextExpected, true);
        for (String deliveryIdStr : entries) {
            ready.add(UUID.fromString(deliveryIdStr));
            buffer.remove(deliveryIdStr);
        }
        
        if (!ready.isEmpty()) {
            log.info("Released {} buffered deliveries for endpoint {} at seq {}", 
                    ready.size(), endpointId, nextExpected);
        }
        
        return ready;
    }

    /**
     * Checks if the gap timeout has been exceeded for a missing sequence.
     * If timeout exceeded, we should proceed with delivery and log a warning.
     *
     * @param oldestPendingCreatedAt when the oldest pending delivery was created
     * @return true if gap timeout exceeded
     */
    public boolean isGapTimedOut(Instant oldestPendingCreatedAt) {
        if (oldestPendingCreatedAt == null) {
            return true; // No pending deliveries, proceed
        }
        
        boolean timedOut = Duration.between(oldestPendingCreatedAt, Instant.now()).compareTo(gapTimeout) > 0;
        if (timedOut) {
            meterRegistry.counter("webhook_ordering_gap_timeout_total").increment();
        }
        return timedOut;
    }

    /**
     * Removes a delivery from the buffer (e.g., after successful delivery or DLQ).
     *
     * @param endpointId the endpoint ID
     * @param deliveryId the delivery ID to remove
     */
    public void removeFromBuffer(UUID endpointId, UUID deliveryId) {
        String key = BUFFER_KEY_PREFIX + endpointId;
        RScoredSortedSet<String> buffer = redissonClient.getScoredSortedSet(key);
        buffer.remove(deliveryId.toString());
    }

    /**
     * Gets the current buffer size for an endpoint.
     *
     * @param endpointId the endpoint ID
     * @return number of buffered deliveries
     */
    public int getBufferSize(UUID endpointId) {
        String key = BUFFER_KEY_PREFIX + endpointId;
        RScoredSortedSet<String> buffer = redissonClient.getScoredSortedSet(key);
        return buffer.size();
    }
}
