package com.webhook.platform.worker.domain.entity;

import com.webhook.platform.common.enums.SignatureScheme;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "endpoints")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Endpoint {

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

    @Column(nullable = false, length = 2048)
    private String url;

    @Column(name = "secret_encrypted", nullable = false, columnDefinition = "TEXT")
    private String secretEncrypted;

    @Column(name = "secret_iv", nullable = false, columnDefinition = "TEXT")
    private String secretIv;

    /*
     * The rotation grace window. EndpointService.rotateSecret copies the outgoing secret
     * here — re-encrypted under the current key, so one encryption_key_version still
     * describes both columns — and stamps secretRotatedAt. While now() is inside
     * secretRotatedAt + secretRotationGracePeriodHours, OutgoingAttemptStore signs with
     * both and the header carries two v1 values, so a receiver still holding the old
     * secret keeps verifying. Outside the window the previous secret is simply not read.
     */
    @Column(name = "secret_previous_encrypted", columnDefinition = "TEXT")
    private String secretPreviousEncrypted;

    @Column(name = "secret_previous_iv", columnDefinition = "TEXT")
    private String secretPreviousIv;

    @Column(name = "secret_rotated_at")
    private Instant secretRotatedAt;

    @Builder.Default
    @Column(name = "secret_rotation_grace_period_hours")
    private Integer secretRotationGracePeriodHours = 24;

    @Column(nullable = false)
    private Boolean enabled;

    @Column(name = "rate_limit_per_second")
    private Integer rateLimitPerSecond;

    /**
     * Which signature headers this endpoint receives (V062).
     *
     * <p>{@code BOTH} by default: an existing receiver goes on verifying {@code X-Signature}
     * while a new one can verify with an off-the-shelf Standard Webhooks library, and neither
     * has to know the other exists.</p>
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "signature_scheme", nullable = false, length = 20)
    @Builder.Default
    private SignatureScheme signatureScheme = SignatureScheme.BOTH;

    @Column(name = "allowed_source_ips", columnDefinition = "TEXT")
    private String allowedSourceIps;

    @Builder.Default
    @Column(name = "mtls_enabled", nullable = false)
    private Boolean mtlsEnabled = false;

    @Column(name = "client_cert_encrypted", columnDefinition = "TEXT")
    private String clientCertEncrypted;

    @Column(name = "client_cert_iv", columnDefinition = "TEXT")
    private String clientCertIv;

    @Column(name = "client_key_encrypted", columnDefinition = "TEXT")
    private String clientKeyEncrypted;

    @Column(name = "client_key_iv", columnDefinition = "TEXT")
    private String clientKeyIv;

    @Column(name = "ca_cert", columnDefinition = "TEXT")
    private String caCert;

    @Column(name = "encryption_key_version", nullable = false)
    @Builder.Default
    private Integer encryptionKeyVersion = 1;

    @Column(name = "updated_at")
    private Instant updatedAt;

    /**
     * Soft-delete marker. {@code EndpointService.deleteEndpoint} only stamps this column —
     * it does not clear {@code enabled} — and every api-side query filters on
     * {@code deleted_at IS NULL}. Unmapped here, the worker could not see a deletion at all
     * and kept delivering already-queued events to a deleted endpoint for as long as the
     * retry ladder ran.
     */
    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "verification_status", nullable = false, length = 32)
    private VerificationStatus verificationStatus = VerificationStatus.SKIPPED;

    public enum VerificationStatus {
        PENDING,
        VERIFIED,
        FAILED,
        SKIPPED
    }
}
