package com.webhook.platform.api.service;

import com.webhook.platform.api.domain.entity.TunnelSession;
import com.webhook.platform.api.domain.enums.TunnelStatus;
import com.webhook.platform.api.domain.repository.TunnelSessionRepository;
import com.webhook.platform.api.dto.TunnelSessionResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TunnelService {

    private final TunnelSessionRepository tunnelSessionRepository;

    @Value("${webhook.ingress-base-url:http://localhost:8080}")
    private String ingressBaseUrl;

    @Value("${tunnel.heartbeat-timeout-seconds:120}")
    private int heartbeatTimeoutSeconds;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    @Transactional
    public TunnelSession createSession(UUID userId, UUID organizationId, UUID projectId,
                                       int localPort, String clientInfo) {
        String tunnelToken = generateSecureToken();
        String publicSlug = generateSlug();

        TunnelSession session = TunnelSession.builder()
                .userId(userId)
                .organizationId(organizationId)
                .projectId(projectId)
                .tunnelToken(tunnelToken)
                .publicSlug(publicSlug)
                .localPort(localPort)
                .status(TunnelStatus.ACTIVE)
                .lastHeartbeat(Instant.now())
                .clientInfo(clientInfo)
                .build();

        session = tunnelSessionRepository.save(session);
        log.info("Tunnel session created: id={}, slug={}, user={}, org={}",
                session.getId(), publicSlug, userId, organizationId);
        return session;
    }

    @Transactional
    public void closeSession(String tunnelToken) {
        tunnelSessionRepository.findByTunnelToken(tunnelToken).ifPresent(session -> {
            session.setStatus(TunnelStatus.CLOSED);
            session.setClosedAt(Instant.now());
            tunnelSessionRepository.save(session);
            log.info("Tunnel session closed: id={}, slug={}", session.getId(), session.getPublicSlug());
        });
    }

    @Transactional
    public void closeSession(UUID sessionId) {
        tunnelSessionRepository.findById(sessionId).ifPresent(session -> {
            session.setStatus(TunnelStatus.CLOSED);
            session.setClosedAt(Instant.now());
            tunnelSessionRepository.save(session);
            log.info("Tunnel session closed: id={}, slug={}", session.getId(), session.getPublicSlug());
        });
    }

    @Transactional
    public void heartbeat(String tunnelToken) {
        tunnelSessionRepository.findByTunnelToken(tunnelToken).ifPresent(session -> {
            session.setLastHeartbeat(Instant.now());
            tunnelSessionRepository.save(session);
        });
    }

    public TunnelSession getActiveBySlug(String slug) {
        TunnelSession session = tunnelSessionRepository.findByPublicSlug(slug)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tunnel not found"));
        if (session.getStatus() != TunnelStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.GONE, "Tunnel is no longer active");
        }
        return session;
    }

    public TunnelSession getByToken(String tunnelToken) {
        return tunnelSessionRepository.findByTunnelToken(tunnelToken)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tunnel session not found"));
    }

    public List<TunnelSessionResponse> listActive(UUID organizationId) {
        return tunnelSessionRepository.findByOrganizationIdAndStatus(organizationId, TunnelStatus.ACTIVE)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public List<TunnelSessionResponse> listActiveByUser(UUID userId) {
        return tunnelSessionRepository.findByUserIdAndStatus(userId, TunnelStatus.ACTIVE)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public TunnelSessionResponse toResponse(TunnelSession session) {
        return TunnelSessionResponse.builder()
                .id(session.getId())
                .organizationId(session.getOrganizationId())
                .userId(session.getUserId())
                .projectId(session.getProjectId())
                .publicSlug(session.getPublicSlug())
                .publicUrl(buildPublicUrl(session.getPublicSlug()))
                .localPort(session.getLocalPort())
                .status(session.getStatus())
                .createdAt(session.getCreatedAt())
                .lastHeartbeat(session.getLastHeartbeat())
                .closedAt(session.getClosedAt())
                .clientInfo(session.getClientInfo())
                .build();
    }

    public String buildPublicUrl(String slug) {
        return ingressBaseUrl + "/tunnel/" + slug;
    }

    @Scheduled(fixedDelayString = "${tunnel.cleanup-interval-ms:60000}")
    @Transactional
    public void cleanupStaleSessions() {
        Instant threshold = Instant.now().minus(heartbeatTimeoutSeconds, ChronoUnit.SECONDS);
        int expired = tunnelSessionRepository.expireStale(threshold, Instant.now());
        if (expired > 0) {
            log.info("Expired {} stale tunnel sessions", expired);
        }
    }

    private String generateSecureToken() {
        byte[] bytes = new byte[48];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String generateSlug() {
        byte[] bytes = new byte[12];
        SECURE_RANDOM.nextBytes(bytes);
        return "tun-" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
                .toLowerCase().replace("_", "").replace("-", "").substring(0, 12);
    }
}
