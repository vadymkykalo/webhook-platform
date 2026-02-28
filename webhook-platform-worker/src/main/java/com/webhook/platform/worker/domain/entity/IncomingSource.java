package com.webhook.platform.worker.domain.entity;

import com.webhook.platform.common.enums.IncomingSourceStatus;
import com.webhook.platform.common.enums.ProviderType;
import com.webhook.platform.common.enums.VerificationMode;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "incoming_sources")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IncomingSource {

    @Id
    private UUID id;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(nullable = false, length = 255)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider_type", nullable = false, length = 50)
    private ProviderType providerType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private IncomingSourceStatus status;

    @Column(name = "ingress_path_token", nullable = false, unique = true, length = 64)
    private String ingressPathToken;

    @Enumerated(EnumType.STRING)
    @Column(name = "verification_mode", nullable = false, length = 30)
    private VerificationMode verificationMode;

    @Column(name = "hmac_secret_encrypted", columnDefinition = "TEXT")
    private String hmacSecretEncrypted;

    @Column(name = "hmac_secret_iv", columnDefinition = "TEXT")
    private String hmacSecretIv;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
