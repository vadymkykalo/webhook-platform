package com.webhook.platform.worker.service;

import com.webhook.platform.worker.domain.entity.OrderingCursor;
import com.webhook.platform.worker.domain.repository.OrderingCursorRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.redisson.api.RBucket;
import org.redisson.api.RScoredSortedSet;
import org.redisson.api.RedissonClient;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit coverage for OrderingBufferService (P1-22): buffering, cursor advance (Redis
 * cache + Postgres durable fallback), gap timeout, and buffer release ordering.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OrderingBufferServiceTest {

    @Mock
    private RedissonClient redissonClient;
    @Mock
    private OrderingCursorRepository cursorRepository;

    private OrderingBufferService service;

    private static final int GAP_TIMEOUT_SECONDS = 60;

    @BeforeEach
    void setUp() {
        service = new OrderingBufferService(redissonClient, cursorRepository, new SimpleMeterRegistry(),
                GAP_TIMEOUT_SECONDS, 24, 10);
    }

    @SuppressWarnings("unchecked")
    private RBucket<Long> bucketFor(UUID endpointId) {
        RBucket<Long> bucket = mock(RBucket.class);
        when(redissonClient.<Long>getBucket(eq("seq:delivered:" + endpointId))).thenReturn(bucket);
        return bucket;
    }

    @SuppressWarnings("unchecked")
    private RScoredSortedSet<String> bufferFor(UUID endpointId) {
        RScoredSortedSet<String> buffer = mock(RScoredSortedSet.class);
        when(redissonClient.<String>getScoredSortedSet(eq("seq:buffer:" + endpointId))).thenReturn(buffer);
        return buffer;
    }

    // --- canDeliver ----------------------------------------------------------------------

    @Test
    void canDeliver_noPriorDelivery_onlyAllowsSequenceOne() {
        UUID endpointId = UUID.randomUUID();
        RBucket<Long> bucket = bucketFor(endpointId);
        when(bucket.get()).thenReturn(null);
        when(cursorRepository.findById(endpointId)).thenReturn(Optional.empty());

        assertTrue(service.canDeliver(endpointId, 1));
        assertFalse(service.canDeliver(endpointId, 2));
    }

    @Test
    void canDeliver_afterSequenceFive_onlyAllowsSix() {
        UUID endpointId = UUID.randomUUID();
        RBucket<Long> bucket = bucketFor(endpointId);
        when(bucket.get()).thenReturn(5L);

        assertTrue(service.canDeliver(endpointId, 6));
        assertFalse(service.canDeliver(endpointId, 7));
        assertFalse(service.canDeliver(endpointId, 5));
    }

    // --- getLastDeliveredSequence: Redis cache vs Postgres fallback ------------------------

    @Test
    void getLastDeliveredSequence_redisHit_doesNotTouchPostgres() {
        UUID endpointId = UUID.randomUUID();
        RBucket<Long> bucket = bucketFor(endpointId);
        when(bucket.get()).thenReturn(42L);

        Long result = service.getLastDeliveredSequence(endpointId);

        assertEquals(42L, result);
        verify(cursorRepository, never()).findById(any());
    }

    @Test
    void getLastDeliveredSequence_redisMiss_fallsBackToPostgresAndWarmsCache() {
        UUID endpointId = UUID.randomUUID();
        RBucket<Long> bucket = bucketFor(endpointId);
        when(bucket.get()).thenReturn(null);
        OrderingCursor cursor = OrderingCursor.builder()
                .endpointId(endpointId).lastDeliveredSequence(7L).updatedAt(Instant.now()).build();
        when(cursorRepository.findById(endpointId)).thenReturn(Optional.of(cursor));

        Long result = service.getLastDeliveredSequence(endpointId);

        assertEquals(7L, result);
        verify(bucket).set(eq(7L), eq(Duration.ofHours(24)));
    }

    @Test
    void getLastDeliveredSequence_redisMissAndNoCursorRow_returnsNull() {
        UUID endpointId = UUID.randomUUID();
        RBucket<Long> bucket = bucketFor(endpointId);
        when(bucket.get()).thenReturn(null);
        when(cursorRepository.findById(endpointId)).thenReturn(Optional.empty());

        assertEquals(null, service.getLastDeliveredSequence(endpointId));
    }

    @Test
    void getLastDeliveredSequence_postgresThrows_failsOpenReturningNull() {
        UUID endpointId = UUID.randomUUID();
        RBucket<Long> bucket = bucketFor(endpointId);
        when(bucket.get()).thenReturn(null);
        when(cursorRepository.findById(endpointId)).thenThrow(new RuntimeException("DB unavailable"));

        assertEquals(null, service.getLastDeliveredSequence(endpointId));
    }

    // --- markDelivered: only advances forward ----------------------------------------------

    @Test
    void markDelivered_noPriorValue_setsRedisAndPersistsCursor() {
        UUID endpointId = UUID.randomUUID();
        RBucket<Long> bucket = bucketFor(endpointId);
        when(bucket.get()).thenReturn(null);

        service.markDelivered(endpointId, 3L);

        verify(bucket).set(eq(3L), eq(Duration.ofHours(24)));
        verify(cursorRepository).upsertCursor(endpointId, 3L);
    }

    @Test
    void markDelivered_sequenceAdvances_updatesBoth() {
        UUID endpointId = UUID.randomUUID();
        RBucket<Long> bucket = bucketFor(endpointId);
        when(bucket.get()).thenReturn(3L);

        service.markDelivered(endpointId, 4L);

        verify(bucket).set(eq(4L), eq(Duration.ofHours(24)));
        verify(cursorRepository).upsertCursor(endpointId, 4L);
    }

    @Test
    void markDelivered_sequenceDoesNotAdvance_isNoOp() {
        UUID endpointId = UUID.randomUUID();
        RBucket<Long> bucket = bucketFor(endpointId);
        when(bucket.get()).thenReturn(5L);

        service.markDelivered(endpointId, 5L);
        service.markDelivered(endpointId, 4L);

        verify(bucket, never()).set(any(), any());
        verify(cursorRepository, never()).upsertCursor(any(), org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void markDelivered_postgresUpsertFails_redisStillUpdated_doesNotThrow() {
        UUID endpointId = UUID.randomUUID();
        RBucket<Long> bucket = bucketFor(endpointId);
        when(bucket.get()).thenReturn(null);
        org.mockito.Mockito.doThrow(new RuntimeException("DB down")).when(cursorRepository)
                .upsertCursor(any(), org.mockito.ArgumentMatchers.anyLong());

        // Must not throw even though the durable write failed -- Redis is the fast path,
        // Postgres failure here is best-effort and logged.
        service.markDelivered(endpointId, 1L);

        verify(bucket).set(eq(1L), eq(Duration.ofHours(24)));
    }

    // --- bufferDelivery / getReadyDeliveries ------------------------------------------------

    @Test
    void bufferDelivery_addsToScoredSet() {
        UUID endpointId = UUID.randomUUID();
        UUID deliveryId = UUID.randomUUID();
        RScoredSortedSet<String> buffer = bufferFor(endpointId);
        when(buffer.size()).thenReturn(1);

        service.bufferDelivery(endpointId, deliveryId, 5L);

        verify(buffer).add(5.0, deliveryId.toString());
        verify(buffer).expire(Duration.ofMinutes(10));
    }

    @Test
    void getReadyDeliveries_releasesOnlyNextExpectedSequence() {
        UUID endpointId = UUID.randomUUID();
        UUID readyId = UUID.randomUUID();
        RBucket<Long> bucket = bucketFor(endpointId);
        when(bucket.get()).thenReturn(3L); // last delivered = 3, next expected = 4
        RScoredSortedSet<String> buffer = bufferFor(endpointId);
        when(buffer.valueRange(4L, true, 4L, true)).thenReturn(List.of(readyId.toString()));

        List<UUID> ready = service.getReadyDeliveries(endpointId);

        assertEquals(List.of(readyId), ready);
        verify(buffer).remove(readyId.toString());
    }

    @Test
    void getReadyDeliveries_nothingBuffered_returnsEmpty() {
        UUID endpointId = UUID.randomUUID();
        RBucket<Long> bucket = bucketFor(endpointId);
        when(bucket.get()).thenReturn(null); // next expected = 1
        RScoredSortedSet<String> buffer = bufferFor(endpointId);
        when(buffer.valueRange(1L, true, 1L, true)).thenReturn(List.<String>of());

        List<UUID> ready = service.getReadyDeliveries(endpointId);

        assertTrue(ready.isEmpty());
        verify(buffer, never()).remove(any());
    }

    @Test
    void removeFromBuffer_removesGivenDeliveryId() {
        UUID endpointId = UUID.randomUUID();
        UUID deliveryId = UUID.randomUUID();
        RScoredSortedSet<String> buffer = bufferFor(endpointId);

        service.removeFromBuffer(endpointId, deliveryId);

        verify(buffer).remove(deliveryId.toString());
    }

    // --- isGapTimedOut -----------------------------------------------------------------------

    @Test
    void isGapTimedOut_noOldestPending_treatedAsTimedOut() {
        assertTrue(service.isGapTimedOut(null));
    }

    @Test
    void isGapTimedOut_recentPending_notTimedOut() {
        assertFalse(service.isGapTimedOut(Instant.now().minusSeconds(GAP_TIMEOUT_SECONDS - 30)));
    }

    @Test
    void isGapTimedOut_oldPending_isTimedOut() {
        assertTrue(service.isGapTimedOut(Instant.now().minusSeconds(GAP_TIMEOUT_SECONDS + 30)));
    }
}
