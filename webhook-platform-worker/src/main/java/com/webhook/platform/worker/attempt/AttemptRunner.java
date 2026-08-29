package com.webhook.platform.worker.attempt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.common.security.UrlValidator;
import com.webhook.platform.common.util.HeaderSanitizer;
import com.webhook.platform.worker.service.CircuitBreakerService;
import com.webhook.platform.worker.service.PayloadTransformException;
import com.webhook.platform.worker.service.ProjectRateLimiterService;
import com.webhook.platform.worker.service.RedisConcurrencyControlService;
import com.webhook.platform.worker.service.RedisRateLimiterService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Owns what happens during one Attempt, and in what order. Both directions run this; what
 * differs is behind {@link AttemptStore}.
 *
 * <p>Five invariants, each of which was once correct on one direction and wrong on the other:
 *
 * <ol>
 *   <li>No DB, Redis or Kafka work inside the reactive chain — a write there can trip the
 *       HTTP timeout and drive the failure path over a SUCCESS already written.</li>
 *   <li>No successor Attempt unless {@link AttemptStore#finalise} reports it wrote.</li>
 *   <li>Every path that takes a concurrency permit releases it, including those that throw
 *       before the request is built.</li>
 *   <li>A failed transformation never lets the raw payload out.</li>
 *   <li>A Deferral is not an Attempt: it consumes nothing and advances no Ladder.</li>
 * </ol>
 */
@Component
@Slf4j
public class AttemptRunner {

    private final ProjectRateLimiterService tenantRateLimiter;
    private final RedisRateLimiterService targetRateLimiter;
    private final RedisConcurrencyControlService concurrencyControl;
    private final CircuitBreakerService circuitBreaker;
    private final ObjectMapper objectMapper;
    private final boolean allowPrivateIps;
    private final List<String> allowedHosts;

    public AttemptRunner(
            ProjectRateLimiterService tenantRateLimiter,
            RedisRateLimiterService targetRateLimiter,
            RedisConcurrencyControlService concurrencyControl,
            CircuitBreakerService circuitBreaker,
            ObjectMapper objectMapper,
            @Value("${webhook.url-validation.allow-private-ips:false}") boolean allowPrivateIps,
            @Value("${webhook.url-validation.allowed-hosts:}") List<String> allowedHosts) {
        this.tenantRateLimiter = tenantRateLimiter;
        this.targetRateLimiter = targetRateLimiter;
        this.concurrencyControl = concurrencyControl;
        this.circuitBreaker = circuitBreaker;
        this.objectMapper = objectMapper;
        this.allowPrivateIps = allowPrivateIps;
        this.allowedHosts = allowedHosts;
    }

    /**
     * Claim, admit, send, classify, finalise. Returns quietly when there was nothing to do —
     * the obligation was already claimed by somebody else, or was deferred.
     */
    public <C> void run(AttemptStore<C> store, AttemptMetrics metrics) {
        ClaimResult<C> claimed = store.claim();

        if (claimed instanceof ClaimResult.NotClaimed<C> notClaimed) {
            log.debug("Nothing to attempt: {}", notClaimed.reason());
            return;
        }
        if (claimed instanceof ClaimResult.Deferred<C> deferred) {
            log.debug("Deferred until {}: {}", deferred.until(), deferred.reason());
            return;
        }

        ClaimResult.Claimed<C> held = (ClaimResult.Claimed<C>) claimed;
        attempt(store, metrics, held.claim(), held.context());
    }

    private <C> void attempt(AttemptStore<C> store, AttemptMetrics metrics, C claim, AttemptContext ctx) {
        long startedAt = System.currentTimeMillis();

        // Before admission: no number of retries resolves an address we may not talk to.
        try {
            UrlValidator.validateWebhookUrl(ctx.url(), allowPrivateIps, allowedHosts);
        } catch (UrlValidator.InvalidUrlException e) {
            String reason = "SSRF_PROTECTION: " + e.getMessage();
            log.error("{}: {}", ctx.description(), reason);
            store.recordAttempt(claim, errorRecord(null, null, reason, elapsed(startedAt)));
            terminallyFail(store, claim, reason);
            return;
        }

        if (!admit(store, claim, ctx)) {
            return;
        }

        // Everything from here holds a concurrency permit.
        String requestHeaders = null;
        String body = null;
        try {
            // Outgoing signs exactly these bytes, so the body comes before the request.
            body = store.buildBody(claim);

            RequestSpec spec = store.buildRequest(claim, body);
            requestHeaders = spec.recordedHeaders();

            store.attemptStarting(claim);

            Response response = send(spec, ctx, body);

            if (response == null) {
                // Otherwise the obligation stays claimed until the stuck sweep picks it up.
                fail(store, metrics, claim, ctx, "Empty response from " + ctx.url(),
                        requestHeaders, body, elapsed(startedAt));
                return;
            }

            classify(store, metrics, claim, ctx, response, requestHeaders, body, elapsed(startedAt));

        } catch (PayloadTransformException e) {
            // Retryable, so a template fixed in time still gets the webhook out.
            metrics.transformFailed();
            String reason = "TRANSFORM_FAILED: " + e.getMessage();
            log.error("{}: refusing to send the raw payload: {}", ctx.description(), reason);
            fail(store, metrics, claim, ctx, reason, requestHeaders, null, elapsed(startedAt));
        } catch (Exception e) {
            log.error("{}: request failed: {}", ctx.description(), e.getMessage());
            fail(store, metrics, claim, ctx, e.getMessage(), requestHeaders, body, elapsed(startedAt));
        } finally {
            concurrencyControl.release(ctx.targetKey());
        }
    }

    /**
     * The three limits, in the order a rejection is cheapest to discover. Returns true with a
     * concurrency permit held; false having already finalised the obligation as deferred.
     */
    private <C> boolean admit(AttemptStore<C> store, C claim, AttemptContext ctx) {
        if (!tenantRateLimiter.tryAcquire(ctx.tenantKey())) {
            return defer(store, claim, ctx, 1, 30, "tenant rate limit exceeded");
        }

        if (!circuitBreaker.isCallPermitted(ctx.targetKey())) {
            // Recorded though nothing was sent: a quiet target should show the breaker.
            store.recordAttempt(claim, errorRecord(null, null, "CIRCUIT_BREAKER_OPEN", 0));
            return defer(store, claim, ctx, "circuit breaker open", Instant.now().plusSeconds(30));
        }

        Integer perTarget = ctx.targetRateLimitPerSecond();
        if (perTarget != null && !targetRateLimiter.tryAcquire(ctx.targetKey(), perTarget)) {
            return defer(store, claim, ctx, 2, 60, "target rate limit exceeded");
        }

        if (!concurrencyControl.tryAcquire(ctx.targetKey())) {
            return defer(store, claim, ctx, 2, 60, "target concurrency limit reached");
        }

        return true;
    }

    /** Ends the obligation for good, releasing what it held — under invariant 2, as a successor is. */
    private <C> void terminallyFail(AttemptStore<C> store, C claim, String reason) {
        if (store.finalise(claim, new Finalization.TerminallyFailed(reason))) {
            store.onTerminallyFailed(claim);
        } else {
            log.warn("terminal finalisation did not apply — the obligation is owned by another "
                    + "attempt now, so nothing was released: {}", reason);
        }
    }

    private <C> boolean defer(AttemptStore<C> store, C claim, AttemptContext ctx,
            long baseSeconds, long maxSeconds, String reason) {
        long delay = RetryPolicy.backoffWithJitter(ctx.attemptNumber(), baseSeconds, maxSeconds);
        return defer(store, claim, ctx, reason, Instant.now().plusSeconds(delay));
    }

    private <C> boolean defer(AttemptStore<C> store, C claim, AttemptContext ctx,
            String reason, Instant until) {
        log.warn("{}: {}, deferring until {}", ctx.description(), reason, until);
        store.finalise(claim, new Finalization.Deferred(until, reason));
        return false;
    }

    private Response send(RequestSpec spec, AttemptContext ctx, String body) {
        WebClient.RequestBodySpec request = spec.client().post().uri(ctx.url());
        spec.headers().accept(request);

        // Invariant 1: the mono produces the raw HTTP outcome and nothing else.
        return request.bodyValue(body != null ? body : "")
                .exchangeToMono(response -> {
                    int status = response.statusCode().value();
                    String headers = serialiseHeaders(response.headers().asHttpHeaders());
                    return response.bodyToMono(String.class)
                            .defaultIfEmpty("")
                            .map(responseBody -> new Response(status, responseBody, headers));
                })
                .timeout(Duration.ofSeconds(ctx.timeoutSeconds()))
                .block();
    }

    private <C> void classify(AttemptStore<C> store, AttemptMetrics metrics, C claim,
            AttemptContext ctx, Response response, String requestHeaders, String body, int durationMs) {
        int status = response.status();
        AttemptRecord record = new AttemptRecord(status, response.body(), response.headers(),
                requestHeaders, body, null, durationMs);

        if (status >= 200 && status < 300) {
            metrics.success(status, durationMs);
            circuitBreaker.recordSuccess(ctx.targetKey(), durationMs);
            store.recordAttempt(claim, record);
            if (store.finalise(claim, new Finalization.Succeeded())) {
                store.onSucceeded(claim);
            }
            return;
        }

        metrics.failure(status, durationMs);
        store.recordAttempt(claim, record);

        if (RetryPolicy.isRetryable(status)) {
            circuitBreaker.recordFailure(ctx.targetKey(), new RuntimeException("HTTP " + status));
            retryOrAbandon(store, claim, ctx, "Retryable HTTP " + status);
        } else {
            circuitBreaker.recordFailure(ctx.targetKey(), new RuntimeException("Non-retryable HTTP " + status));
            terminallyFail(store, claim, "Non-retryable HTTP " + status);
        }
    }

    private <C> void fail(AttemptStore<C> store, AttemptMetrics metrics, C claim, AttemptContext ctx,
            String errorMessage, String requestHeaders, String body, int durationMs) {
        metrics.error(durationMs);
        circuitBreaker.recordFailure(ctx.targetKey(), new RuntimeException(String.valueOf(errorMessage)));
        store.recordAttempt(claim, errorRecord(requestHeaders, body, errorMessage, durationMs));
        retryOrAbandon(store, claim, ctx, errorMessage);
    }

    private <C> void retryOrAbandon(AttemptStore<C> store, C claim, AttemptContext ctx, String reason) {
        if (ctx.ladder().isExhausted(ctx.attemptNumber())) {
            log.warn("{}: ladder exhausted after {} attempts, abandoning: {}",
                    ctx.description(), ctx.attemptNumber(), reason);
            if (store.finalise(claim, new Finalization.Abandoned(reason))) {
                store.onAbandoned(claim);
            }
            return;
        }

        Instant next = ctx.ladder().nextRetryAt(ctx.attemptNumber());
        // Invariant 2: only the Attempt that actually finalised may queue a successor.
        if (store.finalise(claim, new Finalization.Retry(next, reason))) {
            log.info("{}: attempt {} failed ({}), next at {}",
                    ctx.description(), ctx.attemptNumber(), reason, next);
        } else {
            log.warn("{}: finalisation did not apply — the obligation is owned by another "
                    + "attempt now, so no successor was queued", ctx.description());
        }
    }

    private AttemptRecord errorRecord(String requestHeaders, String body, String errorMessage, int durationMs) {
        return new AttemptRecord(null, null, null, requestHeaders, body, errorMessage, durationMs);
    }

    private int elapsed(long startedAt) {
        return (int) (System.currentTimeMillis() - startedAt);
    }

    private String serialiseHeaders(HttpHeaders headers) {
        try {
            Map<String, String> flattened = new HashMap<>();
            headers.forEach((key, values) -> {
                if (values != null && !values.isEmpty()) {
                    flattened.put(key, values.get(0));
                }
            });
            return objectMapper.writeValueAsString(HeaderSanitizer.sanitize(flattened));
        } catch (Exception e) {
            log.warn("Failed to serialise response headers: {}", e.getMessage());
            return "{}";
        }
    }

    private record Response(int status, String body, String headers) {
    }
}
