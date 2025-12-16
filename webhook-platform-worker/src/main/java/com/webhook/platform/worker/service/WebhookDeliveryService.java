package com.webhook.platform.worker.service;

import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.common.security.UrlValidator;
import com.webhook.platform.common.util.CryptoUtils;
import com.webhook.platform.common.util.WebhookSignatureUtils;
import com.webhook.platform.worker.domain.entity.*;
import com.webhook.platform.worker.domain.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Slf4j
public class WebhookDeliveryService {

    private final DeliveryRepository deliveryRepository;
    private final EndpointRepository endpointRepository;
    private final EventRepository eventRepository;
    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final WebClient webClient;
    private final String encryptionKey;
    private final boolean allowPrivateIps;
    private final List<String> allowedHosts;
    private final RateLimiterService rateLimiterService;
    private final ConcurrencyControlService concurrencyControlService;
    private final MeterRegistry meterRegistry;
    private final ObjectMapper objectMapper;

    public WebhookDeliveryService(
            DeliveryRepository deliveryRepository,
            EndpointRepository endpointRepository,
            EventRepository eventRepository,
            DeliveryAttemptRepository deliveryAttemptRepository,
            WebClient.Builder webClientBuilder,
            @Value("${webhook.encryption-key:development_master_key_32_chars}") String encryptionKey,
            @Value("${webhook.url-validation.allow-private-ips:false}") boolean allowPrivateIps,
            @Value("${webhook.url-validation.allowed-hosts:}") List<String> allowedHosts,
            RateLimiterService rateLimiterService,
            ConcurrencyControlService concurrencyControlService,
            MeterRegistry meterRegistry,
            ObjectMapper objectMapper) {
        this.deliveryRepository = deliveryRepository;
        this.endpointRepository = endpointRepository;
        this.eventRepository = eventRepository;
        this.deliveryAttemptRepository = deliveryAttemptRepository;
        this.webClient = webClientBuilder
                .defaultHeader("User-Agent", "WebhookPlatform/1.0")
                .build();
        this.encryptionKey = encryptionKey;
        this.allowPrivateIps = allowPrivateIps;
        this.allowedHosts = allowedHosts;
        this.rateLimiterService = rateLimiterService;
        this.concurrencyControlService = concurrencyControlService;
        this.meterRegistry = meterRegistry;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void processDelivery(DeliveryMessage message) {
        Optional<Delivery> deliveryOpt = deliveryRepository.findById(message.getDeliveryId());
        if (deliveryOpt.isEmpty()) {
            log.error("Delivery not found: {}", message.getDeliveryId());
            return;
        }

        Delivery delivery = deliveryOpt.get();
        
        if (delivery.getStatus() == Delivery.DeliveryStatus.SUCCESS) {
            log.info("Delivery already succeeded: {}", delivery.getId());
            return;
        }

        Optional<Endpoint> endpointOpt = endpointRepository.findById(delivery.getEndpointId());
        if (endpointOpt.isEmpty()) {
            log.error("Endpoint not found: {}", delivery.getEndpointId());
            markAsFailed(delivery, "Endpoint not found");
            return;
        }

        Endpoint endpoint = endpointOpt.get();
        if (!endpoint.getEnabled()) {
            log.warn("Endpoint disabled: {}", endpoint.getId());
            markAsFailed(delivery, "Endpoint is disabled");
            return;
        }

        Optional<Event> eventOpt = eventRepository.findById(delivery.getEventId());
        if (eventOpt.isEmpty()) {
            log.error("Event not found: {}", delivery.getEventId());
            markAsFailed(delivery, "Event not found");
            return;
        }

        Event event = eventOpt.get();
        delivery.setStatus(Delivery.DeliveryStatus.PROCESSING);
        delivery.setAttemptCount(delivery.getAttemptCount() + 1);
        delivery.setLastAttemptAt(Instant.now());
        deliveryRepository.save(delivery);

        attemptDelivery(delivery, endpoint, event);
    }

    private void attemptDelivery(Delivery delivery, Endpoint endpoint, Event event) {
        long startTime = System.currentTimeMillis();
        
        if (!rateLimiterService.tryAcquire(endpoint.getId(), endpoint.getRateLimitPerSecond())) {
            log.warn("Rate limited for endpoint {}, rescheduling delivery {}", endpoint.getId(), delivery.getId());
            delivery.setStatus(Delivery.DeliveryStatus.PENDING);
            delivery.setNextRetryAt(Instant.now().plusSeconds(1));
            deliveryRepository.save(delivery);
            return;
        }
        
        if (!concurrencyControlService.tryAcquire(endpoint.getId())) {
            log.warn("Max concurrency reached for endpoint {}, rescheduling delivery {}", endpoint.getId(), delivery.getId());
            delivery.setStatus(Delivery.DeliveryStatus.PENDING);
            delivery.setNextRetryAt(Instant.now().plusSeconds(1));
            deliveryRepository.save(delivery);
            return;
        }
        
        try {
            UrlValidator.validateWebhookUrl(endpoint.getUrl(), allowPrivateIps, allowedHosts);
        } catch (UrlValidator.InvalidUrlException e) {
            log.error("SSRF protection: invalid URL for delivery {}: {}", delivery.getId(), e.getMessage());
            saveAttempt(delivery, null, null, "SSRF_PROTECTION: " + e.getMessage(), 
                    (int) (System.currentTimeMillis() - startTime));
            markAsFailed(delivery, "SSRF_PROTECTION: " + e.getMessage());
            concurrencyControlService.release(endpoint.getId());
            return;
        }
        
        String secret = decryptSecret(endpoint);
        String body = event.getPayload();
        long timestamp = System.currentTimeMillis();

        String signature = WebhookSignatureUtils.buildSignatureHeader(secret, timestamp, body);

        try {
            Timer.Sample sample = Timer.start(meterRegistry);
            Integer statusCode = webClient.post()
                    .uri(endpoint.getUrl())
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("X-Signature", signature)
                    .header("X-Event-Id", event.getId().toString())
                    .header("X-Delivery-Id", delivery.getId().toString())
                    .header("X-Timestamp", String.valueOf(timestamp))
                    .bodyValue(body)
                    .exchangeToMono(response -> {
                        int status = response.statusCode().value();
                        return response.bodyToMono(String.class)
                                .defaultIfEmpty("")
                                .map(responseBody -> {
                                    sample.stop(Timer.builder("webhook_delivery_latency_ms")
                                        .tag("status_code", String.valueOf(status))
                                        .register(meterRegistry));
                                    handleResponse(delivery, status, responseBody, 
                                            (int) (System.currentTimeMillis() - startTime));
                                    return status;
                                });
                    })
                    .timeout(Duration.ofSeconds(30))
                    .onErrorResume(e -> {
                        log.error("HTTP request failed for delivery {}: {}", delivery.getId(), e.getMessage());
                        handleError(delivery, e, (int) (System.currentTimeMillis() - startTime));
                        return Mono.just(0);
                    })
                    .block();

        } catch (Exception e) {
            log.error("Unexpected error during delivery {}: {}", delivery.getId(), e.getMessage(), e);
            handleError(delivery, e, (int) (System.currentTimeMillis() - startTime));
        } finally {
            concurrencyControlService.release(endpoint.getId());
        }
    }

    private void handleResponse(Delivery delivery, int statusCode, String responseBody, int durationMs) {
        String result = (statusCode >= 200 && statusCode < 300) ? "success" : "failure";
        Counter.builder("webhook_delivery_attempts_total")
            .tag("result", result)
            .tag("status_code", String.valueOf(statusCode))
            .register(meterRegistry).increment();
        
        saveAttempt(delivery, statusCode, responseBody, null, durationMs);

        if (statusCode >= 200 && statusCode < 300) {
            markAsSuccess(delivery);
        } else if (isRetryable(statusCode)) {
            scheduleRetry(delivery);
        } else {
            markAsFailed(delivery, "Non-retryable status code: " + statusCode);
        }
    }

    private void handleError(Delivery delivery, Throwable error, int durationMs) {
        Counter.builder("webhook_delivery_attempts_total")
            .tag("result", "error")
            .tag("status_code", "0")
            .register(meterRegistry).increment();
        
        saveAttempt(delivery, null, null, error.getMessage(), durationMs);
        scheduleRetry(delivery);
    }

    private boolean isRetryable(int statusCode) {
        return statusCode == 408 || statusCode == 429 || (statusCode >= 500 && statusCode < 600);
    }

    private void scheduleRetry(Delivery delivery) {
        if (delivery.getAttemptCount() >= delivery.getMaxAttempts()) {
            log.warn("Max attempts reached for delivery {}, moving to DLQ", delivery.getId());
            delivery.setStatus(Delivery.DeliveryStatus.DLQ);
            delivery.setFailedAt(Instant.now());
        } else {
            delivery.setStatus(Delivery.DeliveryStatus.PENDING);
            delivery.setNextRetryAt(calculateNextRetry(delivery.getAttemptCount()));
            log.info("Scheduled retry {} for delivery {} at {}", 
                    delivery.getAttemptCount(), delivery.getId(), delivery.getNextRetryAt());
        }
        delivery.setUpdatedAt(Instant.now());
        deliveryRepository.save(delivery);
    }

    private Instant calculateNextRetry(int attemptCount) {
        long[] delays = {60, 300, 900, 3600, 21600, 86400};
        int index = Math.min(attemptCount - 1, delays.length - 1);
        return Instant.now().plusSeconds(delays[index]);
    }

    private void markAsSuccess(Delivery delivery) {
        delivery.setStatus(Delivery.DeliveryStatus.SUCCESS);
        delivery.setSucceededAt(Instant.now());
        delivery.setUpdatedAt(Instant.now());
        deliveryRepository.save(delivery);
        log.info("Delivery {} succeeded after {} attempts", delivery.getId(), delivery.getAttemptCount());
    }

    private void markAsFailed(Delivery delivery, String reason) {
        delivery.setStatus(Delivery.DeliveryStatus.FAILED);
        delivery.setFailedAt(Instant.now());
        delivery.setUpdatedAt(Instant.now());
        deliveryRepository.save(delivery);
        log.error("Delivery {} failed: {}", delivery.getId(), reason);
    }

    private void saveAttempt(Delivery delivery, Integer statusCode, String responseBody, 
                            String errorMessage, int durationMs) {
        DeliveryAttempt attempt = DeliveryAttempt.builder()
                .deliveryId(delivery.getId())
                .attemptNumber(delivery.getAttemptCount())
                .httpStatusCode(statusCode)
                .responseBody(responseBody != null && responseBody.length() > 1000 
                        ? responseBody.substring(0, 1000) 
                        : responseBody)
                .errorMessage(errorMessage)
                .durationMs(durationMs)
                .build();
        deliveryAttemptRepository.save(attempt);
    }

    private String decryptSecret(Endpoint endpoint) {
        try {
            return CryptoUtils.decryptSecret(
                    endpoint.getSecretEncrypted(),
                    endpoint.getSecretIv(),
                    encryptionKey
            );
        } catch (Exception e) {
            log.error("Failed to decrypt secret for endpoint {}", endpoint.getId());
            return "fallback_secret";
        }
    }
}
