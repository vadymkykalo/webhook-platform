package com.webhook.platform.worker.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "incoming_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IncomingEvent {

    @Id
    private UUID id;

    @Column(name = "incoming_source_id", nullable = false)
    private UUID incomingSourceId;

    @Column(name = "request_id", nullable = false, unique = true, length = 64)
    private String requestId;

    @Column(nullable = false, length = 10)
    private String method;

    @Column(name = "headers_json", columnDefinition = "TEXT")
    private String headersJson;

    @Column(name = "body_raw", columnDefinition = "TEXT")
    private String bodyRaw;

    @Column(name = "content_type", length = 255)
    private String contentType;

    @Column(name = "received_at", nullable = false, updatable = false)
    private Instant receivedAt;
}
