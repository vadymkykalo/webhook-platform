package com.webhook.platform.worker.service;

import com.webhook.platform.worker.domain.repository.OrderingCursorRepository;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RBucket;
import org.redisson.api.RScoredSortedSet;
import org.redisson.api.RScript;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.LongCodec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Manages ordering buffer for FIFO delivery guarantees.
 * Tracks last delivered sequence per endpoint and buffers out-of-order deliveries.
 * Uses Redis as cache (24h TTL) with Postgres as durable fallback.
 */
@Service
@Slf4j
public class OrderingBufferService {

    private static final String DELIVERED_SEQ_KEY_PREFIX = "seq:delivered:";
    private static final String BUFFER_KEY_PREFIX = "seq:buffer:";
    private static final String BUFFER_KEY_PATTERN = BUFFER_KEY_PREFIX + "*";

    private final RedissonClient redissonClient;
    private final OrderingCursorRepository cursorRepository;
    private final MeterRegistry meterRegistry;
    private final Duration gapTimeout;
    private final Duration deliveredSeqTtl;
    private final Duration bufferTtl;
    private final String cursorCasScript;
    // P1-26: webhook_ordering_buffer_size used to be registered with meterRegistry.gauge(...)
    // (no tags) on every single bufferDelivery() call. Micrometer silently keeps only the
    // first-registered meter for a given unregistered-tag name, so every call after the very
    // first endpoint's first buffered delivery was a no-op -- the gauge permanently reported
    // whichever endpoint's RScoredSortedSet got there first, no matter how many other
    // endpoints buffered deliveries afterward. Registered exactly once here instead, backed by
    // a periodically Redis-truth-resynced aggregate (see resyncBufferSizeGauge) rather than a
    // manually incremented/decremented counter -- buffer entries can also disappear via TTL
    // expiry or the gap-timeout "proceed anyway" path without an explicit remove call, so only
    // a resync against Redis itself stays honest.
    private final AtomicLong totalBufferedDeliveries = new AtomicLong(0);

    public OrderingBufferService(
            RedissonClient redissonClient,
            OrderingCursorRepository cursorRepository,
            MeterRegistry meterRegistry,
            @Value("${ordering.gap-timeout-seconds:60}") int gapTimeoutSeconds,
            @Value("${ordering.delivered-seq-ttl-hours:24}") int deliveredSeqTtlHours,
            @Value("${ordering.buffer-ttl-minutes:10}") int bufferTtlMinutes) {
        this.redissonClient = redissonClient;
        this.cursorRepository = cursorRepository;
        this.meterRegistry = meterRegistry;
        this.gapTimeout = Duration.ofSeconds(gapTimeoutSeconds);
        this.deliveredSeqTtl = Duration.ofHours(deliveredSeqTtlHours);
        this.bufferTtl = Duration.ofMinutes(bufferTtlMinutes);
        this.cursorCasScript = loadLuaScript("lua/ordering_cursor_cas.lua");

        Gauge.builder("webhook_ordering_buffer_size", totalBufferedDeliveries, AtomicLong::get)
                .description("Total deliveries currently buffered awaiting their predecessor sequence, summed across all endpoints")
                .register(meterRegistry);
    }

    /**
     * Recomputes {@code webhook_ordering_buffer_size} from Redis directly, by summing the
     * size of every per-endpoint buffer key. Deliberately aggregated rather than tagged by
     * endpoint -- endpoint UUIDs are unbounded cardinality, and an untagged-but-still-per-
     * endpoint gauge is exactly the bug this replaces (see the class-level comment on {@code
     * totalBufferedDeliveries}). {@code getKeysByPattern} is SCAN-based (non-blocking), so this
     * is safe to run periodically even against a large keyspace.
     */
    @Scheduled(fixedDelayString = "${ordering.buffer-gauge-resync-ms:30000}")
    public void resyncBufferSizeGauge() {
        try {
            long total = 0;
            for (String key : redissonClient.getKeys().getKeysByPattern(BUFFER_KEY_PATTERN)) {
                total += redissonClient.getScoredSortedSet(key).size();
            }
            totalBufferedDeliveries.set(total);
        } catch (Exception e) {
            log.warn("Failed to resync webhook_ordering_buffer_size gauge: {}", e.getMessage());
        }
    }

    private String loadLuaScript(String path) {
        try {
            ClassPathResource resource = new ClassPathResource(path);
            return new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("Failed to load Lua script: " + path, e);
        }
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
     * Checks Redis first (cache), falls back to Postgres if TTL expired.
     *
     * @param endpointId the endpoint ID
     * @return the last delivered sequence, or null if none
     */
    public Long getLastDeliveredSequence(UUID endpointId) {
        String key = DELIVERED_SEQ_KEY_PREFIX + endpointId;
        // LongCodec so this key's value on the wire is a plain decimal string -- exactly what
        // the CAS Lua script in markDelivered() writes via a raw Redis SET. Reading it back
        // with Redisson's default (Kryo) codec would fail to decode a value the script wrote,
        // and vice versa; every accessor of this key must agree on one codec.
        RBucket<Long> bucket = redissonClient.getBucket(key, LongCodec.INSTANCE);
        Long fromRedis = bucket.get();
        
        if (fromRedis != null) {
            return fromRedis;
        }
        
        // Redis cache miss - check Postgres
        try {
            return cursorRepository.findById(endpointId)
                    .map(cursor -> {
                        // Warm Redis cache from DB
                        bucket.set(cursor.getLastDeliveredSequence(), deliveredSeqTtl);
                        log.debug("Warmed Redis cache from DB for endpoint {}: seq={}", 
                                endpointId, cursor.getLastDeliveredSequence());
                        meterRegistry.counter("webhook_ordering_cache_miss_total").increment();
                        return cursor.getLastDeliveredSequence();
                    })
                    .orElse(null);
        } catch (Exception e) {
            log.warn("Failed to query ordering cursor from DB for endpoint {}: {}", 
                    endpointId, e.getMessage());
            return null;
        }
    }

    /**
     * Marks a sequence as successfully delivered.
     * This advances the "cursor" for the endpoint in both Postgres (durable, authoritative)
     * and Redis (cache).
     *
     * <p>Postgres is authoritative: the upsert always applies {@code GREATEST} and always
     * returns the resulting row via {@code RETURNING} (see {@link OrderingCursorRepository
     * #upsertCursor}), so it can never regress. Redis is then updated from that authoritative
     * value — never from the raw {@code sequenceNumber} argument — via a Lua CAS script that
     * only advances the key if the candidate is strictly greater than whatever is currently
     * cached. That combination is what makes this regression-proof: even if Redis was flushed
     * or its TTL lapsed and some other caller raced a smaller value in first, the cache can
     * only ever converge upward towards Postgres's value, never fall behind it.
     *
     * @param endpointId the endpoint ID
     * @param sequenceNumber the delivered sequence number
     */
    @Transactional
    public void markDelivered(UUID endpointId, long sequenceNumber) {
        long authoritative;
        boolean postgresWriteFailed = false;
        try {
            authoritative = cursorRepository.upsertCursor(endpointId, sequenceNumber);
        } catch (Exception e) {
            log.error("Failed to persist ordering cursor to DB for endpoint {}, seq={}: {}",
                    endpointId, sequenceNumber, e.getMessage());
            // Postgres is authoritative; if we can't reach it, fall back to advancing Redis
            // from the raw sequence number as a best-effort measure so the endpoint doesn't
            // stall completely, but this window is where a regression could theoretically
            // still occur — hence the loud log above rather than a silent swallow.
            authoritative = sequenceNumber;
            postgresWriteFailed = true;
        }

        String key = DELIVERED_SEQ_KEY_PREFIX + endpointId;
        RScript script = redissonClient.getScript(LongCodec.INSTANCE);
        Long advanced = script.eval(
                RScript.Mode.READ_WRITE,
                cursorCasScript,
                RScript.ReturnType.INTEGER,
                Collections.singletonList(key),
                authoritative,
                deliveredSeqTtl.toMillis());

        if (advanced != null && advanced == 1L) {
            log.debug("Marked sequence {} as delivered for endpoint {} (authoritative={})",
                    sequenceNumber, endpointId, authoritative);
            meterRegistry.counter("webhook_ordering_sequence_advanced").increment();
        }
        if (postgresWriteFailed) {
            meterRegistry.counter("webhook_ordering_cursor_db_write_failed_total").increment();
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
     * Checks if the gap timeout has been exceeded for a delivery blocked on a missing
     * predecessor sequence.
     *
     * <p>Measured from when the blocked delivery was <em>first buffered</em> (see {@code
     * Delivery#orderingFirstBufferedAt}), not from an unrelated row's ingest {@code
     * createdAt}. That distinction matters: measuring from {@code createdAt} meant any
     * backlog older than the timeout made this unconditionally {@code true} for every
     * delivery — silently turning ordering off during a fan-out burst or Kafka lag spike,
     * exactly when it matters most (P1-23 / 23b).
     *
     * <p>Callers do not increment a metric here — see {@code
     * WebhookDeliveryService#canDeliverWithOrdering} for the single counting site, to avoid
     * double-counting {@code webhook_ordering_gap_timeout_total}.
     *
     * @param firstBufferedAt when this delivery first entered the ordering buffer, or null if
     *                        it has never been buffered (i.e. we haven't started waiting yet)
     * @return true if the delivery has been waiting longer than the configured gap timeout
     */
    public boolean isGapTimedOut(Instant firstBufferedAt) {
        if (firstBufferedAt == null) {
            return false; // Never buffered before -- we haven't started waiting yet.
        }
        return Duration.between(firstBufferedAt, Instant.now()).compareTo(gapTimeout) > 0;
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
