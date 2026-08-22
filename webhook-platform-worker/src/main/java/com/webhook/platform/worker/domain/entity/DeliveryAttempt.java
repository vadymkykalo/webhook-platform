package com.webhook.platform.worker.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "delivery_attempts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DeliveryAttempt {

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


    @Column(name = "delivery_id", nullable = false)
    private UUID deliveryId;

    @Column(name = "attempt_number", nullable = false)
    private Integer attemptNumber;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "request_headers", columnDefinition = "jsonb")
    private String requestHeaders;

    @Column(name = "request_body", columnDefinition = "TEXT")
    private String requestBody;

    @Column(name = "http_status_code")
    private Integer httpStatusCode;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "response_headers", columnDefinition = "jsonb")
    private String responseHeaders;

    @Column(name = "response_body", columnDefinition = "TEXT")
    private String responseBody;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "duration_ms")
    private Integer durationMs;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
