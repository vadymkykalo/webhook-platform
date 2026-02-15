package com.webhook.platform.api.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import io.swagger.v3.oas.models.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
@ConditionalOnProperty(name = "springdoc.swagger-ui.enabled", havingValue = "true", matchIfMissing = true)
public class OpenApiConfig {

    @Value("${server.port:8080}")
    private int serverPort;

    @Bean
    public OpenAPI webhookPlatformOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Webhook Platform API")
                        .description("""
                                Enterprise-grade distributed webhook delivery system with at-least-once guarantees.
                                
                                ## Features
                                - **Event Ingestion**: Send events via REST API with automatic fan-out to subscribed endpoints
                                - **Reliable Delivery**: Automatic retries with exponential backoff (1m → 24h, 7 attempts)
                                - **HMAC Signatures**: Secure webhook verification with SHA-256 signatures
                                - **Multi-tenant**: Organization-based isolation with JWT authentication
                                - **Rate Limiting**: Distributed rate limiting via Redis
                                
                                ## Authentication
                                - **JWT Bearer Token**: For management operations (projects, endpoints, subscriptions)
                                - **API Key**: For event ingestion (`X-API-Key` header)
                                """)
                        .version("1.0.0")
                        .contact(new Contact()
                                .name("Webhook Platform")
                                .url("https://github.com/vadymkykalo/webhook-platform"))
                        .license(new License()
                                .name("MIT")
                                .url("https://opensource.org/licenses/MIT")))
                .servers(List.of(
                        new Server().url("http://localhost:" + serverPort).description("Local Development")))
                .tags(List.of(
                        new Tag().name("Authentication").description("User registration, login, and session management"),
                        new Tag().name("Organizations").description("Organization and member management"),
                        new Tag().name("Projects").description("Project management and dashboard statistics"),
                        new Tag().name("Endpoints").description("Webhook endpoint configuration"),
                        new Tag().name("Subscriptions").description("Event type subscriptions for endpoints"),
                        new Tag().name("Events").description("Event ingestion and history"),
                        new Tag().name("Deliveries").description("Delivery status, attempts, and replay operations"),
                        new Tag().name("API Keys").description("API key management for event ingestion")))
                .components(new Components()
                        .addSecuritySchemes("bearerAuth", new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("JWT token obtained from /api/v1/auth/login"))
                        .addSecuritySchemes("apiKey", new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)
                                .name("X-API-Key")
                                .description("Project API key for event ingestion")))
                .addSecurityItem(new SecurityRequirement().addList("bearerAuth"));
    }
}
