package com.webhook.platform.worker.domain.entity;

import com.webhook.platform.common.enums.ForwardAttemptStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "incoming_forward_attempts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IncomingForwardAttempt {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "incoming_event_id", nullable = false)
    private UUID incomingEventId;

    @Column(name = "destination_id", nullable = false)
    private UUID destinationId;

    @Column(name = "attempt_number", nullable = false)
    private Integer attemptNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ForwardAttemptStatus status;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "response_code")
    private Integer responseCode;

    @Column(name = "response_headers_json", columnDefinition = "TEXT")
    private String responseHeadersJson;

    @Column(name = "response_body_snippet", columnDefinition = "TEXT")
    private String responseBodySnippet;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "next_retry_at")
    private Instant nextRetryAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
