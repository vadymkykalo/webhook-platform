package com.webhook.platform.api;

import com.webhook.platform.api.domain.entity.DeliveryAttempt;
import com.webhook.platform.api.domain.repository.DeliveryAttemptRepository;
import com.webhook.platform.api.domain.repository.DeliveryRepository;
import com.webhook.platform.api.service.DataRetentionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.webhook.platform.api.dto.RateLimitInfo;
import com.webhook.platform.api.service.OutboxPublisherService;
import com.webhook.platform.api.service.RedisRateLimiterService;
import com.webhook.platform.api.service.SequenceGeneratorService;
import com.webhook.platform.api.service.TestEndpointCleanupService;
import org.redisson.api.RedissonClient;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.NONE,
    properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration,org.redisson.spring.starter.RedissonAutoConfigurationV2"
    }
)
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
public class ShedLockConcurrencyTest {

    @MockBean
    private RedissonClient redissonClient;

    @MockBean
    private SequenceGeneratorService sequenceGeneratorService;

    @MockBean
    private RedisRateLimiterService redisRateLimiterService;

    @MockBean
    private OutboxPublisherService outboxPublisherService;

    @MockBean
    private TestEndpointCleanupService testEndpointCleanupService;

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("data-retention.max-attempts-per-delivery", () -> "10");
        registry.add("data-retention.delivery-attempts-retention-days", () -> "90");
        registry.add("data-retention.batch-size", () -> "1000");
        registry.add("webhook.encryption-key", () -> "test_encryption_key_32_chars__");
        registry.add("jwt.secret", () -> "test_jwt_secret_key_minimum_32_chars_required_here");
        registry.add("jwt.expiration-ms", () -> "3600000");
    }

    @Autowired
    private DataRetentionService dataRetentionService;

    @Autowired
    private DeliveryAttemptRepository deliveryAttemptRepository;

    @Autowired
    private DeliveryRepository deliveryRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;
    
    @Autowired
    private TransactionTemplate transactionTemplate;

    private AtomicInteger executionCount = new AtomicInteger(0);

    @BeforeEach
    void cleanup() {
        jdbcTemplate.execute("SET session_replication_role = replica");
        deliveryAttemptRepository.deleteAll();
        deliveryRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM shedlock");
        executionCount.set(0);
        jdbcTemplate.execute("SET session_replication_role = DEFAULT");
    }

    @Test
    void testPerDeliveryLimitEnforcement() throws Exception {
        UUID deliveryId = createDelivery();

        for (int i = 1; i <= 20; i++) {
            createAttempt(deliveryId, i);
        }
        
        long before = deliveryAttemptRepository.count();
        assertEquals(20, before);

        transactionTemplate.execute(status -> {
            dataRetentionService.enforcePerDeliveryAttemptLimits();
            return null;
        });
        
        List<DeliveryAttempt> remaining = deliveryAttemptRepository
                .findByDeliveryIdOrderByAttemptNumberAsc(deliveryId);

        assertEquals(10, remaining.size());
        assertEquals(11, remaining.get(0).getAttemptNumber());
        assertEquals(20, remaining.get(9).getAttemptNumber());
    }


    private UUID createDelivery() {
        UUID deliveryId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        UUID endpointId = UUID.randomUUID();
        UUID subscriptionId = UUID.randomUUID();
        Timestamp now = Timestamp.from(Instant.now());
        
        jdbcTemplate.execute("SET session_replication_role = replica");
        jdbcTemplate.update(
            "INSERT INTO deliveries (id, event_id, endpoint_id, subscription_id, status, attempt_count, max_attempts, ordering_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            deliveryId, eventId, endpointId, subscriptionId, "PENDING", 0, 5, false, now, now
        );
        jdbcTemplate.execute("SET session_replication_role = DEFAULT");
        
        return deliveryId;
    }

    private void createAttempt(UUID deliveryId, int attemptNumber) {
        jdbcTemplate.execute("SET session_replication_role = replica");
        jdbcTemplate.update(
            "INSERT INTO delivery_attempts (id, delivery_id, attempt_number, http_status_code, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            UUID.randomUUID(), deliveryId, attemptNumber, 200, 100, Timestamp.from(Instant.now())
        );
        jdbcTemplate.execute("SET session_replication_role = DEFAULT");
    }
}
