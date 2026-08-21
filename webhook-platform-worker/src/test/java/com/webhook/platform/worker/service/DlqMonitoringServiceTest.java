package com.webhook.platform.worker.service;

import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.kafka.core.KafkaAdmin;

import java.net.ServerSocket;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.when;

/**
 * Unit coverage for DlqMonitoringService.
 *
 * <p>P1-26: {@code webhook_dlq_depth} used to be computed as a Kafka latest-earliest offset
 * difference on the {@code deliveries.dlq} topic -- i.e. total retained volume, not actionable
 * backlog, since nothing consumes that topic. It never returned to 0 after remediation. It is
 * now backed by {@code DeliveryRepository#countDlqTotal()} (the same status column {@code
 * DlqService#retryDeliveries}/{@code #purgeAllDlq} mutate on the API side), and the old
 * Kafka-based computation lives on separately as the purely informational {@code
 * webhook_dlq_topic_retained_total}.
 *
 * <p>DlqMonitoringService builds its own AdminClient internally (AdminClient.create(...))
 * rather than taking one as a collaborator, so the Kafka side can't be mocked the usual way --
 * instead this points a real KafkaAdmin at an address nothing is listening on, with a short
 * bounded timeout (the P0-06 fix this class documents: an unbounded AdminClient call here would
 * starve every other @Scheduled job sharing the pool), and verifies the scheduled poll degrades
 * gracefully rather than hanging or throwing. DeliveryRepository, by contrast, is a plain Spring
 * Data interface and is mocked directly.
 */
class DlqMonitoringServiceTest {

    private DlqMonitoringService service;

    @AfterEach
    void tearDown() {
        if (service != null) {
            assertDoesNotThrow(() -> service.close());
        }
    }

    private KafkaAdmin unreachableKafkaAdmin() throws Exception {
        int closedPort;
        try (ServerSocket serverSocket = new ServerSocket(0)) {
            closedPort = serverSocket.getLocalPort();
        }
        Map<String, Object> props = new HashMap<>();
        props.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, "127.0.0.1:" + closedPort);
        props.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, "500");
        props.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, "500");
        props.put(AdminClientConfig.RETRIES_CONFIG, "0");
        props.put(AdminClientConfig.RECONNECT_BACKOFF_MS_CONFIG, "50");
        props.put(AdminClientConfig.RECONNECT_BACKOFF_MAX_MS_CONFIG, "100");
        KafkaAdmin admin = new KafkaAdmin(props);
        admin.setFatalIfBrokerNotAvailable(false);
        return admin;
    }

    @Test
    void registersBothGaugesAtConstruction() {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        DeliveryRepository deliveryRepository = Mockito.mock(DeliveryRepository.class);
        service = new DlqMonitoringService(kafkaAdminNoNetwork(), deliveryRepository, meterRegistry, 1);

        var actionable = meterRegistry.find("webhook_dlq_depth")
                .tag("topic", com.webhook.platform.common.constants.KafkaTopics.DELIVERIES_DLQ)
                .gauge();
        assertNotNull(actionable, "webhook_dlq_depth gauge must be registered at construction");
        assertEquals(0.0, actionable.value(), "actionable depth must start at 0 before the first poll");

        var retained = meterRegistry.find("webhook_dlq_topic_retained_total")
                .tag("topic", com.webhook.platform.common.constants.KafkaTopics.DELIVERIES_DLQ)
                .gauge();
        assertNotNull(retained, "webhook_dlq_topic_retained_total gauge must be registered at construction");
        assertEquals(0.0, retained.value());
    }

    @Test
    void monitorDlqDepth_actionableDepth_reflectsDbDlqCount_independentOfKafka() throws Exception {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        DeliveryRepository deliveryRepository = Mockito.mock(DeliveryRepository.class);
        when(deliveryRepository.countDlqTotal()).thenReturn(7L);
        // Kafka is unreachable -- must not affect the DB-backed gauge at all.
        service = new DlqMonitoringService(unreachableKafkaAdmin(), deliveryRepository, meterRegistry, 1);

        service.monitorDlqDepth();

        var actionable = meterRegistry.find("webhook_dlq_depth").gauge();
        assertNotNull(actionable);
        assertEquals(7.0, actionable.value());
    }

    @Test
    void monitorDlqDepth_actionableDepth_returnsToZero_afterBacklogCleared() {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        DeliveryRepository deliveryRepository = Mockito.mock(DeliveryRepository.class);
        when(deliveryRepository.countDlqTotal()).thenReturn(12L);
        service = new DlqMonitoringService(kafkaAdminNoNetwork(), deliveryRepository, meterRegistry, 1);

        service.monitorDlqDepth();
        var gauge = meterRegistry.find("webhook_dlq_depth").gauge();
        assertNotNull(gauge);
        assertEquals(12.0, gauge.value(), "depth must reflect the DLQ backlog while it exists");

        // Backlog worked through (retried/purged via DlqService on the API side) -- the next
        // poll must see the DB count go back to 0. This is exactly the P1-26 regression: the
        // old Kafka-retention-based computation never did this.
        when(deliveryRepository.countDlqTotal()).thenReturn(0L);
        service.monitorDlqDepth();

        assertEquals(0.0, gauge.value(), "depth must return to 0 once the DLQ backlog is cleared");
    }

    @Test
    void monitorDlqDepth_topicRetainedDepth_brokerUnreachable_boundedTimeout_doesNotThrowOrHang() throws Exception {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        DeliveryRepository deliveryRepository = Mockito.mock(DeliveryRepository.class);
        service = new DlqMonitoringService(unreachableKafkaAdmin(), deliveryRepository, meterRegistry, 1);

        long start = System.currentTimeMillis();
        assertDoesNotThrow(() -> service.monitorDlqDepth());
        long elapsedMs = System.currentTimeMillis() - start;

        // The whole point of the P0-06-adjacent bounded .get() calls: this must return
        // quickly (well under the scheduler's own poll interval), not hang indefinitely
        // waiting on an unreachable broker.
        org.junit.jupiter.api.Assertions.assertTrue(elapsedMs < 15_000,
                "monitorDlqDepth must respect the configured timeout, took " + elapsedMs + "ms");

        var gauge = meterRegistry.find("webhook_dlq_topic_retained_total").gauge();
        assertNotNull(gauge);
        assertEquals(0.0, gauge.value(), "retained depth must remain 0 (not update) when the broker call fails");
    }

    @Test
    void close_shutsDownAdminClientWithoutThrowing() {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        DeliveryRepository deliveryRepository = Mockito.mock(DeliveryRepository.class);
        service = new DlqMonitoringService(kafkaAdminNoNetwork(), deliveryRepository, meterRegistry, 1);

        assertDoesNotThrow(() -> service.close());
        service = null; // already closed, don't double-close in tearDown
    }

    private KafkaAdmin kafkaAdminNoNetwork() {
        Map<String, Object> props = new HashMap<>();
        props.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, "127.0.0.1:1");
        KafkaAdmin admin = new KafkaAdmin(props);
        admin.setFatalIfBrokerNotAvailable(false);
        return admin;
    }
}
