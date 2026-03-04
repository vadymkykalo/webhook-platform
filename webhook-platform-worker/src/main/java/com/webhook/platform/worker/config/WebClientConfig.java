package com.webhook.platform.worker.config;

import com.webhook.platform.worker.service.SsrfProtectionCustomizer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import reactor.netty.resources.ConnectionProvider;

@Configuration
public class WebClientConfig {

    @Bean
    public ConnectionProvider webhookConnectionProvider(
            @Value("${webhook.connection-pool.max-connections:200}") int maxConnections,
            @Value("${webhook.connection-pool.pending-acquire-timeout-seconds:10}") int pendingAcquireTimeoutSeconds,
            @Value("${webhook.connection-pool.max-idle-time-seconds:60}") int maxIdleTimeSeconds) {
        return SsrfProtectionCustomizer.createConnectionProvider(
                maxConnections, pendingAcquireTimeoutSeconds, maxIdleTimeSeconds);
    }
}
