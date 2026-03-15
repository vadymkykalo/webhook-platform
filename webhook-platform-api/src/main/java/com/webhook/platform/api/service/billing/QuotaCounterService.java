package com.webhook.platform.api.service.billing;

import com.webhook.platform.api.domain.repository.EventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RAtomicLong;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Redis-backed event counter for fast quota checks.
 * <p>
 * Key: {@code quota:events:{orgId}:{YYYY-MM}} → atomic long, TTL = end of next month.
 * <p>
 * On every event ingest → {@link #increment(UUID)}.
 * On quota check → {@link #getCurrentCount(UUID)}.
 * <p>
 * If Redis is down, falls back to DB COUNT (slow but correct).
 * If counter drifts (Redis restart), next {@link #getCurrentCount} re-seeds from DB.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class QuotaCounterService {

    private static final String KEY_PREFIX = "quota:events:";

    private final RedissonClient redissonClient;
    private final EventRepository eventRepository;

    /**
     * Increment event counter for organization. Called after event is persisted.
     * Fire-and-forget — if Redis is down, we just skip.
     */
    public void increment(UUID organizationId) {
        try {
            String key = currentKey(organizationId);
            RAtomicLong counter = redissonClient.getAtomicLong(key);
            long val = counter.incrementAndGet();
            // Set TTL on first increment (when counter transitions from 0→1)
            if (val == 1) {
                counter.expire(ttlForCurrentMonth());
            }
        } catch (Exception e) {
            log.debug("Redis quota increment failed for org={}, skipping: {}", organizationId, e.getMessage());
        }
    }

    /**
     * Get current event count for this month.
     * Reads from Redis if available; if key is missing (Redis restart),
     * seeds from DB and caches in Redis.
     * If Redis is fully down, falls back to DB COUNT.
     */
    public long getCurrentCount(UUID organizationId) {
        try {
            String key = currentKey(organizationId);
            RAtomicLong counter = redissonClient.getAtomicLong(key);
            long val = counter.get();
            if (val > 0) {
                return val;
            }
            // Key missing or zero — seed from DB
            long dbCount = countEventsFromDb(organizationId);
            if (dbCount > 0) {
                counter.set(dbCount);
                counter.expire(ttlForCurrentMonth());
            }
            return dbCount;
        } catch (Exception e) {
            log.debug("Redis quota read failed for org={}, falling back to DB: {}", organizationId, e.getMessage());
            return countEventsFromDb(organizationId);
        }
    }

    private long countEventsFromDb(UUID organizationId) {
        YearMonth ym = YearMonth.now(ZoneOffset.UTC);
        Instant monthStart = ym.atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant monthEnd = ym.plusMonths(1).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        return eventRepository.countByOrganizationIdAndCreatedAtBetween(organizationId, monthStart, monthEnd);
    }

    private String currentKey(UUID organizationId) {
        YearMonth ym = YearMonth.now(ZoneOffset.UTC);
        return KEY_PREFIX + organizationId + ":" + ym;
    }

    private Duration ttlForCurrentMonth() {
        // Expire at end of next month (buffer so we don't lose the key mid-month on edge)
        YearMonth ym = YearMonth.now(ZoneOffset.UTC);
        Instant expiry = ym.plusMonths(2).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        long seconds = Duration.between(Instant.now(), expiry).getSeconds();
        return Duration.ofSeconds(Math.max(seconds, 3600)); // at least 1 hour
    }
}
