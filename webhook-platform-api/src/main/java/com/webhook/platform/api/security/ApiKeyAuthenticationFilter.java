package com.webhook.platform.api.security;

import com.webhook.platform.api.domain.entity.ApiKey;
import com.webhook.platform.api.domain.repository.ApiKeyRepository;
import com.webhook.platform.common.util.CryptoUtils;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.Optional;

@Component
public class ApiKeyAuthenticationFilter extends OncePerRequestFilter {

    private static final String API_KEY_HEADER = "X-API-Key";
    private final ApiKeyRepository apiKeyRepository;

    public ApiKeyAuthenticationFilter(ApiKeyRepository apiKeyRepository) {
        this.apiKeyRepository = apiKeyRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String apiKeyValue = request.getHeader(API_KEY_HEADER);

        if (apiKeyValue != null && !apiKeyValue.isEmpty()) {
            String keyHash = CryptoUtils.hashApiKey(apiKeyValue);
            Optional<ApiKey> apiKeyOpt = apiKeyRepository.findByKeyHash(keyHash);

            if (apiKeyOpt.isPresent()) {
                ApiKey apiKey = apiKeyOpt.get();
                
                if (apiKey.getRevokedAt() == null && 
                    (apiKey.getExpiresAt() == null || apiKey.getExpiresAt().isAfter(java.time.Instant.now()))) {
                    
                    ApiKeyAuthenticationToken authentication = new ApiKeyAuthenticationToken(
                            apiKeyValue,
                            apiKey.getProjectId(),
                            Collections.emptyList()
                    );
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                }
            }
        }

        filterChain.doFilter(request, response);
    }
}
