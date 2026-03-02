package com.webhook.platform.api.filter;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Duration;

@Component
@Order(2)
@Slf4j
public class GlobalRateLimitFilter implements Filter {

    private final Bucket bucket;
    private final boolean enabled;

    public GlobalRateLimitFilter(
            @Value("${rate-limit.global.requests-per-second:5000}") int requestsPerSecond,
            @Value("${rate-limit.global.enabled:true}") boolean enabled) {
        this.enabled = enabled;
        this.bucket = Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(requestsPerSecond)
                        .refillGreedy(requestsPerSecond, Duration.ofSeconds(1))
                        .build())
                .build();
        log.info("Global rate limit filter initialized: {}/sec, enabled={}", requestsPerSecond, enabled);
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        if (!enabled) {
            chain.doFilter(request, response);
            return;
        }

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        String path = httpRequest.getRequestURI();

        // Skip health/metrics endpoints
        if (path.startsWith("/actuator")) {
            chain.doFilter(request, response);
            return;
        }

        if (bucket.tryConsume(1)) {
            chain.doFilter(request, response);
        } else {
            log.warn("Global platform rate limit exceeded for {} {}", httpRequest.getMethod(), path);
            HttpServletResponse httpResponse = (HttpServletResponse) response;
            httpResponse.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            httpResponse.setContentType("application/json");
            httpResponse.getWriter().write(
                    "{\"error\":\"platform_rate_limit\",\"message\":\"Platform rate limit exceeded. Please retry later.\",\"status\":429}");
        }
    }
}
