package com.webhook.platform.api.service.ingress;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;

@Component
@Slf4j
public class ClientIpResolver {

    private final List<String> trustedProxies;

    public ClientIpResolver(
            @Value("${webhook.incoming.trusted-proxies:127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16}") List<String> trustedProxies) {
        this.trustedProxies = trustedProxies;
    }

    public String resolve(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        // Only trust proxy headers when the direct connection comes from a known proxy
        if (isTrustedProxy(remoteAddr)) {
            String xForwardedFor = request.getHeader("X-Forwarded-For");
            if (xForwardedFor != null && !xForwardedFor.isBlank()) {
                return xForwardedFor.split(",")[0].trim();
            }
            String xRealIp = request.getHeader("X-Real-IP");
            if (xRealIp != null && !xRealIp.isBlank()) {
                return xRealIp.trim();
            }
        }
        return remoteAddr;
    }

    boolean isTrustedProxy(String remoteAddr) {
        if (trustedProxies == null || trustedProxies.isEmpty()) {
            return false;
        }
        try {
            InetAddress remote = InetAddress.getByName(remoteAddr);
            byte[] remoteBytes = remote.getAddress();
            for (String proxy : trustedProxies) {
                String trimmed = proxy.trim();
                if (trimmed.isEmpty()) continue;
                if (trimmed.contains("/")) {
                    // CIDR notation
                    String[] parts = trimmed.split("/");
                    InetAddress network = InetAddress.getByName(parts[0]);
                    int prefixLen = Integer.parseInt(parts[1]);
                    if (isInCidr(remoteBytes, network.getAddress(), prefixLen)) {
                        return true;
                    }
                } else {
                    InetAddress trusted = InetAddress.getByName(trimmed);
                    if (remote.equals(trusted)) {
                        return true;
                    }
                }
            }
        } catch (UnknownHostException e) {
            log.warn("Failed to resolve remote address for trusted proxy check: {}", remoteAddr);
        }
        return false;
    }

    static boolean isInCidr(byte[] addr, byte[] network, int prefixLen) {
        if (addr.length != network.length) return false;
        int fullBytes = prefixLen / 8;
        int remainingBits = prefixLen % 8;
        for (int i = 0; i < fullBytes; i++) {
            if (addr[i] != network[i]) return false;
        }
        if (remainingBits > 0 && fullBytes < addr.length) {
            int mask = (0xFF << (8 - remainingBits)) & 0xFF;
            if ((addr[fullBytes] & mask) != (network[fullBytes] & mask)) return false;
        }
        return true;
    }
}
