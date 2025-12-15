package com.webhook.platform.common.security;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

public class UrlValidator {

    private static final Set<String> ALLOWED_SCHEMES = Set.of("http", "https");
    
    private static final List<String> BLOCKED_HOSTS = List.of(
            "metadata.google.internal",
            "169.254.169.254"
    );

    public static void validateWebhookUrl(String url, boolean allowPrivateIps, List<String> allowedHosts) {
        if (url == null || url.trim().isEmpty()) {
            throw new InvalidUrlException("URL cannot be null or empty");
        }

        try {
            URI uri = new URI(url);
            
            String scheme = uri.getScheme();
            if (scheme == null || !ALLOWED_SCHEMES.contains(scheme.toLowerCase())) {
                throw new InvalidUrlException("Only http and https schemes are allowed");
            }

            String host = uri.getHost();
            if (host == null || host.trim().isEmpty()) {
                throw new InvalidUrlException("URL must have a valid host");
            }

            if (BLOCKED_HOSTS.contains(host.toLowerCase())) {
                throw new InvalidUrlException("Access to metadata endpoints is blocked");
            }

            if (allowedHosts != null && allowedHosts.contains(host)) {
                return;
            }

            InetAddress[] addresses = InetAddress.getAllByName(host);
            
            for (InetAddress address : addresses) {
                if (!allowPrivateIps && isPrivateOrLocalAddress(address)) {
                    throw new InvalidUrlException("Access to private IP addresses is not allowed: " + address.getHostAddress());
                }
            }

        } catch (InvalidUrlException e) {
            throw e;
        } catch (UnknownHostException e) {
            throw new InvalidUrlException("Cannot resolve host: " + e.getMessage());
        } catch (Exception e) {
            throw new InvalidUrlException("Invalid URL: " + e.getMessage());
        }
    }

    private static boolean isPrivateOrLocalAddress(InetAddress address) {
        if (address.isLoopbackAddress()) {
            return true;
        }
        
        if (address.isLinkLocalAddress()) {
            return true;
        }
        
        if (address.isSiteLocalAddress()) {
            return true;
        }

        byte[] addr = address.getAddress();
        
        if (addr.length == 4) {
            return isPrivateIPv4(addr);
        } else if (addr.length == 16) {
            return isPrivateIPv6(addr);
        }
        
        return false;
    }

    private static boolean isPrivateIPv4(byte[] addr) {
        int firstOctet = addr[0] & 0xFF;
        int secondOctet = addr[1] & 0xFF;

        if (firstOctet == 10) {
            return true;
        }
        
        if (firstOctet == 172 && secondOctet >= 16 && secondOctet <= 31) {
            return true;
        }
        
        if (firstOctet == 192 && secondOctet == 168) {
            return true;
        }
        
        if (firstOctet == 169 && secondOctet == 254) {
            return true;
        }
        
        if (firstOctet == 127) {
            return true;
        }
        
        if (firstOctet == 0) {
            return true;
        }

        return false;
    }

    private static boolean isPrivateIPv6(byte[] addr) {
        if (addr[0] == (byte) 0xfe && (addr[1] & 0xC0) == 0x80) {
            return true;
        }
        
        if ((addr[0] & 0xfe) == 0xfc) {
            return true;
        }
        
        boolean allZero = true;
        for (int i = 0; i < 15; i++) {
            if (addr[i] != 0) {
                allZero = false;
                break;
            }
        }
        if (allZero && addr[15] == 1) {
            return true;
        }

        return false;
    }

    public static class InvalidUrlException extends RuntimeException {
        public InvalidUrlException(String message) {
            super(message);
        }
    }
}
