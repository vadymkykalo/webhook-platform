package com.webhook.platform.worker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import com.jayway.jsonpath.PathNotFoundException;
import com.webhook.platform.common.dto.IncomingForwardMessage;
import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.common.enums.IncomingAuthType;
import com.webhook.platform.common.security.UrlValidator;
import com.webhook.platform.common.util.CryptoUtils;
import com.webhook.platform.worker.domain.entity.IncomingDestination;
import com.webhook.platform.worker.domain.entity.IncomingEvent;
import com.webhook.platform.worker.domain.entity.IncomingForwardAttempt;
import com.webhook.platform.worker.domain.repository.IncomingDestinationRepository;
import com.webhook.platform.worker.domain.repository.IncomingEventRepository;
import com.webhook.platform.worker.domain.repository.IncomingForwardAttemptRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.util.concurrent.ThreadLocalRandom;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import reactor.netty.http.client.HttpClient;

@Service
@Slf4j
public class IncomingForwardService {

    private final IncomingEventRepository eventRepository;
    private final IncomingDestinationRepository destinationRepository;
    private final IncomingForwardAttemptRepository attemptRepository;
    private final WebClient webClient;
    private final ObjectMapper objectMapper;
    private final String encryptionKey;
    private final String encryptionSalt;
    private final boolean allowPrivateIps;
    private final List<String> allowedHosts;
    private final MeterRegistry meterRegistry;
    private final TransactionTemplate transactionTemplate;

    private final Counter forwardSuccessCounter;
    private final Counter forwardFailureCounter;
    private final Counter forwardErrorCounter;
    private final Timer forwardLatency;

    public IncomingForwardService(
            IncomingEventRepository eventRepository,
            IncomingDestinationRepository destinationRepository,
            IncomingForwardAttemptRepository attemptRepository,
            WebClient.Builder webClientBuilder,
            ObjectMapper objectMapper,
            @Value("${webhook.encryption-key}") String encryptionKey,
            @Value("${webhook.encryption-salt}") String encryptionSalt,
            @Value("${webhook.url-validation.allow-private-ips:false}") boolean allowPrivateIps,
            @Value("${webhook.url-validation.allowed-hosts:}") List<String> allowedHosts,
            MeterRegistry meterRegistry,
            TransactionTemplate transactionTemplate) {
        this.eventRepository = eventRepository;
        this.destinationRepository = destinationRepository;
        this.attemptRepository = attemptRepository;
        HttpClient ssrfSafeHttpClient = SsrfProtectionCustomizer.createHttpClient(allowPrivateIps);
        this.webClient = webClientBuilder
                .clientConnector(new ReactorClientHttpConnector(ssrfSafeHttpClient))
                .defaultHeader("User-Agent", "WebhookPlatform/1.0-IncomingForward")
                .build();
        this.objectMapper = objectMapper;
        this.encryptionKey = encryptionKey;
        this.encryptionSalt = encryptionSalt;
        this.allowPrivateIps = allowPrivateIps;
        this.allowedHosts = allowedHosts;
        this.meterRegistry = meterRegistry;
        this.transactionTemplate = transactionTemplate;

        this.forwardSuccessCounter = Counter.builder("incoming_forward_attempts_total")
                .tag("result", "success").register(meterRegistry);
        this.forwardFailureCounter = Counter.builder("incoming_forward_attempts_total")
                .tag("result", "failure").register(meterRegistry);
        this.forwardErrorCounter = Counter.builder("incoming_forward_attempts_total")
                .tag("result", "error").register(meterRegistry);
        this.forwardLatency = Timer.builder("incoming_forward_latency_ms")
                .register(meterRegistry);
    }

    public void processForward(IncomingForwardMessage message) {
        UUID eventId = message.getIncomingEventId();
        UUID destinationId = message.getDestinationId();

        Optional<IncomingEvent> eventOpt = eventRepository.findById(eventId);
        if (eventOpt.isEmpty()) {
            log.error("Incoming event not found: {}", eventId);
            return;
        }

        Optional<IncomingDestination> destOpt = destinationRepository.findById(destinationId);
        if (destOpt.isEmpty()) {
            log.error("Incoming destination not found: {}", destinationId);
            return;
        }

        IncomingEvent event = eventOpt.get();
        IncomingDestination destination = destOpt.get();

        if (!destination.getEnabled()) {
            log.warn("Destination {} is disabled, skipping forward for event {}", destinationId, eventId);
            return;
        }

        // SSRF protection
        try {
            UrlValidator.validateWebhookUrl(destination.getUrl(), allowPrivateIps, allowedHosts);
        } catch (UrlValidator.InvalidUrlException e) {
            log.error("SSRF protection: invalid destination URL for forward eventId={}, destId={}: {}",
                    eventId, destinationId, e.getMessage());
            saveFailedAttempt(eventId, destinationId, "SSRF_PROTECTION: " + e.getMessage(), 0);
            return;
        }

        // --- Atomic claim: prevent duplicate HTTP sends ---
        //
        // Contract:
        //   First dispatch (attemptCount == 0): IngressService already created a PENDING
        //     row with attempt_number=1.  We claim it via atomic UPDATE … SET PROCESSING.
        //   Replay (replay == true, attemptCount > 0): API created a PENDING row with
        //     attempt_number = attemptCount.  We claim it the same way as first dispatch.
        //   Retry (attemptCount > 0, replay == false): IncomingForwardRetryScheduler
        //     already claimed the existing row (set PROCESSING) and published
        //     attemptCount = attemptNumber.  No re-claim needed.
        int attemptNumber;
        boolean isRetry = message.getAttemptCount() != null && message.getAttemptCount() > 0;
        boolean isReplay = message.isReplay();

        if (isReplay && isRetry) {
            // Replay path: API created a PENDING row — claim it
            attemptNumber = message.getAttemptCount();
            final int an = attemptNumber;
            Integer claimed = transactionTemplate
                    .execute(tx -> attemptRepository.claimForProcessing(eventId, destinationId, an));
            if (claimed == null || claimed == 0) {
                log.debug("Replay attempt already claimed or not PENDING: eventId={}, destId={}, attempt={}",
                        eventId, destinationId, attemptNumber);
                return;
            }
        } else if (isRetry) {
            // Retry path: scheduler already set the row to PROCESSING.
            // attemptCount IS the current attempt number (not previous).
            attemptNumber = message.getAttemptCount();
        } else {
            // First dispatch: claim the PENDING row created by IngressService
            attemptNumber = 1;
            Integer claimed = transactionTemplate
                    .execute(tx -> attemptRepository.claimForProcessing(eventId, destinationId, 1));
            if (claimed == null || claimed == 0) {
                log.debug("Forward attempt already claimed or not PENDING: eventId={}, destId={}, attempt={}",
                        eventId, destinationId, attemptNumber);
                return;
            }
        }

        int maxAttempts = destination.getMaxAttempts();
        attemptForward(event, destination, attemptNumber, maxAttempts);
    }

    private void attemptForward(IncomingEvent event, IncomingDestination destination,
            int attemptNumber, int maxAttempts) {
        long startTime = System.currentTimeMillis();
        UUID eventId = event.getId();
        UUID destinationId = destination.getId();

        log.info("Forwarding incoming event {} to destination {} (attempt {}/{})",
                eventId, destinationId, attemptNumber, maxAttempts);

        // Build request body — apply payload transformation if configured
        String body = transformPayload(event.getBodyRaw(), destination.getPayloadTransform());
        String contentType = event.getContentType() != null ? event.getContentType() : "application/json";

        // Idempotency key for downstream dedup
        String idempotencyKey = eventId + "-" + destinationId + "-" + attemptNumber;

        try {
            var requestSpec = webClient.post()
                    .uri(destination.getUrl())
                    .header("Content-Type", contentType)
                    .header("X-Incoming-Event-Id", eventId.toString())
                    .header("X-Incoming-Request-Id", event.getRequestId())
                    .header("X-Forward-Attempt", String.valueOf(attemptNumber))
                    .header("Idempotency-Key", idempotencyKey);

            // Add auth headers
            addAuthHeaders(requestSpec, destination);

            // Add custom headers
            addCustomHeaders(requestSpec, destination.getCustomHeadersJson());

            int timeoutSeconds = Math.max(1, Math.min(60, destination.getTimeoutSeconds()));

            requestSpec.bodyValue(body != null ? body : "")
                    .exchangeToMono(response -> {
                        int status = response.statusCode().value();
                        String responseHeaders = serializeHeaders(response.headers().asHttpHeaders());

                        return response.bodyToMono(String.class)
                                .defaultIfEmpty("")
                                .map(responseBody -> {
                                    int durationMs = (int) (System.currentTimeMillis() - startTime);
                                    forwardLatency.record(Duration.ofMillis(durationMs));

                                    handleResponse(eventId, destinationId, attemptNumber, maxAttempts,
                                            status, truncate(responseBody, 10240),
                                            responseHeaders, null, durationMs,
                                            destination.getRetryDelays());
                                    return status;
                                });
                    })
                    .timeout(Duration.ofSeconds(timeoutSeconds))
                    .block();

        } catch (Exception e) {
            int durationMs = (int) (System.currentTimeMillis() - startTime);
            log.error("Forward HTTP request failed for event {} to destination {}: {}",
                    eventId, destinationId, e.getMessage());
            handleError(eventId, destinationId, attemptNumber, maxAttempts,
                    e.getMessage(), durationMs, destination.getRetryDelays());
        }
    }

    private void handleResponse(UUID eventId, UUID destinationId, int attemptNumber, int maxAttempts,
            int statusCode, String responseBody, String responseHeaders,
            String errorMessage, int durationMs, String retryDelays) {
        boolean success = statusCode >= 200 && statusCode < 300;

        if (success) {
            forwardSuccessCounter.increment();
            updateAttempt(eventId, destinationId, attemptNumber, ForwardAttemptStatus.SUCCESS,
                    statusCode, responseHeaders, responseBody, null, durationMs, null);
            log.info("Forward succeeded: eventId={}, destId={}, attempt={}, status={}",
                    eventId, destinationId, attemptNumber, statusCode);
        } else if (isRetryable(statusCode)) {
            forwardFailureCounter.increment();
            if (attemptNumber >= maxAttempts) {
                updateAttempt(eventId, destinationId, attemptNumber, ForwardAttemptStatus.DLQ,
                        statusCode, responseHeaders, responseBody,
                        "Max attempts reached (HTTP " + statusCode + ")", durationMs, null);
                log.warn("Forward DLQ: eventId={}, destId={}, maxAttempts reached", eventId, destinationId);
            } else {
                // Schedule retry: update current attempt to final state, create next PENDING
                // attempt
                Instant nextRetry = calculateNextRetry(attemptNumber, retryDelays);
                updateAttempt(eventId, destinationId, attemptNumber, ForwardAttemptStatus.FAILED,
                        statusCode, responseHeaders, responseBody,
                        "Retryable HTTP " + statusCode, durationMs, null);
                createPendingRetryAttempt(eventId, destinationId, attemptNumber + 1, nextRetry);
                log.info("Forward retry scheduled: eventId={}, destId={}, attempt={}, nextRetry={}",
                        eventId, destinationId, attemptNumber, nextRetry);
            }
        } else {
            forwardFailureCounter.increment();
            updateAttempt(eventId, destinationId, attemptNumber, ForwardAttemptStatus.FAILED,
                    statusCode, responseHeaders, responseBody,
                    "Non-retryable HTTP " + statusCode, durationMs, null);
            log.error("Forward failed (non-retryable): eventId={}, destId={}, status={}",
                    eventId, destinationId, statusCode);
        }
    }

    private void handleError(UUID eventId, UUID destinationId, int attemptNumber, int maxAttempts,
            String errorMessage, int durationMs, String retryDelays) {
        forwardErrorCounter.increment();
        if (attemptNumber >= maxAttempts) {
            updateAttempt(eventId, destinationId, attemptNumber, ForwardAttemptStatus.DLQ,
                    null, null, null,
                    "Max attempts reached: " + errorMessage, durationMs, null);
            log.warn("Forward DLQ (error): eventId={}, destId={}", eventId, destinationId);
        } else {
            Instant nextRetry = calculateNextRetry(attemptNumber, retryDelays);
            updateAttempt(eventId, destinationId, attemptNumber, ForwardAttemptStatus.FAILED,
                    null, null, null,
                    errorMessage, durationMs, null);
            createPendingRetryAttempt(eventId, destinationId, attemptNumber + 1, nextRetry);
            log.info("Forward retry scheduled (error): eventId={}, destId={}, nextRetry={}",
                    eventId, destinationId, nextRetry);
        }
    }

    /**
     * Updates the existing PROCESSING attempt row with the final result.
     * The row was created/claimed atomically before the HTTP call.
     */
    private void updateAttempt(UUID eventId, UUID destinationId, int attemptNumber, ForwardAttemptStatus status,
            Integer responseCode, String responseHeaders, String responseBody,
            String errorMessage, int durationMs, Instant nextRetryAt) {
        transactionTemplate.executeWithoutResult(tx -> {
            List<IncomingForwardAttempt> attempts = attemptRepository
                    .findByIncomingEventIdAndDestinationIdOrderByAttemptNumberDesc(eventId, destinationId);
            IncomingForwardAttempt attempt = attempts.stream()
                    .filter(a -> a.getAttemptNumber() == attemptNumber)
                    .findFirst()
                    .orElse(null);
            if (attempt == null) {
                log.error("Attempt row not found for update: eventId={}, destId={}, attempt={}",
                        eventId, destinationId, attemptNumber);
                return;
            }
            attempt.setStatus(status);
            attempt.setFinishedAt(Instant.now());
            attempt.setResponseCode(responseCode);
            attempt.setResponseHeadersJson(responseHeaders);
            attempt.setResponseBodySnippet(responseBody);
            attempt.setErrorMessage(errorMessage);
            attempt.setNextRetryAt(nextRetryAt);
            attemptRepository.save(attempt);
        });
    }

    /**
     * Creates a new PENDING attempt row for the next retry.
     * This row will be picked up by IncomingForwardRetryScheduler.
     */
    private void createPendingRetryAttempt(UUID eventId, UUID destinationId,
            int nextAttemptNumber, Instant nextRetryAt) {
        transactionTemplate.executeWithoutResult(tx -> {
            IncomingForwardAttempt nextAttempt = IncomingForwardAttempt.builder()
                    .incomingEventId(eventId)
                    .destinationId(destinationId)
                    .attemptNumber(nextAttemptNumber)
                    .status(ForwardAttemptStatus.PENDING)
                    .nextRetryAt(nextRetryAt)
                    .build();
            attemptRepository.save(nextAttempt);
        });
    }

    private void saveFailedAttempt(UUID eventId, UUID destinationId, String errorMessage, int durationMs) {
        // Claim the existing PENDING row (created by IngressService) and mark FAILED
        Integer claimed = transactionTemplate
                .execute(tx -> attemptRepository.claimForProcessing(eventId, destinationId, 1));
        if (claimed != null && claimed > 0) {
            updateAttempt(eventId, destinationId, 1, ForwardAttemptStatus.FAILED,
                    null, null, null, errorMessage, durationMs, null);
        } else {
            log.warn("Could not claim attempt row for early failure: eventId={}, destId={}",
                    eventId, destinationId);
        }
    }

    private boolean isRetryable(int statusCode) {
        return statusCode == 408 || statusCode == 429 || (statusCode >= 500 && statusCode < 600);
    }

    private Instant calculateNextRetry(int attemptNumber, String retryDelaysStr) {
        long[] delays = parseRetryDelays(retryDelaysStr);
        int index = Math.min(attemptNumber - 1, delays.length - 1);
        long baseDelay = delays[index];
        // Full jitter: 50%-150% of base delay to prevent thundering herd
        double jitterMultiplier = 0.5 + ThreadLocalRandom.current().nextDouble(1.0);
        long jitteredDelay = (long) (baseDelay * jitterMultiplier);
        return Instant.now().plusSeconds(jitteredDelay);
    }

    private long[] parseRetryDelays(String retryDelaysStr) {
        if (retryDelaysStr == null || retryDelaysStr.isEmpty()) {
            return new long[] { 60, 300, 900, 3600, 21600 };
        }
        try {
            String[] parts = retryDelaysStr.split(",");
            long[] delays = new long[parts.length];
            for (int i = 0; i < parts.length; i++) {
                delays[i] = Long.parseLong(parts[i].trim());
            }
            return delays;
        } catch (NumberFormatException e) {
            log.warn("Invalid retry delays format: {}, using defaults", retryDelaysStr);
            return new long[] { 60, 300, 900, 3600, 21600 };
        }
    }

    @SuppressWarnings("unchecked")
    private void addAuthHeaders(WebClient.RequestBodySpec requestSpec, IncomingDestination destination) {
        if (destination.getAuthType() == IncomingAuthType.NONE || destination.getAuthConfigEncrypted() == null) {
            return;
        }
        try {
            String authConfig = CryptoUtils.decryptSecret(
                    destination.getAuthConfigEncrypted(),
                    destination.getAuthConfigIv(),
                    encryptionKey, encryptionSalt);

            Map<String, String> config = objectMapper.readValue(authConfig, Map.class);

            switch (destination.getAuthType()) {
                case BEARER -> {
                    String token = config.get("token");
                    if (token != null) {
                        requestSpec.header("Authorization", "Bearer " + token);
                    }
                }
                case BASIC -> {
                    String username = config.getOrDefault("username", "");
                    String password = config.getOrDefault("password", "");
                    String encoded = java.util.Base64.getEncoder()
                            .encodeToString((username + ":" + password).getBytes());
                    requestSpec.header("Authorization", "Basic " + encoded);
                }
                case CUSTOM_HEADER -> {
                    String headerName = config.get("headerName");
                    String headerValue = config.get("headerValue");
                    if (headerName != null && headerValue != null) {
                        requestSpec.header(headerName, headerValue);
                    }
                }
                default -> {
                }
            }
        } catch (Exception e) {
            log.warn("Failed to apply auth headers for destination {}: {}", destination.getId(), e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void addCustomHeaders(WebClient.RequestBodySpec requestSpec, String customHeadersJson) {
        if (customHeadersJson == null || customHeadersJson.isBlank()) {
            return;
        }
        try {
            Map<String, String> headers = objectMapper.readValue(customHeadersJson, Map.class);
            headers.forEach((key, value) -> {
                if (key != null && value != null && !key.isBlank()) {
                    String keyLower = key.toLowerCase();
                    if (!keyLower.equals("host") && !keyLower.equals("content-length")
                            && !keyLower.equals("transfer-encoding")) {
                        requestSpec.header(key, value);
                    }
                }
            });
        } catch (Exception e) {
            log.warn("Failed to parse custom headers: {}", e.getMessage());
        }
    }

    private String serializeHeaders(HttpHeaders headers) {
        try {
            Map<String, String> headerMap = new HashMap<>();
            headers.forEach((key, values) -> {
                if (values != null && !values.isEmpty()) {
                    headerMap.put(key, values.get(0));
                }
            });
            return objectMapper.writeValueAsString(headerMap);
        } catch (Exception e) {
            return "{}";
        }
    }

    /**
     * Applies JSONPath transformation to the payload if configured.
     * Supports expressions like:
     * "$.data" — extract a subtree
     * "$.events[0]" — extract first element
     * "$.payload.body" — nested extraction
     * Returns original body if no transform is configured or on error.
     */
    private String transformPayload(String body, String payloadTransform) {
        if (payloadTransform == null || payloadTransform.isBlank() || body == null || body.isBlank()) {
            return body;
        }
        try {
            Object result = JsonPath.read(body, payloadTransform);
            if (result instanceof String) {
                return (String) result;
            }
            return objectMapper.writeValueAsString(result);
        } catch (PathNotFoundException e) {
            log.warn("JSONPath '{}' not found in payload, forwarding as-is: {}", payloadTransform, e.getMessage());
            return body;
        } catch (Exception e) {
            log.warn("Payload transform failed for expression '{}', forwarding as-is: {}", payloadTransform,
                    e.getMessage());
            return body;
        }
    }

    private String truncate(String str, int maxLength) {
        if (str == null || str.length() <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength);
    }
}
