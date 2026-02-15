package com.webhook.platform.worker.domain.entity;

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

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(nullable = false, length = 2048)
    private String url;

    @Column(name = "secret_encrypted", nullable = false, columnDefinition = "TEXT")
    private String secretEncrypted;

    @Column(name = "secret_iv", nullable = false, columnDefinition = "TEXT")
    private String secretIv;

    @Column(nullable = false)
    private Boolean enabled;

    @Column(name = "rate_limit_per_second")
    private Integer rateLimitPerSecond;

    @Column(name = "allowed_source_ips", columnDefinition = "TEXT")
    private String allowedSourceIps;

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
}
