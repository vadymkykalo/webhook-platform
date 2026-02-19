package com.webhook.platform.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestSizeLimitFilter extends OncePerRequestFilter {

    private final long maxPayloadSizeBytes;

    public RequestSizeLimitFilter(
            @Value("${webhook.max-payload-size-bytes:262144}") long maxPayloadSizeBytes) {
        this.maxPayloadSizeBytes = maxPayloadSizeBytes;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        long contentLength = request.getContentLengthLong();

        if (contentLength > maxPayloadSizeBytes) {
            log.warn("Request rejected: Content-Length {} exceeds max payload size {} bytes (URI: {})",
                    contentLength, maxPayloadSizeBytes, request.getRequestURI());
            response.setStatus(HttpStatus.PAYLOAD_TOO_LARGE.value());
            response.setContentType("application/json");
            response.getWriter().write(
                    "{\"error\":\"PAYLOAD_TOO_LARGE\",\"message\":\"Request body exceeds maximum allowed size of "
                            + maxPayloadSizeBytes + " bytes\",\"status\":413}");
            return;
        }

        filterChain.doFilter(request, response);
    }
}
