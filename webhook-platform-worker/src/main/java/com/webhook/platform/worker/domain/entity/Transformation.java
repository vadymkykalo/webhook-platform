package com.webhook.platform.worker.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "transformations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Transformation {

    @Id
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


    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String template;

    @Column(nullable = false)
    private Integer version;

    @Column(nullable = false)
    private Boolean enabled;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
