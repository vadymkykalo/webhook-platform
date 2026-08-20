package com.webhook.platform.worker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.common.dto.DeliveryMessage;
import com.webhook.platform.common.security.EncryptionKeyRegistry;
import com.webhook.platform.worker.domain.entity.Delivery;
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
}
