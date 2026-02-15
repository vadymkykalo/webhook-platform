package com.webhook.platform.worker.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "deliveries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Delivery {

    @Id
    private UUID id;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "endpoint_id", nullable = false)
    private UUID endpointId;

    @Column(name = "subscription_id", nullable = false)
    private UUID subscriptionId;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private DeliveryStatus status;

    @Column(name = "attempt_count", nullable = false)
    private Integer attemptCount;

    @Column(name = "max_attempts", nullable = false)
    private Integer maxAttempts;

    @Column(name = "sequence_number")
    private Long sequenceNumber;

    @Column(name = "ordering_enabled", nullable = false)
    private Boolean orderingEnabled = false;

    @Column(name = "timeout_seconds")
    private Integer timeoutSeconds = 30;

    @Column(name = "retry_delays", columnDefinition = "TEXT")
    private String retryDelays = "60,300,900,3600,21600,86400";

    @Column(name = "next_retry_at")
    private Instant nextRetryAt;

    @Column(name = "last_attempt_at")
    private Instant lastAttemptAt;

    @Column(name = "succeeded_at")
    private Instant succeededAt;

    @Column(name = "failed_at")
    private Instant failedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public enum DeliveryStatus {
        PENDING, PROCESSING, SUCCESS, FAILED, DLQ
    }
}
