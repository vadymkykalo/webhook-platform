package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.TunnelSession;
import com.webhook.platform.api.domain.enums.TunnelStatus;
import com.webhook.platform.common.dto.tunnel.TunnelMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;

@Slf4j
@Component
@RequiredArgsConstructor
public class TunnelWebSocketHandler extends TextWebSocketHandler {

    private final TunnelService tunnelService;
    private final TunnelRegistry tunnelRegistry;
    private final ObjectMapper objectMapper;

    private static final String ATTR_TUNNEL_TOKEN = "tunnelToken";
    private static final String ATTR_SLUG = "slug";
    private static final int MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        session.setTextMessageSizeLimit(MAX_MESSAGE_SIZE);

        String tunnelToken = extractQueryParam(session, "token");
        if (tunnelToken == null || tunnelToken.isBlank()) {
            log.warn("WebSocket connection without tunnel token, closing");
            session.close(CloseStatus.POLICY_VIOLATION.withReason("Missing tunnel token"));
            return;
        }

        TunnelSession tunnelSession;
        try {
            tunnelSession = tunnelService.getByToken(tunnelToken);
        } catch (Exception e) {
            log.warn("Invalid tunnel token on WS connect: {}", e.getMessage());
            session.close(CloseStatus.POLICY_VIOLATION.withReason("Invalid tunnel token"));
            return;
        }

        if (tunnelSession.getStatus() != TunnelStatus.ACTIVE) {
            log.warn("Tunnel session not active: {}", tunnelSession.getId());
            session.close(CloseStatus.POLICY_VIOLATION.withReason("Tunnel session not active"));
            return;
        }

        String slug = tunnelSession.getPublicSlug();
        session.getAttributes().put(ATTR_TUNNEL_TOKEN, tunnelToken);
        session.getAttributes().put(ATTR_SLUG, slug);

        tunnelRegistry.register(slug, session);
        tunnelService.heartbeat(tunnelToken);

        String tunnelUrl = tunnelService.buildPublicUrl(slug);
        TunnelMessage registered = TunnelMessage.registered(tunnelSession.getId().toString(), tunnelUrl);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(registered)));

        log.info("Tunnel WS connected: slug={}, sessionId={}", slug, session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String slug = (String) session.getAttributes().get(ATTR_SLUG);
        String tunnelToken = (String) session.getAttributes().get(ATTR_TUNNEL_TOKEN);

        if (slug == null || tunnelToken == null) {
            session.close(CloseStatus.POLICY_VIOLATION.withReason("Not authenticated"));
            return;
        }

        TunnelMessage tunnelMessage;
        try {
            tunnelMessage = objectMapper.readValue(message.getPayload(), TunnelMessage.class);
        } catch (Exception e) {
            log.warn("Invalid tunnel message from slug={}: {}", slug, e.getMessage());
            return;
        }

        switch (tunnelMessage.getType()) {
            case TunnelMessage.TYPE_HEARTBEAT:
                tunnelService.heartbeat(tunnelToken);
                session.sendMessage(new TextMessage(
                        objectMapper.writeValueAsString(TunnelMessage.heartbeat())));
                break;

            case TunnelMessage.TYPE_TUNNEL_RESPONSE:
                if (tunnelMessage.getResponse() != null && tunnelMessage.getResponse().getRequestId() != null) {
                    tunnelRegistry.completeRequest(
                            tunnelMessage.getResponse().getRequestId(),
                            tunnelMessage.getResponse());
                }
                break;

            default:
                log.debug("Unhandled tunnel message type: {} from slug={}", tunnelMessage.getType(), slug);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String slug = (String) session.getAttributes().get(ATTR_SLUG);
        String tunnelToken = (String) session.getAttributes().get(ATTR_TUNNEL_TOKEN);

        if (slug != null) {
            tunnelRegistry.unregister(slug);
        }
        if (tunnelToken != null) {
            tunnelService.closeSession(tunnelToken);
        }

        log.info("Tunnel WS disconnected: slug={}, status={}", slug, status);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        String slug = (String) session.getAttributes().get(ATTR_SLUG);
        log.error("Tunnel WS transport error: slug={}", slug, exception);
    }

    private String extractQueryParam(WebSocketSession session, String paramName) {
        URI uri = session.getUri();
        if (uri == null || uri.getQuery() == null) return null;
        for (String param : uri.getQuery().split("&")) {
            String[] pair = param.split("=", 2);
            if (pair.length == 2 && pair[0].equals(paramName)) {
                return pair[1];
            }
        }
        return null;
    }
}
