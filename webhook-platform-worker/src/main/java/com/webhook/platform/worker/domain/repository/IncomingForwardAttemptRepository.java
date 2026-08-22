package com.webhook.platform.worker.domain.repository;

import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.worker.domain.entity.IncomingForwardAttempt;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface IncomingForwardAttemptRepository extends JpaRepository<IncomingForwardAttempt, UUID> {

        List<IncomingForwardAttempt> findByIncomingEventIdAndDestinationIdOrderByAttemptNumberDesc(
                        UUID incomingEventId, UUID destinationId);

        @Query(value = """
                        SELECT id FROM (
                            SELECT id, ROW_NUMBER() OVER (PARTITION BY destination_id ORDER BY next_retry_at ASC) AS rn
                            FROM incoming_forward_attempts
                            WHERE status = :#{#status.name()} AND next_retry_at IS NOT NULL AND next_retry_at <= :now
                        ) sub WHERE rn <= :maxPerDest ORDER BY rn ASC LIMIT :limit
                        """, nativeQuery = true)
        List<UUID> findPendingRetryIds(@Param("status") ForwardAttemptStatus status,
                        @Param("now") Instant now,
                        @Param("limit") int limit,
                        @Param("maxPerDest") int maxPerDest);

        @Query(value = "SELECT * FROM incoming_forward_attempts WHERE id IN :ids ORDER BY next_retry_at ASC FOR UPDATE SKIP LOCKED",
                        nativeQuery = true)
        List<IncomingForwardAttempt> lockByIds(@Param("ids") List<UUID> ids);

        @Query("SELECT COALESCE(MAX(a.attemptNumber), 0) FROM IncomingForwardAttempt a " +
                        "WHERE a.incomingEventId = :eventId AND a.destinationId = :destinationId")
        int findMaxAttemptNumber(@Param("eventId") UUID eventId, @Param("destinationId") UUID destinationId);

        @Modifying
        @Query(value = "UPDATE incoming_forward_attempts SET status = 'PROCESSING', started_at = now() " +
                        "WHERE incoming_event_id = :eventId AND destination_id = :destinationId " +
                        "AND attempt_number = :attemptNumber AND status = 'PENDING'", nativeQuery = true)
        int claimForProcessing(@Param("eventId") UUID eventId,
                        @Param("destinationId") UUID destinationId,
                        @Param("attemptNumber") int attemptNumber);

        @Modifying
        @Query(value = "UPDATE incoming_forward_attempts SET status = 'PENDING', " +
                        "next_retry_at = now() " +
                        "WHERE status = 'PROCESSING' AND started_at < :threshold", nativeQuery = true)
        int resetStuckForwardAttempts(@Param("threshold") Instant threshold);

        /**
         * CAS claim for the retry path. IncomingForwardRetryScheduler already
         * transitioned the row PENDING -> PROCESSING and stamped {@code started_at} as a
         * fencing token before publishing the Kafka retry message; this bumps that token
         * again, but only if it still matches what the scheduler stamped. A duplicate
         * delivery of the same Kafka message races to match the now-stale token and
         * updates 0 rows, so only the first delivery proceeds to dispatch.
         */
        @Modifying
        @Query(value = "UPDATE incoming_forward_attempts SET started_at = now() " +
                        "WHERE incoming_event_id = :eventId AND destination_id = :destinationId " +
                        "AND attempt_number = :attemptNumber AND status = 'PROCESSING' " +
                        "AND started_at = :expectedStartedAt", nativeQuery = true)
        int claimRetryForProcessing(@Param("eventId") UUID eventId,
                        @Param("destinationId") UUID destinationId,
                        @Param("attemptNumber") int attemptNumber,
                        @Param("expectedStartedAt") Instant expectedStartedAt);

        /**
         * Age of the Forward obligation that has been outstanding longest, measured from when
         * the webhook arrived.
         *
         * <p>Not from the attempt row's own {@code created_at}: Incoming inserts a new row per
         * Attempt, so the newest row is freshly created even for a Forward that has been
         * grinding since yesterday. {@code incoming_events.received_at} is when the obligation
         * was actually taken on, and is the analogue of {@code deliveries.created_at} on the
         * Outgoing side.
         */
        @Query(value = """
                        SELECT MIN(e.received_at) FROM incoming_forward_attempts a
                        JOIN incoming_events e ON e.id = a.incoming_event_id
                        WHERE a.status = 'PENDING'
                        """, nativeQuery = true)
        Instant findOldestPendingReceivedAt();

        /**
         * PENDING Attempts whose Incoming Event arrived before the cutoff, oldest first.
         *
         * <p>{@code FOR UPDATE OF a SKIP LOCKED} because the caller publishes a DLQ
         * notification per row: without it two worker replicas would select the same rows and
         * each emit a duplicate notification for the same Forward. See ADR-0005.
         */
        @Query(value = """
                        SELECT a.id FROM incoming_forward_attempts a
                        JOIN incoming_events e ON e.id = a.incoming_event_id
                        WHERE a.status = 'PENDING' AND e.received_at < :cutoff
                        ORDER BY e.received_at ASC
                        LIMIT :limit
                        FOR UPDATE OF a SKIP LOCKED
                        """, nativeQuery = true)
        List<UUID> findStaleForwardAttemptIds(@Param("cutoff") Instant cutoff, @Param("limit") int limit);

        @Query("SELECT COUNT(a) FROM IncomingForwardAttempt a WHERE a.status = 'PENDING' AND a.createdAt > :since")
        long countPending(@Param("since") Instant since);

        @Query("SELECT COUNT(a) FROM IncomingForwardAttempt a WHERE a.status = 'PROCESSING' AND a.createdAt > :since")
        long countProcessing(@Param("since") Instant since);

        @Query("SELECT COUNT(a) FROM IncomingForwardAttempt a WHERE a.status = 'DLQ' AND a.createdAt > :since")
        long countDlq(@Param("since") Instant since);

        /**
         * All-time count of Forwards abandoned into DLQ -- i.e. the actionable Incoming
         * backlog, the counterpart of {@code DeliveryRepository#countDlqTotal()}. Used by
         * {@code DlqMonitoringService}. Unlike {@link #countDlq(Instant)} this is not windowed
         * by {@code createdAt}: a Forward that exhausted its retry ladder a week ago still
         * needs a human to decide about it, and a windowed count would quietly drop it out of
         * sight while it was still waiting.
         */
        @Query("SELECT COUNT(a) FROM IncomingForwardAttempt a WHERE a.status = 'DLQ'")
        long countDlqTotal();
}
