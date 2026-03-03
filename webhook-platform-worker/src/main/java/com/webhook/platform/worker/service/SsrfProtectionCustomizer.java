package com.webhook.platform.worker.service;

import com.webhook.platform.common.security.UrlValidator;
import io.netty.channel.ChannelOption;
import lombok.extern.slf4j.Slf4j;
import reactor.netty.http.client.HttpClient;
import reactor.netty.resources.ConnectionProvider;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.time.Duration;

/**
 * Applies post-connect SSRF protection to Reactor Netty HttpClient.
 * Validates the actual resolved IP after TCP connection, closing the TOCTOU
 * window between DNS validation and HTTP request (DNS rebinding mitigation).
 */
@Slf4j
public final class SsrfProtectionCustomizer {

    private SsrfProtectionCustomizer() {
    }

    static final ConnectionProvider CONNECTION_PROVIDER = ConnectionProvider.builder("webhook-pool")
            .maxConnections(200)
            .pendingAcquireTimeout(Duration.ofSeconds(10))
            .maxIdleTime(Duration.ofSeconds(60))
            .build();

    /**
     * Creates a new HttpClient with shared connection pool, connect timeout,
     * and SSRF protection.
     */
    public static HttpClient createHttpClient(boolean allowPrivateIps) {
        return apply(HttpClient.create(CONNECTION_PROVIDER), allowPrivateIps);
    }

    public static HttpClient apply(HttpClient httpClient, boolean allowPrivateIps) {
        httpClient = httpClient
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 5_000);

        if (allowPrivateIps) {
            return httpClient;
        }

        return httpClient.doOnConnected(conn -> {
            var remoteAddress = conn.channel().remoteAddress();
            if (remoteAddress instanceof InetSocketAddress isa) {
                InetAddress addr = isa.getAddress();
                if (addr != null && UrlValidator.isPrivateOrLocalAddress(addr)) {
                    log.warn("SSRF protection: DNS rebinding detected, resolved to private IP {}", addr.getHostAddress());
                    conn.dispose();
                    throw new UrlValidator.InvalidUrlException(
                            "SSRF protection: connection resolved to private IP " + addr.getHostAddress());
                }
            }
        });
    }
}
