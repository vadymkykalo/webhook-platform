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

    /**
     * Tenant discriminator, mapped but not enforced here.
     *
     * <p>The api filters on this column via {@code @TenantId} (ADR-0006). The worker deliberately
     * does not: it has no {@code AuthContext}, every consumer is a system path by construction,
     * and a discriminator it could never populate from a request would only break it.
     *
     * <p>It is mapped rather than ignored for two reasons. The attempt stores insert rows into
     * {@code delivery_attempts} and {@code incoming_forward_attempts} and have to carry the
     * tenant across from the parent row, or the api would not see what the worker wrote. And
     * {@code EntityMappingParityIntegrationTest} requires every column of a shared table to be
     * mapped by both modules — ADR-0002's cost, paid here rather than exempted.
     */
    @Column(name = "organization_id", nullable = false)
    private UUID organizationId;


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
