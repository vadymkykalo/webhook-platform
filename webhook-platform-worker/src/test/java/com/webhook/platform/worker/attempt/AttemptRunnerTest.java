package com.webhook.platform.worker.attempt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.common.retry.RetryLadder;
import com.webhook.platform.worker.service.CircuitBreakerService;
import com.webhook.platform.worker.service.PayloadTransformException;
import com.webhook.platform.worker.service.ProjectRateLimiterService;
import com.webhook.platform.worker.service.RedisConcurrencyControlService;
import com.webhook.platform.worker.service.RedisRateLimiterService;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The Runner's interface is the test surface.
 *
 * <p>These are the invariants that were, at some point, correct on one direction and wrong on
 * the other — commit {@code 2070d30} hand-ported four of them. Now they hold for both
 * directions or for neither, and this suite is what says so. A fake {@link AttemptStore}
 * stands in for the row model, so none of it needs Postgres, Kafka or Redis.
 *
 * <p>Deliberately a plain {@code *Test}: no container is involved, so it must run in the
 * no-Docker unit job — see {@code scripts/check-test-routing.sh}.
 */
class AttemptRunnerTest {

    private HttpServer server;
    private String baseUrl;

    private ProjectRateLimiterService tenantRateLimiter;
    private RedisRateLimiterService targetRateLimiter;
    private RedisConcurrencyControlService concurrency;
    private CircuitBreakerService circuitBreaker;
    private AttemptRunner runner;
    private RecordingMetrics metrics;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/hook";

        tenantRateLimiter = mock(ProjectRateLimiterService.class);
        targetRateLimiter = mock(RedisRateLimiterService.class);
        concurrency = mock(RedisConcurrencyControlService.class);
        circuitBreaker = mock(CircuitBreakerService.class);

        lenient().when(tenantRateLimiter.tryAcquire(any(UUID.class))).thenReturn(true);
        lenient().when(targetRateLimiter.tryAcquire(any(UUID.class), anyInt())).thenReturn(true);
        lenient().when(concurrency.tryAcquire(any(UUID.class))).thenReturn(true);
        lenient().when(circuitBreaker.isCallPermitted(any(UUID.class))).thenReturn(true);

        metrics = new RecordingMetrics();
        // allowPrivateIps = true: the fake server is on loopback.
        runner = new AttemptRunner(tenantRateLimiter, targetRateLimiter, concurrency,
                circuitBreaker, new ObjectMapper(), true, List.of());
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    private void respond(int status, String body) {
        server.createContext("/hook", exchange -> {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        });
    }

    // ── the invariant that cost a duplicated webhook ────────────────────────────────

    @Nested
    @DisplayName("no successor unless the finalisation applied")
    class SuccessorGating {

        @Test
        @DisplayName("a retryable failure whose finalisation applied queues exactly one successor")
        void appliedRetryQueuesSuccessor() {
            respond(503, "unavailable");
            FakeStore store = new FakeStore(baseUrl);

            runner.run(store, metrics);

            assertEquals(1, store.finalizations.size());
            assertInstanceOf(Finalization.Retry.class, store.finalizations.get(0));
        }

        @Test
        @DisplayName("a finalisation that did not apply queues nothing and abandons nothing")
        void refusedFinalisationQueuesNothing() {
            respond(503, "unavailable");
            FakeStore store = new FakeStore(baseUrl);
            store.finaliseApplies = false; // the row was reclaimed while we were sending

            runner.run(store, metrics);

            assertEquals(1, store.finalizations.size(), "it must still try exactly once");
            assertEquals(0, store.abandonedCalls, "a refused finalisation must not trigger the DLQ side effect");
            assertEquals(0, store.succeededCalls);
        }

        @Test
        @DisplayName("a success whose finalisation did not apply does not run the success side effect")
        void refusedSuccessDoesNotReleaseOrdering() {
            respond(200, "ok");
            FakeStore store = new FakeStore(baseUrl);
            store.finaliseApplies = false;

            runner.run(store, metrics);

            assertEquals(0, store.succeededCalls,
                    "releasing the ordering buffer for a row we no longer own would let a successor through early");
        }
    }

    // ── classification ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("classification")
    class Classification {

        @Test
        @DisplayName("2xx succeeds and runs the success side effect once")
        void success() {
            respond(200, "ok");
            FakeStore store = new FakeStore(baseUrl);

            runner.run(store, metrics);

            assertInstanceOf(Finalization.Succeeded.class, store.finalizations.get(0));
            assertEquals(1, store.succeededCalls);
            assertEquals(1, metrics.successes);
            assertEquals(200, store.records.get(0).statusCode());
        }

        @Test
        @DisplayName("a non-retryable status fails terminally rather than burning the ladder")
        void nonRetryableIsTerminal() {
            respond(400, "bad request");
            FakeStore store = new FakeStore(baseUrl);

            runner.run(store, metrics);

            assertInstanceOf(Finalization.TerminallyFailed.class, store.finalizations.get(0));
            assertEquals(1, metrics.failures);
        }

        @Test
        @DisplayName("a retryable status on the last rung abandons to DLQ and runs the abandon side effect")
        void lastRungAbandons() {
            respond(500, "boom");
            FakeStore store = new FakeStore(baseUrl);
            store.attemptNumber = 3;
            store.ladder = RetryLadder.parse("60", 3); // exhausted at attempt 3

            runner.run(store, metrics);

            assertInstanceOf(Finalization.Abandoned.class, store.finalizations.get(0));
            assertEquals(1, store.abandonedCalls);
        }

        @Test
        @DisplayName("every attempt is recorded, including the ones that never reached the network")
        void attemptsAreAlwaysRecorded() {
            FakeStore store = new FakeStore("http://169.254.169.254/latest/meta-data/");

            runner.run(store, metrics);

            assertEquals(1, store.records.size());
            assertTrue(store.records.get(0).errorMessage().contains("SSRF_PROTECTION"));
            assertNull(store.records.get(0).statusCode());
        }
    }

    // ── admission ──────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("admission")
    class Admission {

        @Test
        @DisplayName("a tenant rate limit defers without consuming an attempt or sending anything")
        void tenantRateLimitDefers() {
            FakeStore store = new FakeStore(baseUrl);
            when(tenantRateLimiter.tryAcquire(any(UUID.class))).thenReturn(false);

            runner.run(store, metrics);

            assertInstanceOf(Finalization.Deferred.class, store.finalizations.get(0));
            assertEquals(0, store.attemptStartingCalls, "a deferral is not an attempt");
            assertEquals(0, store.records.size());
        }

        @Test
        @DisplayName("an open circuit breaker defers, and records the reason so the gap is explicable")
        void circuitBreakerDefersAndRecords() {
            FakeStore store = new FakeStore(baseUrl);
            when(circuitBreaker.isCallPermitted(any(UUID.class))).thenReturn(false);

            runner.run(store, metrics);

            assertInstanceOf(Finalization.Deferred.class, store.finalizations.get(0));
            assertEquals("CIRCUIT_BREAKER_OPEN", store.records.get(0).errorMessage());
        }

        @Test
        @DisplayName("a concurrency cap defers and takes no permit to release")
        void concurrencyCapDefers() {
            FakeStore store = new FakeStore(baseUrl);
            when(concurrency.tryAcquire(any(UUID.class))).thenReturn(false);

            runner.run(store, metrics);

            assertInstanceOf(Finalization.Deferred.class, store.finalizations.get(0));
            assertEquals(0, store.attemptStartingCalls);
        }

        @Test
        @DisplayName("a blocked URL is terminal and is rejected before any permit is taken")
        void blockedUrlIsTerminalAndCostsNoPermit() {
            FakeStore store = new FakeStore("http://169.254.169.254/latest/meta-data/");

            runner.run(store, metrics);

            assertInstanceOf(Finalization.TerminallyFailed.class, store.finalizations.get(0));
            assertEquals(0, store.attemptStartingCalls);
            org.mockito.Mockito.verify(concurrency, org.mockito.Mockito.never()).tryAcquire(any(UUID.class));
        }
    }

    // ── the transformation rule ────────────────────────────────────────────────────

    @Nested
    @DisplayName("a failed transformation never lets the raw payload out")
    class TransformFailure {

        @Test
        @DisplayName("it is retryable, nothing is sent, and the raw payload is not in the record")
        void retryableAndNothingSent() {
            respond(200, "ok"); // would succeed if anything were sent
            FakeStore store = new FakeStore(baseUrl);
            store.bodyFailure = new PayloadTransformException("template gone");

            runner.run(store, metrics);

            assertInstanceOf(Finalization.Retry.class, store.finalizations.get(0));
            assertEquals(1, metrics.transformFailures);
            assertEquals(0, store.attemptStartingCalls, "nothing may be sent");
            assertNull(store.records.get(0).requestBody(),
                    "the raw payload must not be recorded as if it had been sent");
            assertTrue(store.records.get(0).errorMessage().contains("TRANSFORM_FAILED"));
        }
    }

    // ── claim outcomes ─────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("claim outcomes")
    class Claiming {

        @Test
        @DisplayName("NotClaimed does nothing at all")
        void notClaimedDoesNothing() {
            FakeStore store = new FakeStore(baseUrl);
            store.claimResult = new ClaimResult.NotClaimed<>("somebody else owns it");

            runner.run(store, metrics);

            assertTrue(store.finalizations.isEmpty());
            assertTrue(store.records.isEmpty());
        }

        @Test
        @DisplayName("Deferred does nothing further — the store already stamped the row")
        void deferredDoesNothingFurther() {
            FakeStore store = new FakeStore(baseUrl);
            store.claimResult = new ClaimResult.Deferred<>(Instant.now().plusSeconds(5), "ordering");

            runner.run(store, metrics);

            assertTrue(store.finalizations.isEmpty(),
                    "the store finalised it as part of claiming; the Runner must not write again");
            assertEquals(0, store.attemptStartingCalls);
        }
    }

    // ── the fake ───────────────────────────────────────────────────────────────────

    /**
     * Stands in for a row model. Records what the Runner asked it to do, which is the whole
     * point: these tests assert observable outcomes through the interface rather than reaching
     * past it into either direction's tables.
     */
    private static final class FakeStore implements AttemptStore<String> {

        private final String url;

        ClaimResult<String> claimResult;
        RetryLadder ladder = RetryLadder.parse("60,300", 5);
        int attemptNumber = 1;
        boolean finaliseApplies = true;
        PayloadTransformException bodyFailure;

        final List<Finalization> finalizations = new ArrayList<>();
        final List<AttemptRecord> records = new ArrayList<>();
        int attemptStartingCalls;
        int abandonedCalls;
        int succeededCalls;

        FakeStore(String url) {
            this.url = url;
        }

        @Override
        public ClaimResult<String> claim() {
            if (claimResult != null) {
                return claimResult;
            }
            return new ClaimResult.Claimed<>("claim-1", new AttemptContext(
                    "fake attempt", UUID.randomUUID(), UUID.randomUUID(), null,
                    attemptNumber, ladder, url, 5));
        }

        @Override
        public RequestSpec buildRequest(String claim, String body) {
            return new RequestSpec(WebClient.builder().build(),
                    request -> request.header("X-Test", "1"), "{\"X-Test\":\"1\"}");
        }

        @Override
        public String buildBody(String claim) {
            if (bodyFailure != null) {
                throw bodyFailure;
            }
            return "{\"transformed\":true}";
        }

        @Override
        public void attemptStarting(String claim) {
            attemptStartingCalls++;
        }

        @Override
        public void recordAttempt(String claim, AttemptRecord record) {
            records.add(record);
        }

        @Override
        public boolean finalise(String claim, Finalization outcome) {
            finalizations.add(outcome);
            return finaliseApplies;
        }

        @Override
        public void onAbandoned(String claim) {
            abandonedCalls++;
        }

        @Override
        public void onSucceeded(String claim) {
            succeededCalls++;
        }
    }

    private static final class RecordingMetrics implements AttemptMetrics {
        int successes;
        int failures;
        int errors;
        int transformFailures;

        @Override
        public void success(int statusCode, int durationMs) {
            successes++;
        }

        @Override
        public void failure(int statusCode, int durationMs) {
            failures++;
        }

        @Override
        public void error(int durationMs) {
            errors++;
        }

        @Override
        public void transformFailed() {
            transformFailures++;
        }
    }
}
