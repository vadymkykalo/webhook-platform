package com.webhook.platform.api;

import com.webhook.platform.api.service.AuthRateLimiterService;
import com.webhook.platform.api.service.OutboxPublisherService;
import com.webhook.platform.api.service.RedisRateLimiterService;
import com.webhook.platform.api.service.SequenceGeneratorService;
import com.webhook.platform.api.service.TestEndpointCleanupService;
import com.webhook.platform.api.service.TokenBlacklistService;
import org.junit.jupiter.api.BeforeEach;
import org.redisson.api.RedissonClient;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration,org.redisson.spring.starter.RedissonAutoConfigurationV2"
        }
)
@Testcontainers
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
public abstract class AbstractIntegrationTest {

    @MockBean
    protected RedissonClient redissonClient;

    @MockBean
    protected SequenceGeneratorService sequenceGeneratorService;

    @MockBean
    protected RedisRateLimiterService redisRateLimiterService;

    @MockBean
    protected OutboxPublisherService outboxPublisherService;

    @MockBean
    protected TestEndpointCleanupService testEndpointCleanupService;

    @MockBean
    protected AuthRateLimiterService authRateLimiterService;

    @MockBean
    protected TokenBlacklistService tokenBlacklistService;

    @BeforeEach
    void setupMocks() {
        when(authRateLimiterService.allowLogin(anyString(), any())).thenReturn(true);
        when(authRateLimiterService.allowRegister(anyString())).thenReturn(true);
        when(tokenBlacklistService.isBlacklisted(any())).thenReturn(false);
        when(tokenBlacklistService.isTokenRevokedByEpoch(any(), any())).thenReturn(false);
    }

    @Container
    protected static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("webhook_test")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("webhook.encryption-key", () -> "test_encryption_key_32_chars_pad_extra");
        registry.add("webhook.encryption-salt", () -> "test_salt_for_integration_tests");
        registry.add("jwt.secret", () -> "test_jwt_secret_key_minimum_32_chars_required_here");
        registry.add("jwt.expiration-ms", () -> "3600000");
    }
}
