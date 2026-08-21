package com.webhook.platform.worker.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaAdmin;

import java.net.ServerSocket;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Unit coverage for DlqMonitoringService (P1-22). DlqMonitoringService builds its own
 * AdminClient internally (AdminClient.create(...)) rather than taking one as a
 * collaborator, so it can't be mocked the usual way -- instead this points a real
 * KafkaAdmin at an address nothing is listening on, with a short bounded timeout (the
 * P0-06 fix this class documents: an unbounded AdminClient call here would starve every
 * other @Scheduled job sharing the pool), and verifies the scheduled poll degrades
 * gracefully rather than hanging or throwing.
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
    void registersGaugeAtConstruction() {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        service = new DlqMonitoringService(kafkaAdminNoNetwork(), meterRegistry, 1);

        var gauge = meterRegistry.find("webhook_dlq_depth")
                .tag("topic", com.webhook.platform.common.constants.KafkaTopics.DELIVERIES_DLQ)
                .gauge();
        assertNotNull(gauge, "webhook_dlq_depth gauge must be registered at construction");
        assertEquals(0.0, gauge.value(), "depth must start at 0 before the first poll");
    }

    @Test
    void monitorDlqDepth_brokerUnreachable_boundedTimeout_doesNotThrowOrHang() throws Exception {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        service = new DlqMonitoringService(unreachableKafkaAdmin(), meterRegistry, 1);

        long start = System.currentTimeMillis();
        assertDoesNotThrow(() -> service.monitorDlqDepth());
        long elapsedMs = System.currentTimeMillis() - start;

        // The whole point of the P0-06-adjacent bounded .get() calls: this must return
        // quickly (well under the scheduler's own poll interval), not hang indefinitely
        // waiting on an unreachable broker.
        org.junit.jupiter.api.Assertions.assertTrue(elapsedMs < 15_000,
                "monitorDlqDepth must respect the configured timeout, took " + elapsedMs + "ms");

        var gauge = meterRegistry.find("webhook_dlq_depth").gauge();
        assertNotNull(gauge);
        assertEquals(0.0, gauge.value(), "depth must remain 0 (not update) when the broker call fails");
    }

    @Test
    void close_shutsDownAdminClientWithoutThrowing() {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        service = new DlqMonitoringService(kafkaAdminNoNetwork(), meterRegistry, 1);

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
