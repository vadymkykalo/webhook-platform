package com.webhook.platform.worker.domain.repository;

import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.worker.domain.entity.IncomingForwardAttempt;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.repository.JpaRepository;
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

    @Query("SELECT a FROM IncomingForwardAttempt a WHERE a.status = :status AND a.nextRetryAt <= :now " +
            "ORDER BY a.nextRetryAt ASC")
    List<IncomingForwardAttempt> findPendingRetries(@Param("status") ForwardAttemptStatus status,
                                                    @Param("now") Instant now,
                                                    PageRequest pageRequest);

    @Query("SELECT COALESCE(MAX(a.attemptNumber), 0) FROM IncomingForwardAttempt a " +
            "WHERE a.incomingEventId = :eventId AND a.destinationId = :destinationId")
    int findMaxAttemptNumber(@Param("eventId") UUID eventId, @Param("destinationId") UUID destinationId);
}
