package com.webhook.platform.worker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.common.security.EncryptionKeyRegistry;
import com.webhook.platform.worker.domain.entity.Delivery;
import com.webhook.platform.worker.domain.entity.Endpoint;
import com.webhook.platform.worker.domain.entity.Event;
import com.webhook.platform.worker.domain.entity.DeliveryAttempt;
import com.webhook.platform.worker.domain.repository.DeliveryAttemptRepository;
import com.webhook.platform.worker.domain.repository.DeliveryRepository;
import com.webhook.platform.worker.domain.repository.EndpointRepository;
import com.webhook.platform.worker.domain.repository.EventRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.redisson.api.RedissonClient;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.resources.ConnectionProvider;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Covers WebhookDeliveryService.rescheduleForBackpressure — the P0-03 fix for
 * DeliveryConsumer's executor-full path, which used to leave the Kafka record unacked
 * and rely on redelivery that MANUAL acks don't actually provide. See DeliveryConsumerTest
 * for the consumer-side wiring (reschedule-then-ack) and KafkaAckOrderingIntegrationTest
 * for the underlying offset-ordering fix.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WebhookDeliveryServiceTest {

    @Mock
    private DeliveryRepository deliveryRepository;
    @Mock
    private EndpointRepository endpointRepository;
    @Mock
    private EventRepository eventRepository;
    @Mock
    private DeliveryAttemptRepository deliveryAttemptRepository;
    @Mock
    private WebClient.Builder webClientBuilder;
    @Mock
    private MtlsWebClientFactory mtlsWebClientFactory;
    @Mock
    private EncryptionKeyRegistry encryptionKeyRegistry;
    @Mock
    private RedisRateLimiterService rateLimiterService;
    @Mock
    private RedisConcurrencyControlService concurrencyControlService;
    @Mock
    private ProjectRateLimiterService projectRateLimiterService;
    @Mock
    private CircuitBreakerService circuitBreakerService;
    @Mock
    private OrderingBufferService orderingBufferService;
    @Mock
    private KafkaTemplate<String, DeliveryMessage> kafkaTemplate;
    @Mock
    private PayloadTransformService payloadTransformService;
    @Mock
    private TransactionTemplate transactionTemplate;
    @Mock
    private TransformationCacheService transformationCacheService;

    private WebhookDeliveryService service;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        when(transactionTemplate.execute(any())).thenAnswer(inv -> {
            var callback = inv.getArgument(0, TransactionCallback.class);
            return callback.doInTransaction(null);
        });
        doAnswer(inv -> {
            Consumer<Object> callback = inv.getArgument(0, Consumer.class);
            callback.accept(null);
            return null;
        }).when(transactionTemplate).executeWithoutResult(any());

        WebClient mockWebClient = WebClient.builder().build();
        when(webClientBuilder.clientConnector(any())).thenReturn(webClientBuilder);
        when(webClientBuilder.defaultHeader(anyString(), anyString())).thenReturn(webClientBuilder);
        when(webClientBuilder.build()).thenReturn(mockWebClient);

        MeterRegistry meterRegistry = new SimpleMeterRegistry();
        service = new WebhookDeliveryService(
                deliveryRepository, endpointRepository, eventRepository, deliveryAttemptRepository,
                webClientBuilder, mtlsWebClientFactory, encryptionKeyRegistry,
                true, List.of(),
                rateLimiterService, concurrencyControlService, projectRateLimiterService,
                circuitBreakerService, meterRegistry, new ObjectMapper(),
                orderingBufferService, kafkaTemplate, payloadTransformService,
                transactionTemplate, transformationCacheService,
                ConnectionProvider.newConnection());
    }

    private Delivery pendingDelivery(UUID id) {
        return Delivery.builder()
                .id(id)
                .status(Delivery.DeliveryStatus.PENDING)
                .attemptCount(0)
                .maxAttempts(5)
                .updatedAt(Instant.now().minusSeconds(60))
                .build();
    }

    private Delivery processingDelivery(UUID id) {
        return Delivery.builder()
                .id(id)
                .status(Delivery.DeliveryStatus.PROCESSING)
                .attemptCount(1)
                .maxAttempts(5)
                .updatedAt(Instant.now().minusSeconds(60))
                .build();
    }

    @Test
    void rescheduleForBackpressure_dispatchPath_reschedulesPendingDelivery() {
        UUID id = UUID.randomUUID();
        when(deliveryRepository.findById(id)).thenReturn(Optional.of(pendingDelivery(id)));

        service.rescheduleForBackpressure(id, false);

        ArgumentCaptor<Delivery> captor = ArgumentCaptor.forClass(Delivery.class);
        verify(deliveryRepository).save(captor.capture());
        Delivery saved = captor.getValue();
        assertEquals(Delivery.DeliveryStatus.PENDING, saved.getStatus());
        assertTrue(saved.getNextRetryAt() != null && saved.getNextRetryAt().isAfter(Instant.now()),
                "next_retry_at must be set to a near-future instant so RetrySchedulerService picks it up");
    }

    @Test
    void rescheduleForBackpressure_retryPath_revertsProcessingClaimToPending() {
        UUID id = UUID.randomUUID();
        when(deliveryRepository.findById(id)).thenReturn(Optional.of(processingDelivery(id)));

        service.rescheduleForBackpressure(id, true);

        ArgumentCaptor<Delivery> captor = ArgumentCaptor.forClass(Delivery.class);
        verify(deliveryRepository).save(captor.capture());
        Delivery saved = captor.getValue();
        assertEquals(Delivery.DeliveryStatus.PENDING, saved.getStatus());
        assertTrue(saved.getNextRetryAt() != null && saved.getNextRetryAt().isAfter(Instant.now()));
    }

    @Test
    void rescheduleForBackpressure_dispatchPath_noOp_whenAlreadyClaimed() {
        // A different pool thread already claimed it (PENDING -> PROCESSING) between the
        // executor-full rejection and this call — nothing to reschedule.
        UUID id = UUID.randomUUID();
        when(deliveryRepository.findById(id)).thenReturn(Optional.of(processingDelivery(id)));

        service.rescheduleForBackpressure(id, false);

        verify(deliveryRepository, never()).save(any());
    }

    @Test
    void rescheduleForBackpressure_retryPath_noOp_whenNoLongerProcessing() {
        UUID id = UUID.randomUUID();
        when(deliveryRepository.findById(id)).thenReturn(Optional.of(pendingDelivery(id)));

        service.rescheduleForBackpressure(id, true);

        verify(deliveryRepository, never()).save(any());
    }

    @Test
    void rescheduleForBackpressure_noOp_whenDeliveryMissing() {
        UUID id = UUID.randomUUID();
        when(deliveryRepository.findById(id)).thenReturn(Optional.empty());

        service.rescheduleForBackpressure(id, false);

        verify(deliveryRepository, never()).save(any());
    }

    /**
     * P0-04: decryptSecret (bad key version / rotated-away key) used to throw outside the
     * try/finally that releases the concurrency permit, so every failing attempt burned a
     * permit that never came back. maxConcurrentPerEndpoint + 1 failing attempts against the
     * REAL RedisConcurrencyControlService (a mocked RedissonClient forces its local-fallback
     * path, so no Docker/Redis is needed) reproduces the leak on unfixed code: the semaphore
     * exhausts and a subsequent acquire is rejected, i.e. the endpoint is permanently blocked.
     * On fixed code every attempt releases its permit in the finally, so the endpoint never
     * blocks and a later attempt (the "operator fixed the cert" case) can still acquire.
     */
    @Test
    void attemptDelivery_decryptSecretThrows_releasesPermitEveryTime_soEndpointNeverBlocks() throws Exception {
        int maxConcurrent = 5;
        RedissonClient redissonClient = mock(RedissonClient.class);
        when(redissonClient.getPermitExpirableSemaphore(anyString()))
                .thenThrow(new RuntimeException("Redis unavailable in this test"));
        RedisConcurrencyControlService realConcurrencyControl = new RedisConcurrencyControlService(
                redissonClient, new SimpleMeterRegistry(), maxConcurrent, 90);

        WebClient mockWebClient = WebClient.builder().build();
        when(webClientBuilder.clientConnector(any())).thenReturn(webClientBuilder);
        when(webClientBuilder.defaultHeader(anyString(), anyString())).thenReturn(webClientBuilder);
        when(webClientBuilder.build()).thenReturn(mockWebClient);

        WebhookDeliveryService localService = new WebhookDeliveryService(
                deliveryRepository, endpointRepository, eventRepository, deliveryAttemptRepository,
                webClientBuilder, mtlsWebClientFactory, encryptionKeyRegistry,
                true, List.of(),
                rateLimiterService, realConcurrencyControl, projectRateLimiterService,
                circuitBreakerService, new SimpleMeterRegistry(), new ObjectMapper(),
                orderingBufferService, kafkaTemplate, payloadTransformService,
                transactionTemplate, transformationCacheService,
                ConnectionProvider.newConnection());

        UUID endpointId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        Endpoint endpoint = Endpoint.builder()
                .id(endpointId)
                .projectId(UUID.randomUUID())
                .url("http://localhost:8080/hook")
                .secretEncrypted("cipher")
                .secretIv("iv")
                .enabled(true)
                .verificationStatus(Endpoint.VerificationStatus.VERIFIED)
                .encryptionKeyVersion(1)
                .build();
        when(endpointRepository.findById(endpointId)).thenReturn(Optional.of(endpoint));

        Event event = Event.builder()
                .id(eventId)
                .projectId(endpoint.getProjectId())
                .eventType("test.event")
                .payload("{}")
                .createdAt(Instant.now())
                .build();
        when(eventRepository.findById(eventId)).thenReturn(Optional.of(event));

        when(projectRateLimiterService.tryAcquire(endpoint.getProjectId())).thenReturn(true);
        when(circuitBreakerService.isCallPermitted(endpointId)).thenReturn(true);
        when(encryptionKeyRegistry.decryptWithFallback(anyString(), anyString(), anyInt()))
                .thenThrow(new RuntimeException("Failed to decrypt secret: key rotated away"));

        for (int i = 0; i < maxConcurrent + 1; i++) {
            UUID deliveryId = UUID.randomUUID();
            Delivery delivery = Delivery.builder()
                    .id(deliveryId)
                    .eventId(eventId)
                    .endpointId(endpointId)
                    .status(Delivery.DeliveryStatus.PROCESSING)
                    .attemptCount(0)
                    .maxAttempts(10)
                    .updatedAt(Instant.now())
                    .build();
            when(deliveryRepository.findById(deliveryId)).thenReturn(Optional.of(delivery));

            DeliveryMessage message = DeliveryMessage.builder()
                    .deliveryId(deliveryId)
                    .eventId(eventId)
                    .endpointId(endpointId)
                    .build();

            localService.processDelivery(message, true);
        }

        assertTrue(realConcurrencyControl.tryAcquire(endpointId),
                "a fixed decrypt (or any other pre-HTTP throw) must not leave the endpoint " +
                        "permanently throttled to zero — every failing attempt has to release its permit");
    }

    // --- P0-07: a configured transformation that fails to apply must never result in the ---
    // --- raw payload being sent, and must fail the attempt as retryable / eventually DLQ.  ---

    private Endpoint verifiedEndpoint(UUID endpointId, UUID projectId) {
        return Endpoint.builder()
                .id(endpointId)
                .projectId(projectId)
                .url("http://localhost:8080/hook")
                .secretEncrypted("cipher")
                .secretIv("iv")
                .enabled(true)
                .verificationStatus(Endpoint.VerificationStatus.VERIFIED)
                .encryptionKeyVersion(1)
                .build();
    }

    private WebhookDeliveryService serviceWithMockWebClient(WebClient mockWebClient, MeterRegistry meterRegistry) {
        when(webClientBuilder.clientConnector(any())).thenReturn(webClientBuilder);
        when(webClientBuilder.defaultHeader(anyString(), anyString())).thenReturn(webClientBuilder);
        when(webClientBuilder.build()).thenReturn(mockWebClient);
        return new WebhookDeliveryService(
                deliveryRepository, endpointRepository, eventRepository, deliveryAttemptRepository,
                webClientBuilder, mtlsWebClientFactory, encryptionKeyRegistry,
                true, List.of(),
                rateLimiterService, concurrencyControlService, projectRateLimiterService,
                circuitBreakerService, meterRegistry, new ObjectMapper(),
                orderingBufferService, kafkaTemplate, payloadTransformService,
                transactionTemplate, transformationCacheService,
                ConnectionProvider.newConnection());
    }

    /**
     * Reproduces the original P0-07 bug for the "transformationId not found/disabled" site:
     * the delivery had an explicit transformationId configured (e.g. the transformation was
     * later disabled or deleted), and old code silently fell back to the inline
     * payloadTemplate (often null -> the raw payload) instead of failing the attempt.
     */
    @Test
    void attemptDelivery_configuredTransformationMissing_noHttpCall_failsRetryable() {
        WebClient mockWebClient = mock(WebClient.class);
        MeterRegistry meterRegistry = new SimpleMeterRegistry();
        WebhookDeliveryService localService = serviceWithMockWebClient(mockWebClient, meterRegistry);

        UUID endpointId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        Endpoint endpoint = verifiedEndpoint(endpointId, UUID.randomUUID());
        when(endpointRepository.findById(endpointId)).thenReturn(Optional.of(endpoint));

        Event event = Event.builder()
                .id(eventId)
                .projectId(endpoint.getProjectId())
                .eventType("test.event")
                .payload("{\"pii\":\"ssn-123-45-6789\"}")
                .createdAt(Instant.now())
                .build();
        when(eventRepository.findById(eventId)).thenReturn(Optional.of(event));

        when(projectRateLimiterService.tryAcquire(endpoint.getProjectId())).thenReturn(true);
        when(circuitBreakerService.isCallPermitted(endpointId)).thenReturn(true);
        when(concurrencyControlService.tryAcquire(endpointId)).thenReturn(true);
        when(encryptionKeyRegistry.decryptWithFallback(anyString(), anyString(), anyInt())).thenReturn("secret");

        UUID transformationId = UUID.randomUUID();
        UUID deliveryId = UUID.randomUUID();
        Delivery delivery = Delivery.builder()
                .id(deliveryId)
                .eventId(eventId)
                .endpointId(endpointId)
                .status(Delivery.DeliveryStatus.PROCESSING)
                .attemptCount(0)
                .maxAttempts(5)
                .transformationId(transformationId)
                .updatedAt(Instant.now())
                .build();
        when(deliveryRepository.findById(deliveryId)).thenReturn(Optional.of(delivery));
        // Simulates the transformation being disabled/deleted after being configured.
        when(transformationCacheService.findEnabledTemplate(transformationId)).thenReturn(null);

        DeliveryMessage message = DeliveryMessage.builder()
                .deliveryId(deliveryId).eventId(eventId).endpointId(endpointId).build();

        localService.processDelivery(message, true);

        // No HTTP call must have been attempted -- the raw payload must never leave the platform.
        verifyNoInteractions(mockWebClient);
        verifyNoInteractions(payloadTransformService);

        ArgumentCaptor<DeliveryAttempt> attemptCaptor = ArgumentCaptor.forClass(DeliveryAttempt.class);
        verify(deliveryAttemptRepository).save(attemptCaptor.capture());
        DeliveryAttempt savedAttempt = attemptCaptor.getValue();
        assertTrue(savedAttempt.getErrorMessage() != null && savedAttempt.getErrorMessage().contains("TRANSFORM_FAILED"),
                "the attempt must record a clear transform-failure error, not a warn-log-only fallback");
        assertEquals(null, savedAttempt.getRequestBody(), "request body must be null -- the raw payload was never built");
        assertEquals(null, savedAttempt.getHttpStatusCode(), "no HTTP response -- no call was made");

        ArgumentCaptor<Delivery> deliveryCaptor = ArgumentCaptor.forClass(Delivery.class);
        verify(deliveryRepository).save(deliveryCaptor.capture());
        // Retryable: attemptCount(1) < maxAttempts(5) -- scheduled for retry, not terminal.
        assertEquals(Delivery.DeliveryStatus.PENDING, deliveryCaptor.getValue().getStatus());

        assertEquals(1.0, meterRegistry.get("transform_failed_total").counter().count(),
                "a configured-but-failing transform must be counted, not just warn-logged");
    }

    /**
     * Check the DLQ path: a permanently broken template must eventually terminate at DLQ
     * rather than retrying forever, exactly like an HTTP-level failure would. This exercises
     * the other bug site -- PayloadTransformService.transform() itself throwing for a broken
     * inline payloadTemplate -- with the delivery already on its last attempt.
     */
    @Test
    void attemptDelivery_brokenPayloadTemplate_atMaxAttempts_terminatesAtDlq_noHttpCall() {
        WebClient mockWebClient = mock(WebClient.class);
        MeterRegistry meterRegistry = new SimpleMeterRegistry();
        WebhookDeliveryService localService = serviceWithMockWebClient(mockWebClient, meterRegistry);

        UUID endpointId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        Endpoint endpoint = verifiedEndpoint(endpointId, UUID.randomUUID());
        when(endpointRepository.findById(endpointId)).thenReturn(Optional.of(endpoint));

        Event event = Event.builder()
                .id(eventId)
                .projectId(endpoint.getProjectId())
                .eventType("test.event")
                .payload("{\"pii\":\"ssn-123-45-6789\"}")
                .createdAt(Instant.now())
                .build();
        when(eventRepository.findById(eventId)).thenReturn(Optional.of(event));

        when(projectRateLimiterService.tryAcquire(endpoint.getProjectId())).thenReturn(true);
        when(circuitBreakerService.isCallPermitted(endpointId)).thenReturn(true);
        when(concurrencyControlService.tryAcquire(endpointId)).thenReturn(true);
        when(encryptionKeyRegistry.decryptWithFallback(anyString(), anyString(), anyInt())).thenReturn("secret");

        UUID deliveryId = UUID.randomUUID();
        Delivery delivery = Delivery.builder()
                .id(deliveryId)
                .eventId(eventId)
                .endpointId(endpointId)
                .status(Delivery.DeliveryStatus.PROCESSING)
                .attemptCount(4)
                .maxAttempts(5)
                .payloadTemplate("{ this is not valid json")
                .updatedAt(Instant.now())
                .build();
        when(deliveryRepository.findById(deliveryId)).thenReturn(Optional.of(delivery));
        when(payloadTransformService.transform(anyString(), anyString()))
                .thenThrow(new PayloadTransformException("Payload transformation failed: broken JSON"));

        DeliveryMessage message = DeliveryMessage.builder()
                .deliveryId(deliveryId).eventId(eventId).endpointId(endpointId).build();

        localService.processDelivery(message, true);

        verifyNoInteractions(mockWebClient);

        ArgumentCaptor<Delivery> deliveryCaptor = ArgumentCaptor.forClass(Delivery.class);
        verify(deliveryRepository).save(deliveryCaptor.capture());
        assertEquals(Delivery.DeliveryStatus.DLQ, deliveryCaptor.getValue().getStatus(),
                "a permanently broken template must terminate at DLQ, not retry forever");
    }
}
