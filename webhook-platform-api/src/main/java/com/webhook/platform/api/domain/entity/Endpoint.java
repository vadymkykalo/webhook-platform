package com.webhook.platform.api.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "endpoints")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder(toBuilder = true)
public class Endpoint {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(nullable = false, length = 2048)
    private String url;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "secret_encrypted", nullable = false, columnDefinition = "TEXT")
    private String secretEncrypted;

    @Column(name = "secret_iv", nullable = false, columnDefinition = "TEXT")
    private String secretIv;

    @Column(name = "secret_previous_encrypted", columnDefinition = "TEXT")
    private String secretPreviousEncrypted;

    @Column(name = "secret_previous_iv", columnDefinition = "TEXT")
    private String secretPreviousIv;

    @Column(name = "secret_rotated_at")
    private Instant secretRotatedAt;

    @Column(name = "secret_rotation_grace_period_hours")
    private Integer secretRotationGracePeriodHours = 24;

    @Column(name = "enabled", nullable = false)
    private Boolean enabled = true;

    @Column(name = "rate_limit_per_second")
    private Integer rateLimitPerSecond;

    @Column(name = "allowed_source_ips", columnDefinition = "TEXT")
    private String allowedSourceIps;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", insertable = false, updatable = false)
    private Project project;
}
