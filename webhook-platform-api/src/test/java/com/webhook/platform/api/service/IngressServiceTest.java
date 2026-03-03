package com.webhook.platform.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.webhook.platform.api.domain.entity.IncomingDestination;
import com.webhook.platform.api.domain.entity.IncomingEvent;
import com.webhook.platform.api.domain.entity.IncomingForwardAttempt;
import com.webhook.platform.api.domain.entity.IncomingSource;
import com.webhook.platform.api.domain.entity.OutboxMessage;
import com.webhook.platform.api.domain.repository.IncomingDestinationRepository;
import com.webhook.platform.api.domain.repository.IncomingEventRepository;
import com.webhook.platform.api.domain.repository.IncomingForwardAttemptRepository;
import com.webhook.platform.api.domain.repository.IncomingSourceRepository;
import com.webhook.platform.api.domain.repository.OutboxMessageRepository;
import com.webhook.platform.common.enums.ForwardAttemptStatus;
import com.webhook.platform.common.enums.IncomingAuthType;
import com.webhook.platform.common.enums.IncomingSourceStatus;
import com.webhook.platform.common.enums.ProviderType;
import com.webhook.platform.common.enums.VerificationMode;
import com.webhook.platform.api.service.ingress.ClientIpResolver;
import com.webhook.platform.api.service.ingress.HeaderSanitizer;
import com.webhook.platform.api.service.ingress.PayloadTooLargeException;
import com.webhook.platform.api.service.ingress.SignatureVerificationFailedException;
import com.webhook.platform.api.service.ingress.SourceDisabledException;
import com.webhook.platform.api.service.ingress.SourceNotFoundException;
import com.webhook.platform.api.service.verification.WebhookVerifierFactory;
import com.webhook.platform.common.util.CryptoUtils;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class IngressServiceTest {

    @Mock
    private IncomingSourceRepository sourceRepository;
    @Mock
    private IncomingEventRepository eventRepository;
    @Mock
    private IncomingDestinationRepository destinationRepository;
    @Mock
    private IncomingForwardAttemptRepository forwardAttemptRepository;
    @Mock
    private OutboxMessageRepository outboxMessageRepository;
    @Mock
    private HttpServletRequest httpRequest;
    @Mock
    private RedisRateLimiterService rateLimiterService;
    @Mock
    private PlatformTransactionManager transactionManager;
    @Mock
    private TransactionStatus transactionStatus;

    private IngressService service;
    private final WebhookVerifierFactory verifierFactory = new WebhookVerifierFactory();
    private final MeterRegistry meterRegistry = new SimpleMeterRegistry();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String encryptionKey = "test_encryption_key_32_chars_pad";
    private final String encryptionSalt = "test_salt";

    private final UUID sourceId = UUID.randomUUID();
    private final UUID eventId = UUID.randomUUID();
    private final UUID destId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        when(transactionManager.getTransaction(any())).thenReturn(transactionStatus);
        ClientIpResolver clientIpResolver = new ClientIpResolver(
                List.of("127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"));
        service = new IngressService(
                sourceRepository, eventRepository, destinationRepository,
                forwardAttemptRepository, outboxMessageRepository,
                objectMapper, meterRegistry, verifierFactory, rateLimiterService,
                clientIpResolver, transactionManager,
                encryptionKey, encryptionSalt, 524288
        );
    }

    private IncomingSource buildActiveSource() {
        return IncomingSource.builder()
                .id(sourceId).projectId(UUID.randomUUID())
                .name("Test").slug("test").providerType(ProviderType.GENERIC)
                .status(IncomingSourceStatus.ACTIVE)
                .ingressPathToken("validtoken")
                .verificationMode(VerificationMode.NONE)
                .hmacHeaderName("X-Signature").hmacSignaturePrefix("")
                .createdAt(Instant.now()).updatedAt(Instant.now())
                .build();
    }

    private void stubHttpRequest() {
        when(httpRequest.getMethod()).thenReturn("POST");
        when(httpRequest.getRequestURI()).thenReturn("/ingress/validtoken");
        when(httpRequest.getContentType()).thenReturn("application/json");
        when(httpRequest.getRemoteAddr()).thenReturn("127.0.0.1");
        when(httpRequest.getHeaderNames()).thenReturn(Collections.enumeration(List.of("content-type")));
        when(httpRequest.getHeader(anyString())).thenReturn(null);
        when(httpRequest.getHeader("content-type")).thenReturn("application/json");
    }

    @Test
    void receiveWebhook_success_noDestinations() {
        IncomingSource source = buildActiveSource();
        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));
        when(eventRepository.save(any(IncomingEvent.class))).thenAnswer(inv -> {
            IncomingEvent e = inv.getArgument(0);
            e.setId(eventId);
            return e;
        });
        when(destinationRepository.findByIncomingSourceIdAndEnabledTrue(sourceId)).thenReturn(List.of());
        stubHttpRequest();

        IncomingEvent event = service.receiveWebhook("validtoken", "{\"test\":true}", httpRequest);

        assertThat(event.getId()).isEqualTo(eventId);
        assertThat(event.getIncomingSourceId()).isEqualTo(sourceId);
        assertThat(event.getBodyRaw()).isEqualTo("{\"test\":true}");
        assertThat(event.getMethod()).isEqualTo("POST");
        assertThat(event.getRequestId()).isNotNull();
        assertThat(event.getBodySha256()).isNotNull();
        assertThat(event.getVerified()).isNull(); // verification mode NONE

        verify(forwardAttemptRepository, never()).saveAll(any());
        verify(outboxMessageRepository, never()).saveAll(any());
    }

    @Test
    void receiveWebhook_success_withDestinations() {
        IncomingSource source = buildActiveSource();
        IncomingDestination dest = IncomingDestination.builder()
                .id(destId).incomingSourceId(sourceId)
                .url("https://example.com/hook")
                .authType(IncomingAuthType.NONE)
                .enabled(true).maxAttempts(5).timeoutSeconds(30)
                .retryDelays("60,300")
                .build();

        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));
        when(eventRepository.save(any(IncomingEvent.class))).thenAnswer(inv -> {
            IncomingEvent e = inv.getArgument(0);
            e.setId(eventId);
            return e;
        });
        when(destinationRepository.findByIncomingSourceIdAndEnabledTrue(sourceId)).thenReturn(List.of(dest));
        stubHttpRequest();

        IncomingEvent event = service.receiveWebhook("validtoken", "{\"data\":1}", httpRequest);

        assertThat(event.getId()).isEqualTo(eventId);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<IncomingForwardAttempt>> attemptCaptor = ArgumentCaptor.forClass(List.class);
        verify(forwardAttemptRepository).saveAll(attemptCaptor.capture());
        List<IncomingForwardAttempt> attempts = attemptCaptor.getValue();
        assertThat(attempts).hasSize(1);
        assertThat(attempts.get(0).getDestinationId()).isEqualTo(destId);
        assertThat(attempts.get(0).getStatus()).isEqualTo(ForwardAttemptStatus.PENDING);
        assertThat(attempts.get(0).getAttemptNumber()).isEqualTo(1);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<OutboxMessage>> outboxCaptor = ArgumentCaptor.forClass(List.class);
        verify(outboxMessageRepository).saveAll(outboxCaptor.capture());
        assertThat(outboxCaptor.getValue()).hasSize(1);
    }

    @Test
    void receiveWebhook_invalidToken_throws() {
        when(sourceRepository.findByIngressPathToken("invalid")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.receiveWebhook("invalid", "{}", httpRequest))
                .isInstanceOf(SourceNotFoundException.class);
    }

    @Test
    void receiveWebhook_disabledSource_throws() {
        IncomingSource source = buildActiveSource();
        source.setStatus(IncomingSourceStatus.DISABLED);
        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));

        assertThatThrownBy(() -> service.receiveWebhook("validtoken", "{}", httpRequest))
                .isInstanceOf(SourceDisabledException.class);
    }

    @Test
    void receiveWebhook_payloadTooLarge_throws() {
        IncomingSource source = buildActiveSource();
        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));

        // Service configured with maxPayloadSizeBytes=524288, create larger body
        String hugeBody = "x".repeat(600000);

        assertThatThrownBy(() -> service.receiveWebhook("validtoken", hugeBody, httpRequest))
                .isInstanceOf(PayloadTooLargeException.class)
                .hasMessageContaining("524288");
    }

    @Test
    void receiveWebhook_hmacVerification_success() {
        String secret = "my-hmac-secret";
        CryptoUtils.EncryptedData encrypted = CryptoUtils.encryptSecret(secret, encryptionKey, encryptionSalt);

        IncomingSource source = buildActiveSource();
        source.setVerificationMode(VerificationMode.HMAC_GENERIC);
        source.setHmacSecretEncrypted(encrypted.getCiphertext());
        source.setHmacSecretIv(encrypted.getIv());
        source.setHmacHeaderName("X-Signature");
        source.setHmacSignaturePrefix("");

        String body = "{\"test\":true}";
        // Compute expected HMAC
        String expectedHmac = computeHmac(secret, body);

        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));
        when(eventRepository.save(any(IncomingEvent.class))).thenAnswer(inv -> {
            IncomingEvent e = inv.getArgument(0);
            e.setId(eventId);
            return e;
        });
        when(destinationRepository.findByIncomingSourceIdAndEnabledTrue(sourceId)).thenReturn(List.of());
        stubHttpRequest();
        when(httpRequest.getHeader("X-Signature")).thenReturn(expectedHmac);

        IncomingEvent event = service.receiveWebhook("validtoken", body, httpRequest);

        assertThat(event.getVerified()).isTrue();
        assertThat(event.getVerificationError()).isNull();
    }

    @Test
    void receiveWebhook_hmacVerification_mismatch_throwsAndBlocksForwarding() {
        String secret = "my-hmac-secret";
        CryptoUtils.EncryptedData encrypted = CryptoUtils.encryptSecret(secret, encryptionKey, encryptionSalt);

        IncomingSource source = buildActiveSource();
        source.setVerificationMode(VerificationMode.HMAC_GENERIC);
        source.setHmacSecretEncrypted(encrypted.getCiphertext());
        source.setHmacSecretIv(encrypted.getIv());
        source.setHmacHeaderName("X-Signature");
        source.setHmacSignaturePrefix("");

        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));
        when(eventRepository.save(any(IncomingEvent.class))).thenAnswer(inv -> {
            IncomingEvent e = inv.getArgument(0);
            e.setId(eventId);
            return e;
        });
        stubHttpRequest();
        when(httpRequest.getHeader("X-Signature")).thenReturn("wrong-signature");

        assertThatThrownBy(() -> service.receiveWebhook("validtoken", "{\"test\":true}", httpRequest))
                .isInstanceOf(SignatureVerificationFailedException.class)
                .satisfies(ex -> {
                    SignatureVerificationFailedException sve =
                            (SignatureVerificationFailedException) ex;
                    assertThat(sve.getEvent().getVerified()).isFalse();
                    assertThat(sve.getEvent().getVerificationError()).isEqualTo("Signature mismatch");
                });

        // Event is saved for audit trail
        verify(eventRepository).save(any(IncomingEvent.class));
        // But no forward attempts or outbox messages are created
        verify(forwardAttemptRepository, never()).saveAll(any());
        verify(outboxMessageRepository, never()).saveAll(any());
        // Destinations are never queried since we short-circuit before that
        verify(destinationRepository, never()).findByIncomingSourceIdAndEnabledTrue(any());
    }

    @Test
    void receiveWebhook_hmacVerification_mismatch_withDestinations_blocksForwarding() {
        String secret = "my-hmac-secret";
        CryptoUtils.EncryptedData encrypted = CryptoUtils.encryptSecret(secret, encryptionKey, encryptionSalt);

        IncomingSource source = buildActiveSource();
        source.setVerificationMode(VerificationMode.HMAC_GENERIC);
        source.setHmacSecretEncrypted(encrypted.getCiphertext());
        source.setHmacSecretIv(encrypted.getIv());
        source.setHmacHeaderName("X-Signature");
        source.setHmacSignaturePrefix("");

        IncomingDestination dest = IncomingDestination.builder()
                .id(destId).incomingSourceId(sourceId)
                .url("https://example.com/hook")
                .authType(IncomingAuthType.NONE)
                .enabled(true).maxAttempts(5).timeoutSeconds(30)
                .retryDelays("60,300")
                .build();

        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));
        when(eventRepository.save(any(IncomingEvent.class))).thenAnswer(inv -> {
            IncomingEvent e = inv.getArgument(0);
            e.setId(eventId);
            return e;
        });
        stubHttpRequest();
        when(httpRequest.getHeader("X-Signature")).thenReturn("bad-sig");

        assertThatThrownBy(() -> service.receiveWebhook("validtoken", "{\"data\":1}", httpRequest))
                .isInstanceOf(SignatureVerificationFailedException.class);

        // Event saved for audit, but forwarding completely blocked
        verify(eventRepository).save(any(IncomingEvent.class));
        verify(forwardAttemptRepository, never()).saveAll(any());
        verify(outboxMessageRepository, never()).saveAll(any());
    }

    @Test
    void receiveWebhook_nullBody_accepted() {
        IncomingSource source = buildActiveSource();
        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));
        when(eventRepository.save(any(IncomingEvent.class))).thenAnswer(inv -> {
            IncomingEvent e = inv.getArgument(0);
            e.setId(eventId);
            return e;
        });
        when(destinationRepository.findByIncomingSourceIdAndEnabledTrue(sourceId)).thenReturn(List.of());
        stubHttpRequest();

        IncomingEvent event = service.receiveWebhook("validtoken", null, httpRequest);

        assertThat(event.getBodyRaw()).isNull();
        assertThat(event.getBodySha256()).isNull();
    }

    @Test
    void receiveWebhook_xForwardedFor_extractsClientIp() {
        IncomingSource source = buildActiveSource();
        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));
        when(eventRepository.save(any(IncomingEvent.class))).thenAnswer(inv -> {
            IncomingEvent e = inv.getArgument(0);
            e.setId(eventId);
            return e;
        });
        when(destinationRepository.findByIncomingSourceIdAndEnabledTrue(sourceId)).thenReturn(List.of());
        stubHttpRequest();
        when(httpRequest.getHeader("X-Forwarded-For")).thenReturn("203.0.113.50, 70.41.3.18");

        IncomingEvent event = service.receiveWebhook("validtoken", "{}", httpRequest);

        assertThat(event.getClientIp()).isEqualTo("203.0.113.50");
    }

    @Test
    void receiveWebhook_duplicateProviderEventId_returnsExisting() {
        IncomingSource source = buildActiveSource();
        IncomingEvent existing = IncomingEvent.builder()
                .id(eventId).incomingSourceId(sourceId)
                .requestId("old-req").method("POST")
                .providerEventId("evt_123")
                .receivedAt(Instant.now())
                .build();

        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));
        stubHttpRequest();
        when(httpRequest.getHeader("X-Webhook-Id")).thenReturn("evt_123");
        when(eventRepository.findByIncomingSourceIdAndProviderEventId(sourceId, "evt_123"))
                .thenReturn(Optional.of(existing));

        IncomingEvent result = service.receiveWebhook("validtoken", "{\"data\":1}", httpRequest);

        assertThat(result.getId()).isEqualTo(eventId);
        // No new event saved, no forwarding
        verify(eventRepository, never()).save(any(IncomingEvent.class));
        verify(forwardAttemptRepository, never()).saveAll(any());
    }

    @Test
    void receiveWebhook_newProviderEventId_setsFieldOnEvent() {
        IncomingSource source = buildActiveSource();
        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));
        when(eventRepository.findByIncomingSourceIdAndProviderEventId(eq(sourceId), anyString()))
                .thenReturn(Optional.empty());
        when(eventRepository.save(any(IncomingEvent.class))).thenAnswer(inv -> {
            IncomingEvent e = inv.getArgument(0);
            e.setId(eventId);
            return e;
        });
        when(destinationRepository.findByIncomingSourceIdAndEnabledTrue(sourceId)).thenReturn(List.of());
        stubHttpRequest();
        when(httpRequest.getHeader("Stripe-Webhook-Id")).thenReturn("evt_stripe_456");

        IncomingEvent result = service.receiveWebhook("validtoken", "{}", httpRequest);

        assertThat(result.getProviderEventId()).isEqualTo("evt_stripe_456");
    }

    @Test
    void receiveWebhook_duplicateRace_resolvesGracefully() {
        IncomingSource source = buildActiveSource();
        IncomingEvent existing = IncomingEvent.builder()
                .id(eventId).incomingSourceId(sourceId)
                .requestId("first-req").method("POST")
                .providerEventId("evt_race")
                .receivedAt(Instant.now())
                .build();

        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));
        stubHttpRequest();
        when(httpRequest.getHeader("X-Webhook-Id")).thenReturn("evt_race");
        // First call: dedup check returns empty (race window)
        when(eventRepository.findByIncomingSourceIdAndProviderEventId(sourceId, "evt_race"))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(existing));
        // save() throws DataIntegrityViolationException (unique index violation)
        when(eventRepository.save(any(IncomingEvent.class)))
                .thenThrow(new DataIntegrityViolationException("Unique index violation"));

        IncomingEvent result = service.receiveWebhook("validtoken", "{\"data\":1}", httpRequest);

        assertThat(result.getId()).isEqualTo(eventId);
        assertThat(result.getProviderEventId()).isEqualTo("evt_race");
        // No forwarding created
        verify(forwardAttemptRepository, never()).saveAll(any());
    }

    @Test
    void receiveWebhook_duplicateRace_noProviderEventId_rethrows() {
        IncomingSource source = buildActiveSource();
        when(sourceRepository.findByIngressPathToken("validtoken")).thenReturn(Optional.of(source));
        stubHttpRequest();
        // No provider event ID header — providerEventId will be body SHA256
        when(eventRepository.findByIncomingSourceIdAndProviderEventId(eq(sourceId), anyString()))
                .thenReturn(Optional.empty());
        when(eventRepository.save(any(IncomingEvent.class)))
                .thenThrow(new DataIntegrityViolationException("Unique index violation"));

        assertThatThrownBy(() -> service.receiveWebhook("validtoken", "{\"data\":1}", httpRequest))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void isSensitiveHeader_exactMatches() {
        assertThat(HeaderSanitizer.isSensitiveHeader("Authorization")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("cookie")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("Set-Cookie")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-Api-Key")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("Proxy-Authorization")).isTrue();
    }

    @Test
    void isSensitiveHeader_patternMatches_providerSignatures() {
        assertThat(HeaderSanitizer.isSensitiveHeader("Stripe-Signature")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-Hub-Signature-256")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-Shopify-Hmac-SHA256")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-Twilio-Signature")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-Slack-Signature")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-Webhook-Secret")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-Auth-Token")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-Access-Token")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-Credential-Id")).isTrue();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-Password-Hash")).isTrue();
    }

    @Test
    void isSensitiveHeader_safeHeaders_notMasked() {
        assertThat(HeaderSanitizer.isSensitiveHeader("Content-Type")).isFalse();
        assertThat(HeaderSanitizer.isSensitiveHeader("User-Agent")).isFalse();
        assertThat(HeaderSanitizer.isSensitiveHeader("Accept")).isFalse();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-Request-Id")).isFalse();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-Webhook-Id")).isFalse();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-GitHub-Event")).isFalse();
        assertThat(HeaderSanitizer.isSensitiveHeader("X-GitHub-Delivery")).isFalse();
        assertThat(HeaderSanitizer.isSensitiveHeader("Host")).isFalse();
    }

    private String computeHmac(String secret, String body) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            javax.crypto.spec.SecretKeySpec keySpec = new javax.crypto.spec.SecretKeySpec(
                    secret.getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] hash = mac.doFinal(body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
