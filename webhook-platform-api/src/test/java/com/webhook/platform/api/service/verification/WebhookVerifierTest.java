package com.webhook.platform.api.service.verification;

import com.webhook.platform.api.domain.entity.IncomingSource;
import com.webhook.platform.common.enums.ProviderType;
import com.webhook.platform.common.enums.VerificationMode;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WebhookVerifierTest {

    @Mock
    private HttpServletRequest request;

    private static final String SECRET = "whsec_test_secret_key";
    private static final String BODY = "{\"event\":\"push\",\"ref\":\"refs/heads/main\"}";

    // ======================== GenericHmacVerifier ========================

    @Test
    void genericHmac_success() {
        GenericHmacVerifier verifier = new GenericHmacVerifier("X-Signature", "");
        String hmac = hmacSha256Hex(SECRET, BODY);
        when(request.getHeader("X-Signature")).thenReturn(hmac);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isTrue();
        assertThat(result.error()).isNull();
        assertThat(result.replayKey()).isEqualTo(hmac);
    }

    @Test
    void genericHmac_withPrefix() {
        GenericHmacVerifier verifier = new GenericHmacVerifier("X-Sig", "sha256=");
        String hmac = hmacSha256Hex(SECRET, BODY);
        when(request.getHeader("X-Sig")).thenReturn("sha256=" + hmac);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isTrue();
    }

    @Test
    void genericHmac_missingHeader() {
        GenericHmacVerifier verifier = new GenericHmacVerifier("X-Signature", "");
        when(request.getHeader("X-Signature")).thenReturn(null);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("Missing signature header");
    }

    @Test
    void genericHmac_mismatch() {
        GenericHmacVerifier verifier = new GenericHmacVerifier("X-Signature", "");
        when(request.getHeader("X-Signature")).thenReturn("wrong_signature");

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("Signature mismatch");
    }

    // ======================== GitHubVerifier ========================

    @Test
    void github_success() {
        GitHubVerifier verifier = new GitHubVerifier();
        String hmac = hmacSha256Hex(SECRET, BODY);
        when(request.getHeader("X-Hub-Signature-256")).thenReturn("sha256=" + hmac);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isTrue();
        assertThat(result.replayKey()).isEqualTo("sha256=" + hmac);
    }

    @Test
    void github_missingHeader() {
        GitHubVerifier verifier = new GitHubVerifier();
        when(request.getHeader("X-Hub-Signature-256")).thenReturn(null);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("Missing header");
    }

    @Test
    void github_wrongPrefix() {
        GitHubVerifier verifier = new GitHubVerifier();
        when(request.getHeader("X-Hub-Signature-256")).thenReturn("md5=abcdef");

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("missing sha256= prefix");
    }

    @Test
    void github_mismatch() {
        GitHubVerifier verifier = new GitHubVerifier();
        when(request.getHeader("X-Hub-Signature-256")).thenReturn("sha256=0000000000");

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("mismatch");
    }

    // ======================== StripeVerifier ========================

    @Test
    void stripe_success() {
        StripeVerifier verifier = new StripeVerifier();
        long timestamp = Instant.now().getEpochSecond();
        String signedPayload = timestamp + "." + BODY;
        String hmac = hmacSha256Hex(SECRET, signedPayload);
        String header = "t=" + timestamp + ",v1=" + hmac;
        when(request.getHeader("Stripe-Signature")).thenReturn(header);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isTrue();
        assertThat(result.replayKey()).isEqualTo(header);
    }

    @Test
    void stripe_expiredTimestamp() {
        StripeVerifier verifier = new StripeVerifier();
        long oldTimestamp = Instant.now().getEpochSecond() - 600; // 10 min ago
        String signedPayload = oldTimestamp + "." + BODY;
        String hmac = hmacSha256Hex(SECRET, signedPayload);
        when(request.getHeader("Stripe-Signature")).thenReturn("t=" + oldTimestamp + ",v1=" + hmac);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("tolerance");
    }

    @Test
    void stripe_missingHeader() {
        StripeVerifier verifier = new StripeVerifier();
        when(request.getHeader("Stripe-Signature")).thenReturn(null);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("Missing header");
    }

    @Test
    void stripe_invalidFormat() {
        StripeVerifier verifier = new StripeVerifier();
        when(request.getHeader("Stripe-Signature")).thenReturn("garbage");

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("missing t or v1");
    }

    @Test
    void stripe_mismatch() {
        StripeVerifier verifier = new StripeVerifier();
        long ts = Instant.now().getEpochSecond();
        when(request.getHeader("Stripe-Signature")).thenReturn("t=" + ts + ",v1=wrong");

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("mismatch");
    }

    // ======================== SlackVerifier ========================

    @Test
    void slack_success() {
        SlackVerifier verifier = new SlackVerifier();
        long timestamp = Instant.now().getEpochSecond();
        String baseString = "v0:" + timestamp + ":" + BODY;
        String hmac = hmacSha256Hex(SECRET, baseString);
        String sig = "v0=" + hmac;
        String ts = String.valueOf(timestamp);
        when(request.getHeader("X-Slack-Signature")).thenReturn(sig);
        when(request.getHeader("X-Slack-Request-Timestamp")).thenReturn(ts);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isTrue();
        assertThat(result.replayKey()).isEqualTo(sig + "|" + ts);
    }

    @Test
    void slack_expiredTimestamp() {
        SlackVerifier verifier = new SlackVerifier();
        long oldTs = Instant.now().getEpochSecond() - 600;
        String baseString = "v0:" + oldTs + ":" + BODY;
        String hmac = hmacSha256Hex(SECRET, baseString);
        when(request.getHeader("X-Slack-Signature")).thenReturn("v0=" + hmac);
        when(request.getHeader("X-Slack-Request-Timestamp")).thenReturn(String.valueOf(oldTs));

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("tolerance");
    }

    @Test
    void slack_missingSignatureHeader() {
        SlackVerifier verifier = new SlackVerifier();
        when(request.getHeader("X-Slack-Signature")).thenReturn(null);
        when(request.getHeader("X-Slack-Request-Timestamp")).thenReturn("12345");

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("Missing header: X-Slack-Signature");
    }

    @Test
    void slack_missingTimestampHeader() {
        SlackVerifier verifier = new SlackVerifier();
        when(request.getHeader("X-Slack-Signature")).thenReturn("v0=abc");
        when(request.getHeader("X-Slack-Request-Timestamp")).thenReturn(null);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("Missing header: X-Slack-Request-Timestamp");
    }

    // ======================== ShopifyVerifier ========================

    @Test
    void shopify_success() {
        ShopifyVerifier verifier = new ShopifyVerifier();
        String hmacBase64 = hmacSha256Base64(SECRET, BODY);
        when(request.getHeader("X-Shopify-Hmac-SHA256")).thenReturn(hmacBase64);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isTrue();
        assertThat(result.replayKey()).isEqualTo(hmacBase64);
    }

    @Test
    void shopify_missingHeader() {
        ShopifyVerifier verifier = new ShopifyVerifier();
        when(request.getHeader("X-Shopify-Hmac-SHA256")).thenReturn(null);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("Missing header");
    }

    @Test
    void shopify_mismatch() {
        ShopifyVerifier verifier = new ShopifyVerifier();
        when(request.getHeader("X-Shopify-Hmac-SHA256")).thenReturn("wrongBase64==");

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("mismatch");
    }

    // ======================== WebhookVerifierFactory ========================

    @Test
    void factory_returnsNullForNone() {
        var factory = new WebhookVerifierFactory();
        var source = buildSource(VerificationMode.NONE, null);

        assertThat(factory.getVerifier(source)).isNull();
    }

    @Test
    void factory_returnsGenericHmac() {
        var factory = new WebhookVerifierFactory();
        var source = buildSource(VerificationMode.HMAC_GENERIC, null);

        assertThat(factory.getVerifier(source)).isInstanceOf(GenericHmacVerifier.class);
    }

    @Test
    void factory_returnsGitHubForProvider() {
        var factory = new WebhookVerifierFactory();
        var source = buildSource(VerificationMode.PROVIDER, ProviderType.GITHUB);

        assertThat(factory.getVerifier(source)).isInstanceOf(GitHubVerifier.class);
    }

    @Test
    void factory_returnsStripeForProvider() {
        var factory = new WebhookVerifierFactory();
        var source = buildSource(VerificationMode.PROVIDER, ProviderType.STRIPE);

        assertThat(factory.getVerifier(source)).isInstanceOf(StripeVerifier.class);
    }

    @Test
    void factory_returnsSlackForProvider() {
        var factory = new WebhookVerifierFactory();
        var source = buildSource(VerificationMode.PROVIDER, ProviderType.SLACK);

        assertThat(factory.getVerifier(source)).isInstanceOf(SlackVerifier.class);
    }

    @Test
    void factory_returnsShopifyForProvider() {
        var factory = new WebhookVerifierFactory();
        var source = buildSource(VerificationMode.PROVIDER, ProviderType.SHOPIFY);

        assertThat(factory.getVerifier(source)).isInstanceOf(ShopifyVerifier.class);
    }

    @Test
    void factory_throwsForGenericProviderInProviderMode() {
        var factory = new WebhookVerifierFactory();
        var source = buildSource(VerificationMode.PROVIDER, ProviderType.GENERIC);

        assertThatThrownBy(() -> factory.getVerifier(source))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("No verifier available for provider type");
    }

    // ======================== helpers ========================

    private IncomingSource buildSource(VerificationMode mode, ProviderType providerType) {
        return IncomingSource.builder()
                .id(UUID.randomUUID())
                .verificationMode(mode)
                .providerType(providerType != null ? providerType : ProviderType.GENERIC)
                .hmacHeaderName("X-Signature")
                .hmacSignaturePrefix("")
                .build();
    }

    private static String hmacSha256Hex(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static String hmacSha256Base64(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    // ======================== GitLabVerifier ========================
    //
    // GITLAB used to be routed to GitHubVerifier, which looks for X-Hub-Signature-256.
    // GitLab never sends that header, so a source configured for GitLab in PROVIDER mode
    // failed every single delivery while the provider was listed as supported.

    @Test
    void gitlab_success() {
        GitLabVerifier verifier = new GitLabVerifier();
        when(request.getHeader("X-Gitlab-Token")).thenReturn(SECRET);
        when(request.getHeader("X-Gitlab-Event-UUID")).thenReturn("d9c1f0a2-1111-2222-3333-444455556666");

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isTrue();
        assertThat(result.error()).isNull();
    }

    @Test
    void gitlab_replayKeyIsTheEventUuidNotTheToken() {
        GitLabVerifier verifier = new GitLabVerifier();
        when(request.getHeader("X-Gitlab-Token")).thenReturn(SECRET);
        when(request.getHeader("X-Gitlab-Event-UUID")).thenReturn("event-uuid-1");

        var result = verifier.verify(SECRET, BODY, request);

        /* The token is identical on every GitLab request by design. Returning it as the
           replay key would make the second webhook GitLab ever sent look like a replay of
           the first, and replay detection rejects those outright. */
        assertThat(result.replayKey()).isEqualTo("event-uuid-1");
        assertThat(result.replayKey()).isNotEqualTo(SECRET);
    }

    @Test
    void gitlab_withoutEventUuidSkipsReplayDetection() {
        GitLabVerifier verifier = new GitLabVerifier();
        when(request.getHeader("X-Gitlab-Token")).thenReturn(SECRET);
        when(request.getHeader("X-Gitlab-Event-UUID")).thenReturn(null);

        var result = verifier.verify(SECRET, BODY, request);

        // Nothing on the request distinguishes two identical deliveries, so a null key —
        // which IngressService reads as "do not run replay detection" — is the honest answer.
        assertThat(result.verified()).isTrue();
        assertThat(result.replayKey()).isNull();
    }

    @Test
    void gitlab_tokenMismatch() {
        GitLabVerifier verifier = new GitLabVerifier();
        when(request.getHeader("X-Gitlab-Token")).thenReturn("someone-elses-token");

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("mismatch");
    }

    @Test
    void gitlab_missingHeader() {
        GitLabVerifier verifier = new GitLabVerifier();
        when(request.getHeader("X-Gitlab-Token")).thenReturn(null);

        var result = verifier.verify(SECRET, BODY, request);

        assertThat(result.verified()).isFalse();
        assertThat(result.error()).contains("X-Gitlab-Token");
    }

    @Test
    void gitlab_noSecretConfigured() {
        GitLabVerifier verifier = new GitLabVerifier();
        when(request.getHeader("X-Gitlab-Token")).thenReturn("anything");

        var result = verifier.verify(null, BODY, request);

        // Must not pass by comparing an empty secret to an empty token.
        assertThat(result.verified()).isFalse();
    }

    @Test
    void factoryRoutesGitlabToItsOwnVerifier() {
        IncomingSource source = IncomingSource.builder()
                .id(UUID.randomUUID())
                .verificationMode(VerificationMode.PROVIDER)
                .providerType(ProviderType.GITLAB)
                .build();

        assertThat(new WebhookVerifierFactory().getVerifier(source))
                .isInstanceOf(GitLabVerifier.class);
    }
}
