package com.webhook.platform.worker.service;

import com.webhook.platform.common.security.UrlValidator;
import lombok.extern.slf4j.Slf4j;
import reactor.netty.http.client.HttpClient;

import java.net.InetAddress;
import java.net.InetSocketAddress;

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
     * Wraps the given HttpClient with a doOnConnected hook that validates
     * the remote address is not private/local. When allowPrivateIps is true
     * (local development), the check is skipped entirely.
     */
    public static HttpClient apply(HttpClient httpClient, boolean allowPrivateIps) {
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
