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

    /**
     * Creates a configurable ConnectionProvider with metrics enabled.
     * Reactor Netty auto-registers Micrometer gauges when metrics(true):
     *   reactor.netty.connection.provider.{pool-name}.pending-connections
     *   reactor.netty.connection.provider.{pool-name}.active-connections
     *   reactor.netty.connection.provider.{pool-name}.idle-connections
     *   reactor.netty.connection.provider.{pool-name}.total-connections
     */
    public static ConnectionProvider createConnectionProvider(
            int maxConnections, int pendingAcquireTimeoutSeconds, int maxIdleTimeSeconds) {
        log.info("Creating webhook connection pool: maxConnections={}, pendingAcquireTimeout={}s, maxIdleTime={}s",
                maxConnections, pendingAcquireTimeoutSeconds, maxIdleTimeSeconds);
        return ConnectionProvider.builder("webhook-pool")
                .maxConnections(maxConnections)
                .pendingAcquireTimeout(Duration.ofSeconds(pendingAcquireTimeoutSeconds))
                .maxIdleTime(Duration.ofSeconds(maxIdleTimeSeconds))
                .metrics(true)
                .build();
    }

    /**
     * Creates a new HttpClient with the given connection provider, connect timeout,
     * and SSRF protection.
     */
    public static HttpClient createHttpClient(ConnectionProvider connectionProvider, boolean allowPrivateIps) {
        return apply(HttpClient.create(connectionProvider), allowPrivateIps);
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
