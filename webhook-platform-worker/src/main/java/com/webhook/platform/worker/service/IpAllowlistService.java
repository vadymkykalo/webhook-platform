package com.webhook.platform.worker.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.InetAddress;
import java.util.Arrays;
import java.util.List;

@Service
@Slf4j
public class IpAllowlistService {

    /**
     * Validates if a source IP is allowed based on the endpoint's allowlist.
     * 
     * @param sourceIp The source IP to validate (can be from X-Forwarded-For header)
     * @param allowedSourceIps Comma-separated list of allowed IPs or CIDR ranges
     * @return true if allowed (or no restrictions), false if blocked
     */
    public boolean isIpAllowed(String sourceIp, String allowedSourceIps) {
        // No restrictions if allowlist is empty
        if (allowedSourceIps == null || allowedSourceIps.isBlank()) {
            return true;
        }
        
        if (sourceIp == null || sourceIp.isBlank()) {
            log.warn("No source IP provided for allowlist validation");
            return true; // Allow if we can't determine source IP
        }
        
        // Extract first IP from X-Forwarded-For (leftmost is original client)
        String clientIp = extractClientIp(sourceIp);
        
        List<String> allowedList = Arrays.stream(allowedSourceIps.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
        
        for (String allowed : allowedList) {
            if (isIpMatch(clientIp, allowed)) {
                return true;
            }
        }
        
        log.info("IP {} not in allowlist for endpoint", clientIp);
        return false;
    }

    private String extractClientIp(String sourceIp) {
        // X-Forwarded-For format: "client, proxy1, proxy2"
        if (sourceIp.contains(",")) {
            return sourceIp.split(",")[0].trim();
        }
        return sourceIp.trim();
    }

    private boolean isIpMatch(String clientIp, String allowedPattern) {
        try {
            if (allowedPattern.contains("/")) {
                // CIDR notation
                return isInCidrRange(clientIp, allowedPattern);
            } else {
                // Exact match
                return clientIp.equals(allowedPattern);
            }
        } catch (Exception e) {
            log.warn("Error matching IP {} against pattern {}: {}", clientIp, allowedPattern, e.getMessage());
            return false;
        }
    }

    private boolean isInCidrRange(String ip, String cidr) {
        try {
            String[] parts = cidr.split("/");
            if (parts.length != 2) {
                return false;
            }
            
            String networkAddress = parts[0];
            int prefixLength = Integer.parseInt(parts[1]);
            
            InetAddress ipAddr = InetAddress.getByName(ip);
            InetAddress networkAddr = InetAddress.getByName(networkAddress);
            
            byte[] ipBytes = ipAddr.getAddress();
            byte[] networkBytes = networkAddr.getAddress();
            
            if (ipBytes.length != networkBytes.length) {
                return false; // IPv4 vs IPv6 mismatch
            }
            
            int fullBytes = prefixLength / 8;
            int remainingBits = prefixLength % 8;
            
            // Check full bytes
            for (int i = 0; i < fullBytes; i++) {
                if (ipBytes[i] != networkBytes[i]) {
                    return false;
                }
            }
            
            // Check remaining bits
            if (remainingBits > 0 && fullBytes < ipBytes.length) {
                int mask = 0xFF << (8 - remainingBits);
                if ((ipBytes[fullBytes] & mask) != (networkBytes[fullBytes] & mask)) {
                    return false;
                }
            }
            
            return true;
        } catch (Exception e) {
            log.warn("Failed to parse CIDR range {}: {}", cidr, e.getMessage());
            return false;
        }
    }
}
