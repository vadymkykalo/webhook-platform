package com.webhook.platform.worker.domain.repository;

import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.worker.domain.entity.IncomingForwardAttempt;
import org.springframework.data.domain.PageRequest;
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

    @Query(value = "SELECT * FROM incoming_forward_attempts WHERE status = :#{#status.name()} AND next_retry_at <= :now " +
            "ORDER BY next_retry_at ASC LIMIT :limit FOR UPDATE SKIP LOCKED",
            nativeQuery = true)
    List<IncomingForwardAttempt> findPendingRetriesForUpdate(@Param("status") ForwardAttemptStatus status,
                                                             @Param("now") Instant now,
                                                             @Param("limit") int limit);

    @Query("SELECT COALESCE(MAX(a.attemptNumber), 0) FROM IncomingForwardAttempt a " +
            "WHERE a.incomingEventId = :eventId AND a.destinationId = :destinationId")
    int findMaxAttemptNumber(@Param("eventId") UUID eventId, @Param("destinationId") UUID destinationId);

    @Modifying
    @Query(value = "UPDATE incoming_forward_attempts SET status = 'PENDING', " +
            "next_retry_at = now() " +
            "WHERE status = 'PROCESSING' AND started_at < :threshold",
            nativeQuery = true)
    int resetStuckForwardAttempts(@Param("threshold") Instant threshold);

    @Query("SELECT COUNT(a) FROM IncomingForwardAttempt a WHERE a.status = 'PENDING' AND a.createdAt > :since")
    long countPending(@Param("since") Instant since);

    @Query("SELECT COUNT(a) FROM IncomingForwardAttempt a WHERE a.status = 'PROCESSING' AND a.createdAt > :since")
    long countProcessing(@Param("since") Instant since);

    @Query("SELECT COUNT(a) FROM IncomingForwardAttempt a WHERE a.status = 'DLQ' AND a.createdAt > :since")
    long countDlq(@Param("since") Instant since);
}
