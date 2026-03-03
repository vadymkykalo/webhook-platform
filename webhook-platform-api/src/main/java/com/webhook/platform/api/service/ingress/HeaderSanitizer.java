package com.webhook.platform.api.service.ingress;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;

import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
public final class HeaderSanitizer {

    private static final Set<String> SENSITIVE_HEADERS_EXACT = Set.of(
            "authorization", "cookie", "set-cookie",
            "x-api-key", "proxy-authorization"
    );
    private static final List<String> SENSITIVE_HEADER_PATTERNS = List.of(
            "signature", "token", "secret", "hmac", "auth", "key", "credential", "password"
    );
    private static final String MASKED_VALUE = "***MASKED***";

    private HeaderSanitizer() {
    }

    public static boolean isSensitiveHeader(String headerName) {
        String lower = headerName.toLowerCase();
        if (SENSITIVE_HEADERS_EXACT.contains(lower)) {
            return true;
        }
        for (String pattern : SENSITIVE_HEADER_PATTERNS) {
            if (lower.contains(pattern)) {
                return true;
            }
        }
        return false;
    }

    public static String toJson(HttpServletRequest request, ObjectMapper objectMapper) {
        try {
            Map<String, String> headers = new HashMap<>();
            Enumeration<String> headerNames = request.getHeaderNames();
            while (headerNames.hasMoreElements()) {
                String name = headerNames.nextElement();
                String value = isSensitiveHeader(name)
                        ? MASKED_VALUE
                        : request.getHeader(name);
                headers.put(name, value);
            }
            return objectMapper.writeValueAsString(headers);
        } catch (Exception e) {
            log.warn("Failed to serialize request headers: {}", e.getMessage());
            return "{}";
        }
    }
}
