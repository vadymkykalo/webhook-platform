package com.webhook.platform.api.domain.entity;

import com.webhook.platform.api.domain.enums.DeliveryStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

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
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "endpoint_id", nullable = false)
    private UUID endpointId;

    @Column(name = "subscription_id", nullable = false)
    private UUID subscriptionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "delivery_status")
    private DeliveryStatus status = DeliveryStatus.PENDING;

    @Column(name = "attempt_count", nullable = false)
    private Integer attemptCount = 0;

    @Column(name = "max_attempts", nullable = false)
    private Integer maxAttempts = 7;

    @Column(name = "next_retry_at")
    private Instant nextRetryAt;

    @Column(name = "last_attempt_at")
    private Instant lastAttemptAt;

    @Column(name = "succeeded_at")
    private Instant succeededAt;

    @Column(name = "failed_at")
    private Instant failedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id", insertable = false, updatable = false)
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "endpoint_id", insertable = false, updatable = false)
    private Endpoint endpoint;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subscription_id", insertable = false, updatable = false)
    private Subscription subscription;
}
