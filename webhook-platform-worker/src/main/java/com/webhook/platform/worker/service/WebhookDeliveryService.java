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
import com.webhook.platform.common.constants.KafkaTopics;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@Slf4j
public class WebhookDeliveryService {

    private final DeliveryRepository deliveryRepository;
    private final EndpointRepository endpointRepository;
    private final EventRepository eventRepository;
    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final WebClient defaultWebClient;
    private final MtlsWebClientFactory mtlsWebClientFactory;
    private final String encryptionKey;
    private final String encryptionSalt;
    private final boolean allowPrivateIps;
    private final List<String> allowedHosts;
    private final RedisRateLimiterService rateLimiterService;
    private final RedisConcurrencyControlService concurrencyControlService;
    private final CircuitBreakerService circuitBreakerService;
    private final MeterRegistry meterRegistry;
    private final OrderingBufferService orderingBufferService;
    private final KafkaTemplate<String, DeliveryMessage> kafkaTemplate;
    private final PayloadTransformService payloadTransformService;

    private final Counter deliverySuccessCounter;
    private final Counter deliveryFailureCounter;
    private final Counter deliveryErrorCounter;
    private final Counter orderingGapTimeoutCounter;
    private final Timer deliveryLatency2xx;
    private final Timer deliveryLatency4xx;
    private final Timer deliveryLatency5xx;

    public WebhookDeliveryService(
            DeliveryRepository deliveryRepository,
            EndpointRepository endpointRepository,
            EventRepository eventRepository,
            DeliveryAttemptRepository deliveryAttemptRepository,
            WebClient.Builder webClientBuilder,
            MtlsWebClientFactory mtlsWebClientFactory,
            @Value("${webhook.encryption-key:development_master_key_32_chars}") String encryptionKey,
            @Value("${webhook.encryption-salt}") String encryptionSalt,
            @Value("${webhook.url-validation.allow-private-ips:false}") boolean allowPrivateIps,
            @Value("${webhook.url-validation.allowed-hosts:}") List<String> allowedHosts,
            RedisRateLimiterService rateLimiterService,
            RedisConcurrencyControlService concurrencyControlService,
            CircuitBreakerService circuitBreakerService,
            MeterRegistry meterRegistry,
            ObjectMapper objectMapper,
            OrderingBufferService orderingBufferService,
            KafkaTemplate<String, DeliveryMessage> kafkaTemplate,
            PayloadTransformService payloadTransformService) {
        this.deliveryRepository = deliveryRepository;
        this.endpointRepository = endpointRepository;
        this.eventRepository = eventRepository;
        this.deliveryAttemptRepository = deliveryAttemptRepository;
        this.defaultWebClient = webClientBuilder
                .defaultHeader("User-Agent", "WebhookPlatform/1.0")
                .build();
        this.mtlsWebClientFactory = mtlsWebClientFactory;
        this.encryptionKey = encryptionKey;
        this.encryptionSalt = encryptionSalt;
        this.allowPrivateIps = allowPrivateIps;
        this.allowedHosts = allowedHosts;
        this.rateLimiterService = rateLimiterService;
        this.concurrencyControlService = concurrencyControlService;
        this.circuitBreakerService = circuitBreakerService;
        this.meterRegistry = meterRegistry;
        this.orderingBufferService = orderingBufferService;
        this.kafkaTemplate = kafkaTemplate;
        this.payloadTransformService = payloadTransformService;

        this.deliverySuccessCounter = Counter.builder("webhook_delivery_attempts_total")
                .tag("result", "success").tag("status_class", "2xx")
                .register(meterRegistry);
        this.deliveryFailureCounter = Counter.builder("webhook_delivery_attempts_total")
                .tag("result", "failure").tag("status_class", "non_2xx")
                .register(meterRegistry);
        this.deliveryErrorCounter = Counter.builder("webhook_delivery_attempts_total")
                .tag("result", "error").tag("status_class", "none")
                .register(meterRegistry);
        this.orderingGapTimeoutCounter = Counter.builder("webhook_ordering_gap_timeout_total")
                .register(meterRegistry);
        this.deliveryLatency2xx = Timer.builder("webhook_delivery_latency_ms")
                .tag("status_class", "2xx").register(meterRegistry);
        this.deliveryLatency4xx = Timer.builder("webhook_delivery_latency_ms")
                .tag("status_class", "4xx").register(meterRegistry);
        this.deliveryLatency5xx = Timer.builder("webhook_delivery_latency_ms")
                .tag("status_class", "5xx").register(meterRegistry);
    }

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

        // Check ordering constraints for ordered deliveries
        if (Boolean.TRUE.equals(delivery.getOrderingEnabled()) && delivery.getSequenceNumber() != null) {
            if (!canDeliverWithOrdering(delivery)) {
                return; // Delivery buffered or rescheduled
            }
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

        // Block deliveries to unverified endpoints (SSRF protection)
        if (endpoint.getVerificationStatus() != Endpoint.VerificationStatus.VERIFIED 
                && endpoint.getVerificationStatus() != Endpoint.VerificationStatus.SKIPPED) {
            log.warn("Endpoint {} not verified (status: {}), blocking delivery {}", 
                    endpoint.getId(), endpoint.getVerificationStatus(), delivery.getId());
            markAsFailed(delivery, "Endpoint not verified - verification required before receiving webhooks");
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
        
        if (!circuitBreakerService.isCallPermitted(endpoint.getId())) {
            log.warn("CircuitBreaker OPEN for endpoint {}, rescheduling delivery {}", endpoint.getId(), delivery.getId());
            saveAttempt(delivery, null, null, null, null, null, "CIRCUIT_BREAKER_OPEN", 0);
            delivery.setStatus(Delivery.DeliveryStatus.PENDING);
            delivery.setNextRetryAt(Instant.now().plusSeconds(30));
            deliveryRepository.save(delivery);
            return;
        }
        
        Integer rateLimit = endpoint.getRateLimitPerSecond();
        if (rateLimit != null && !rateLimiterService.tryAcquire(endpoint.getId(), rateLimit)) {
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
            saveAttempt(delivery, null, null, null, null, null, "SSRF_PROTECTION: " + e.getMessage(), 
                    (int) (System.currentTimeMillis() - startTime));
            markAsFailed(delivery, "SSRF_PROTECTION: " + e.getMessage());
            concurrencyControlService.release(endpoint.getId());
            return;
        }
        
        String secret = decryptSecret(endpoint);
        String originalPayload = event.getPayload();
        String body = payloadTransformService.transform(originalPayload, delivery.getPayloadTemplate());
        long timestamp = System.currentTimeMillis();

        String signature = WebhookSignatureUtils.buildSignatureHeader(secret, timestamp, body);

        String requestHeaders = buildRequestHeadersJson(signature, event.getId().toString(), 
                delivery.getId().toString(), String.valueOf(timestamp));

        Timer.Sample sample = Timer.start(meterRegistry);
        
        String sequenceHeader = delivery.getSequenceNumber() != null 
                ? String.valueOf(delivery.getSequenceNumber()) 
                : "0";
        
        WebClient client = Boolean.TRUE.equals(endpoint.getMtlsEnabled()) 
                ? mtlsWebClientFactory.getWebClient(endpoint) 
                : defaultWebClient;
        
        var requestSpec = client.post()
                .uri(endpoint.getUrl())
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Signature", signature)
                .header("X-Event-Id", event.getId().toString())
                .header("X-Delivery-Id", delivery.getId().toString())
                .header("X-Timestamp", String.valueOf(timestamp))
                .header("X-Sequence-Number", sequenceHeader);
        
        // Add custom headers if configured
        addCustomHeaders(requestSpec, delivery.getCustomHeaders());
        
        try {
            requestSpec.bodyValue(body)
                    .exchangeToMono(response -> {
                        int status = response.statusCode().value();
                        String responseHeaders = buildResponseHeadersJson(response.headers().asHttpHeaders());

                        return response.bodyToMono(String.class)
                                .defaultIfEmpty("")
                                .map(responseBody -> {
                                    sample.stop(timerForStatus(status));
                                    handleResponse(delivery, status, responseBody, responseHeaders,
                                            requestHeaders, body,
                                            (int) (System.currentTimeMillis() - startTime));
                                    return status;
                                });
                    })
                    .timeout(Duration.ofSeconds(delivery.getTimeoutSeconds() != null ? delivery.getTimeoutSeconds() : 30))
                    .block();
        } catch (Exception e) {
            log.error("HTTP request failed for delivery {}: {}", delivery.getId(), e.getMessage());
            handleError(delivery, e, requestHeaders, body,
                    (int) (System.currentTimeMillis() - startTime));
        } finally {
            concurrencyControlService.release(endpoint.getId());
        }
    }

    private void handleResponse(Delivery delivery, int statusCode, String responseBody, 
                               String responseHeaders, String requestHeaders, String requestBody, int durationMs) {
        String result = (statusCode >= 200 && statusCode < 300) ? "success" : "failure";
        if ("success".equals(result)) {
            deliverySuccessCounter.increment();
        } else {
            deliveryFailureCounter.increment();
        }
        
        saveAttempt(delivery, statusCode, responseBody, responseHeaders, requestHeaders, requestBody, null, durationMs);

        if (statusCode >= 200 && statusCode < 300) {
            circuitBreakerService.recordSuccess(delivery.getEndpointId(), durationMs);
            markAsSuccess(delivery);
        } else if (isRetryable(statusCode)) {
            circuitBreakerService.recordFailure(delivery.getEndpointId(), 
                    new RuntimeException("HTTP " + statusCode));
            scheduleRetry(delivery);
        } else {
            circuitBreakerService.recordFailure(delivery.getEndpointId(), 
                    new RuntimeException("Non-retryable HTTP " + statusCode));
            markAsFailed(delivery, "Non-retryable status code: " + statusCode);
        }
    }

    private void handleError(Delivery delivery, Throwable error, String requestHeaders, 
                            String requestBody, int durationMs) {
        deliveryErrorCounter.increment();
        
        circuitBreakerService.recordFailure(delivery.getEndpointId(), error);
        saveAttempt(delivery, null, null, null, requestHeaders, requestBody, error.getMessage(), durationMs);
        scheduleRetry(delivery);
    }

    private Timer timerForStatus(int statusCode) {
        if (statusCode >= 200 && statusCode < 300) return deliveryLatency2xx;
        if (statusCode >= 400 && statusCode < 500) return deliveryLatency4xx;
        return deliveryLatency5xx;
    }

    private boolean isRetryable(int statusCode) {
        return statusCode == 408 || statusCode == 429 || (statusCode >= 500 && statusCode < 600);
    }

    private void scheduleRetry(Delivery delivery) {
        if (delivery.getAttemptCount() >= delivery.getMaxAttempts()) {
            log.warn("Max attempts reached for delivery {}, moving to DLQ", delivery.getId());
            delivery.setStatus(Delivery.DeliveryStatus.DLQ);
            delivery.setFailedAt(Instant.now());
            
            // For ordered deliveries, advance sequence and release buffered deliveries
            if (Boolean.TRUE.equals(delivery.getOrderingEnabled()) && delivery.getSequenceNumber() != null) {
                orderingBufferService.removeFromBuffer(delivery.getEndpointId(), delivery.getId());
                orderingBufferService.markDelivered(delivery.getEndpointId(), delivery.getSequenceNumber());
                triggerBufferedDeliveries(delivery.getEndpointId());
            }
        } else {
            delivery.setStatus(Delivery.DeliveryStatus.PENDING);
            delivery.setNextRetryAt(calculateNextRetry(delivery.getAttemptCount(), delivery.getRetryDelays()));
            log.info("Scheduled retry {} for delivery {} at {}", 
                    delivery.getAttemptCount(), delivery.getId(), delivery.getNextRetryAt());
        }
        delivery.setUpdatedAt(Instant.now());
        deliveryRepository.save(delivery);
    }

    private Instant calculateNextRetry(int attemptCount, String retryDelaysStr) {
        long[] delays = parseRetryDelays(retryDelaysStr);
        int index = Math.min(attemptCount - 1, delays.length - 1);
        return Instant.now().plusSeconds(delays[index]);
    }

    private long[] parseRetryDelays(String retryDelaysStr) {
        if (retryDelaysStr == null || retryDelaysStr.isEmpty()) {
            return new long[]{60, 300, 900, 3600, 21600, 86400};
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
            return new long[]{60, 300, 900, 3600, 21600, 86400};
        }
    }

    private void markAsSuccess(Delivery delivery) {
        delivery.setStatus(Delivery.DeliveryStatus.SUCCESS);
        delivery.setSucceededAt(Instant.now());
        delivery.setUpdatedAt(Instant.now());
        deliveryRepository.save(delivery);
        log.info("Delivery {} succeeded after {} attempts", delivery.getId(), delivery.getAttemptCount());
        
        // For ordered deliveries, advance sequence and trigger buffered deliveries
        if (Boolean.TRUE.equals(delivery.getOrderingEnabled()) && delivery.getSequenceNumber() != null) {
            orderingBufferService.markDelivered(delivery.getEndpointId(), delivery.getSequenceNumber());
            triggerBufferedDeliveries(delivery.getEndpointId());
        }
    }
    
    /**
     * Checks if a delivery can proceed based on ordering constraints.
     * Returns true if delivery can proceed, false if it was buffered/rescheduled.
     */
    private boolean canDeliverWithOrdering(Delivery delivery) {
        UUID endpointId = delivery.getEndpointId();
        long sequenceNumber = delivery.getSequenceNumber();
        
        if (orderingBufferService.canDeliver(endpointId, sequenceNumber)) {
            return true;
        }
        
        // Check if we should proceed due to gap timeout
        Instant oldestPending = deliveryRepository.findOldestPendingCreatedAt(
                endpointId, sequenceNumber - 1);
        
        if (orderingBufferService.isGapTimedOut(oldestPending)) {
            log.warn("Gap timeout for endpoint {}, proceeding with seq={} without seq={}", 
                    endpointId, sequenceNumber, sequenceNumber - 1);
            orderingGapTimeoutCounter.increment();
            return true;
        }
        
        // Buffer the delivery and reschedule
        log.info("Buffering delivery {} (seq={}) waiting for seq={}", 
                delivery.getId(), sequenceNumber, sequenceNumber - 1);
        orderingBufferService.bufferDelivery(endpointId, delivery.getId(), sequenceNumber);
        
        delivery.setStatus(Delivery.DeliveryStatus.PENDING);
        delivery.setNextRetryAt(Instant.now().plusSeconds(5));
        delivery.setUpdatedAt(Instant.now());
        deliveryRepository.save(delivery);
        
        return false;
    }
    
    /**
     * Triggers buffered deliveries that are now ready after a sequence was delivered.
     */
    private void triggerBufferedDeliveries(UUID endpointId) {
        List<UUID> readyDeliveries = orderingBufferService.getReadyDeliveries(endpointId);
        
        for (UUID deliveryId : readyDeliveries) {
            Optional<Delivery> deliveryOpt = deliveryRepository.findById(deliveryId);
            if (deliveryOpt.isPresent()) {
                Delivery delivery = deliveryOpt.get();
                DeliveryMessage message = DeliveryMessage.builder()
                        .deliveryId(delivery.getId())
                        .eventId(delivery.getEventId())
                        .endpointId(delivery.getEndpointId())
                        .subscriptionId(delivery.getSubscriptionId())
                        .status(delivery.getStatus().name())
                        .attemptCount(delivery.getAttemptCount())
                        .sequenceNumber(delivery.getSequenceNumber())
                        .orderingEnabled(delivery.getOrderingEnabled())
                        .build();
                
                kafkaTemplate.send(KafkaTopics.DELIVERIES_DISPATCH, endpointId.toString(), message);
                log.info("Triggered buffered delivery {} (seq={}) for endpoint {}", 
                        deliveryId, delivery.getSequenceNumber(), endpointId);
            }
        }
    }

    private void markAsFailed(Delivery delivery, String reason) {
        delivery.setStatus(Delivery.DeliveryStatus.FAILED);
        delivery.setFailedAt(Instant.now());
        delivery.setUpdatedAt(Instant.now());
        deliveryRepository.save(delivery);
        log.error("Delivery {} failed: {}", delivery.getId(), reason);
        
        // For ordered deliveries, advance sequence and release buffered deliveries
        if (Boolean.TRUE.equals(delivery.getOrderingEnabled()) && delivery.getSequenceNumber() != null) {
            orderingBufferService.removeFromBuffer(delivery.getEndpointId(), delivery.getId());
            orderingBufferService.markDelivered(delivery.getEndpointId(), delivery.getSequenceNumber());
            triggerBufferedDeliveries(delivery.getEndpointId());
        }
    }

    private void saveAttempt(Delivery delivery, Integer statusCode, String responseBody, 
                            String responseHeaders, String requestHeaders, String requestBody,
                            String errorMessage, int durationMs) {
        DeliveryAttempt attempt = DeliveryAttempt.builder()
                .deliveryId(delivery.getId())
                .attemptNumber(delivery.getAttemptCount())
                .requestHeaders(requestHeaders)
                .requestBody(truncate(requestBody, 100000)) // 100KB limit
                .httpStatusCode(statusCode)
                .responseHeaders(responseHeaders)
                .responseBody(truncate(responseBody, 100000)) // 100KB limit
                .errorMessage(errorMessage)
                .durationMs(durationMs)
                .build();
        deliveryAttemptRepository.save(attempt);
    }
    
    private String truncate(String str, int maxLength) {
        if (str == null || str.length() <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength);
    }
    
    private String buildRequestHeadersJson(String signature, String eventId, String deliveryId, String timestamp) {
        return String.format("{\"Content-Type\":\"application/json\",\"X-Signature\":\"%s\",\"X-Event-Id\":\"%s\",\"X-Delivery-Id\":\"%s\",\"X-Timestamp\":\"%s\",\"User-Agent\":\"WebhookPlatform/1.0\"}", 
                signature, eventId, deliveryId, timestamp);
    }
    
    private String buildResponseHeadersJson(HttpHeaders headers) {
        try {
            Map<String, String> headerMap = new HashMap<>();
            headers.forEach((key, values) -> {
                if (values != null && !values.isEmpty()) {
                    headerMap.put(key, values.get(0));
                }
            });
            return new ObjectMapper().writeValueAsString(headerMap);
        } catch (Exception e) {
            log.warn("Failed to serialize response headers: {}", e.getMessage());
            return "{}";
        }
    }

    private String decryptSecret(Endpoint endpoint) {
        try {
            return CryptoUtils.decryptSecret(
                    endpoint.getSecretEncrypted(),
                    endpoint.getSecretIv(),
                    encryptionKey,
                    encryptionSalt
            );
        } catch (Exception e) {
            throw new RuntimeException("Failed to decrypt secret for endpoint " + endpoint.getId() + 
                    ". Check WEBHOOK_ENCRYPTION_KEY configuration.", e);
        }
    }

    @SuppressWarnings("unchecked")
    private void addCustomHeaders(WebClient.RequestBodySpec requestSpec, String customHeadersJson) {
        if (customHeadersJson == null || customHeadersJson.isBlank()) {
            return;
        }
        try {
            Map<String, String> headers = new ObjectMapper().readValue(customHeadersJson, Map.class);
            headers.forEach((key, value) -> {
                if (key != null && value != null && !key.isBlank()) {
                    // Skip headers that could cause security issues
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
}
