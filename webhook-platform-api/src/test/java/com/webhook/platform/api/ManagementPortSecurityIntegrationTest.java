package com.webhook.platform.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The Compose deployment splits actuator onto its own port so Prometheus can
 * scrape metrics without a JWT or an API key — that reasoning is written down in
 * three places: SecurityConfig's comment on the /actuator matchers,
 * monitoring/prometheus/prometheus.yml, and monitoring/README.md.
 *
 * <p>It was not true. Boot copies the parent context's servlet filters into the
 * management child context, so the main filter chain applied to the management
 * port as well and /actuator/prometheus answered 401 there — metrics scraping
 * has been quietly broken, with the comments asserting it worked.</p>
 *
 * <p>This pins both halves: open on the management port, closed on the main one.
 * The second half is the one that matters if this ever regresses in the other
 * direction — the management port is deliberately never published to the host,
 * and the main port very much is.</p>
 */
@TestPropertySource(properties = "management.server.port=0")
public class ManagementPortSecurityIntegrationTest extends AbstractIntegrationTest {

    @LocalServerPort
    private int serverPort;

    @LocalManagementPort
    private int managementPort;

    @Autowired
    private TestRestTemplate rest;

    @Test
    public void metricsAreScrapableOnTheManagementPort() {
        ResponseEntity<String> response =
                rest.getForEntity("http://localhost:" + managementPort + "/actuator/prometheus", String.class);

        assertThat(response.getStatusCode())
                .as("Prometheus scrapes this port with no credentials")
                .isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).contains("jvm_memory_used_bytes");
    }

    @Test
    public void healthIsReachableOnTheManagementPort() {
        ResponseEntity<String> response =
                rest.getForEntity("http://localhost:" + managementPort + "/actuator/health/liveness", String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    public void metricsStayClosedOnTheMainPort() {
        ResponseEntity<String> response =
                rest.getForEntity("http://localhost:" + serverPort + "/actuator/prometheus", String.class);

        assertThat(response.getStatusCode())
                .as("the main port is the published one; metrics must not be anonymous there")
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    public void theManagementPortIsActuatorOnly() {
        // Opening the management port must not open the platform API on it.
        ResponseEntity<String> response =
                rest.getForEntity("http://localhost:" + managementPort + "/api/v1/projects", String.class);

        assertThat(response.getStatusCode()).isNotEqualTo(HttpStatus.OK);
    }
}
