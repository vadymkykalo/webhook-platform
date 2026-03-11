package com.webhook.platform.api.domain.repository;

import com.webhook.platform.api.domain.entity.IncomingForwardAttempt;
import com.webhook.platform.common.enums.ForwardAttemptStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface IncomingForwardAttemptRepository extends JpaRepository<IncomingForwardAttempt, UUID> {

    Page<IncomingForwardAttempt> findByIncomingEventId(UUID incomingEventId, Pageable pageable);

    List<IncomingForwardAttempt> findByIncomingEventIdAndDestinationIdOrderByAttemptNumberDesc(
            UUID incomingEventId, UUID destinationId);

    @Query("SELECT a FROM IncomingForwardAttempt a WHERE a.status = :status AND a.nextRetryAt <= :now " +
            "ORDER BY a.nextRetryAt ASC")
    List<IncomingForwardAttempt> findPendingRetries(
            @Param("status") ForwardAttemptStatus status,
            @Param("now") Instant now,
            PageRequest pageRequest);

    @Query("SELECT MAX(a.attemptNumber) FROM IncomingForwardAttempt a " +
            "WHERE a.incomingEventId = :eventId AND a.destinationId = :destinationId")
    Integer findMaxAttemptNumber(@Param("eventId") UUID eventId, @Param("destinationId") UUID destinationId);

    @Query("SELECT COUNT(a) FROM IncomingForwardAttempt a " +
            "JOIN IncomingEvent e ON a.incomingEventId = e.id " +
            "JOIN IncomingSource s ON e.incomingSourceId = s.id " +
            "WHERE s.projectId = :projectId AND a.status = 'SUCCESS' AND a.finishedAt BETWEEN :from AND :to")
    long countSuccessfulByProjectAndDateRange(@Param("projectId") UUID projectId, @Param("from") Instant from, @Param("to") Instant to);

    @Query("SELECT COUNT(a) FROM IncomingForwardAttempt a " +
            "JOIN IncomingEvent e ON a.incomingEventId = e.id " +
            "JOIN IncomingSource s ON e.incomingSourceId = s.id " +
            "WHERE s.projectId = :projectId AND a.status = 'SUCCESS' AND a.finishedAt >= :since")
    long countSuccessfulByProjectSince(@Param("projectId") UUID projectId, @Param("since") Instant since);
}
