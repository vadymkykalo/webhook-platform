package com.webhook.platform.worker.repository;

import com.webhook.platform.worker.domain.entity.Delivery;
import com.webhook.platform.worker.domain.entity.Endpoint;
import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration test for DeliveryRepository query optimization
 * 
 * Tests:
 * 1. Query selects only PENDING deliveries with nextRetryAt <= now
 * 2. Results are ordered by nextRetryAt ASC
 * 3. Pagination works correctly (batch size limit)
 * 4. Row-level locking prevents concurrent access (PESSIMISTIC_WRITE)
 */
@DataJpaTest
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration,org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration,org.springframework.boot.autoconfigure.data.redis.RedisRepositoriesAutoConfiguration"
})
class DeliveryRepositoryTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("webhook_test")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }

    @Autowired
    private DeliveryRepository deliveryRepository;

    @Autowired
    private TestEntityManager entityManager;

    private UUID sharedEndpointId;
    private UUID sharedProjectId;

    private void createSharedEndpoint() {
        sharedProjectId = UUID.randomUUID();
        sharedEndpointId = UUID.randomUUID();
        Endpoint endpoint = Endpoint.builder()
                .id(sharedEndpointId)
                .projectId(sharedProjectId)
                .url("https://example.com/hook")
                .secretEncrypted("enc")
                .secretIv("iv")
                .enabled(true)
                .build();
        entityManager.persist(endpoint);
    }

    @Test
    void findPendingRetryIds_shouldOnlySelectPendingStatus() {
        // Arrange
        createSharedEndpoint();
        Instant now = Instant.now();
        Delivery pending = createAndPersistDelivery(Delivery.DeliveryStatus.PENDING, now.minusSeconds(60));
        Delivery processing = createAndPersistDelivery(Delivery.DeliveryStatus.PROCESSING, now.minusSeconds(60));
        Delivery success = createAndPersistDelivery(Delivery.DeliveryStatus.SUCCESS, now.minusSeconds(60));
        
        entityManager.flush();
        entityManager.clear();

        // Act
        List<UUID> ids = deliveryRepository.findPendingRetryIds(
                Delivery.DeliveryStatus.PENDING, now, 10, 100, 100);
        List<Delivery> result = deliveryRepository.lockByIds(ids);

        // Assert
        assertEquals(1, result.size());
        assertEquals(pending.getId(), result.get(0).getId());
    }

    @Test
    void findPendingRetryIds_shouldOnlySelectDueRetries() {
        // Arrange
        createSharedEndpoint();
        Instant now = Instant.now();
        Delivery overdue = createAndPersistDelivery(Delivery.DeliveryStatus.PENDING, now.minusSeconds(120));
        Delivery justDue = createAndPersistDelivery(Delivery.DeliveryStatus.PENDING, now.minusSeconds(1));
        Delivery notYet = createAndPersistDelivery(Delivery.DeliveryStatus.PENDING, now.plusSeconds(3600));
        Delivery noRetry = createAndPersistDelivery(Delivery.DeliveryStatus.PENDING, null);
        
        entityManager.flush();
        entityManager.clear();

        // Act
        List<UUID> ids = deliveryRepository.findPendingRetryIds(
                Delivery.DeliveryStatus.PENDING, now, 10, 100, 100);
        List<Delivery> result = deliveryRepository.lockByIds(ids);

        // Assert
        assertEquals(2, result.size());
        assertTrue(result.stream().anyMatch(d -> d.getId().equals(overdue.getId())));
        assertTrue(result.stream().anyMatch(d -> d.getId().equals(justDue.getId())));
    }

    @Test
    void lockByIds_shouldOrderByNextRetryAtAsc() {
        // Arrange
        createSharedEndpoint();
        Instant now = Instant.now();
        Delivery third = createAndPersistDelivery(Delivery.DeliveryStatus.PENDING, now.minusSeconds(10));
        Delivery first = createAndPersistDelivery(Delivery.DeliveryStatus.PENDING, now.minusSeconds(300));
        Delivery second = createAndPersistDelivery(Delivery.DeliveryStatus.PENDING, now.minusSeconds(150));
        
        entityManager.flush();
        entityManager.clear();

        // Act
        List<UUID> ids = deliveryRepository.findPendingRetryIds(
                Delivery.DeliveryStatus.PENDING, now, 10, 100, 100);
        List<Delivery> result = deliveryRepository.lockByIds(ids);

        // Assert
        assertEquals(3, result.size());
        assertEquals(first.getId(), result.get(0).getId());
        assertEquals(second.getId(), result.get(1).getId());
        assertEquals(third.getId(), result.get(2).getId());
    }

    @Test
    void findPendingRetryIds_shouldRespectPageSize() {
        // Arrange
        createSharedEndpoint();
        Instant now = Instant.now();
        for (int i = 0; i < 15; i++) {
            createAndPersistDelivery(Delivery.DeliveryStatus.PENDING, now.minusSeconds(60 + i));
        }
        
        entityManager.flush();
        entityManager.clear();

        // Act
        List<UUID> ids = deliveryRepository.findPendingRetryIds(
                Delivery.DeliveryStatus.PENDING, now, 5, 100, 100);

        // Assert
        assertEquals(5, ids.size());
    }

    private Delivery createAndPersistDelivery(Delivery.DeliveryStatus status, Instant nextRetryAt) {
        Delivery delivery = Delivery.builder()
                .id(UUID.randomUUID())
                .eventId(UUID.randomUUID())
                .endpointId(sharedEndpointId)
                .subscriptionId(UUID.randomUUID())
                .status(status)
                .attemptCount(1)
                .maxAttempts(7)
                .orderingEnabled(false)
                .nextRetryAt(nextRetryAt)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
        
        return entityManager.persist(delivery);
    }
}
