package com.webhook.platform.api.service.verification;

import com.webhook.platform.api.domain.entity.IncomingSource;
import com.webhook.platform.common.enums.ProviderType;
import com.webhook.platform.common.enums.VerificationMode;
import org.springframework.stereotype.Component;

/**
 * Factory that returns the appropriate verification strategy based on
 * the source's verification mode and provider type.
 */
@Component
public class WebhookVerifierFactory {

    /**
     * Returns a verification strategy for the given source, or null if verification is disabled.
     */
    public WebhookVerificationStrategy getVerifier(IncomingSource source) {
        if (source.getVerificationMode() == VerificationMode.NONE) {
            return null;
        }

        if (source.getVerificationMode() == VerificationMode.HMAC_GENERIC) {
            return new GenericHmacVerifier(
                    source.getHmacHeaderName(), 
                    source.getHmacSignaturePrefix());
        }

        // PROVIDER mode — pick strategy based on providerType
        if (source.getVerificationMode() == VerificationMode.PROVIDER) {
            WebhookVerificationStrategy verifier = getProviderVerifier(source.getProviderType());
            if (verifier == null) {
                throw new IllegalStateException(
                        "No verifier available for provider type: " + source.getProviderType()
                                + " on source " + source.getId());
            }
            return verifier;
        }

        throw new IllegalStateException(
                "Unknown verification mode: " + source.getVerificationMode()
                        + " on source " + source.getId());
    }

    /**
     * Whether {@code PROVIDER} mode can actually verify this provider.
     *
     * <p>{@code ProviderType} carries names no verifier is written for — {@code GENERIC},
     * {@code TWILIO}, {@code CUSTOM}. Selecting one of them with {@code PROVIDER} mode used
     * to save happily and then throw {@link IllegalStateException} at ingress, so the source
     * looked configured and the failure arrived once the provider was already sending.
     * {@code IncomingSourceService} asks this at write time instead; the two cannot disagree
     * because the answer comes from the same switch that builds the verifier.
     */
    public boolean supportsProviderVerification(ProviderType providerType) {
        return getProviderVerifier(providerType) != null;
    }

    private WebhookVerificationStrategy getProviderVerifier(ProviderType providerType) {
        if (providerType == null) {
            return null;
        }
        return switch (providerType) {
            case GITHUB -> new GitHubVerifier();
            // Not GitHubVerifier: GitLab sends a plain shared token in X-Gitlab-Token and
            // never sends X-Hub-Signature-256, so routing it here failed every delivery.
            case GITLAB -> new GitLabVerifier();
            case STRIPE -> new StripeVerifier();
            case SLACK -> new SlackVerifier();
            case SHOPIFY -> new ShopifyVerifier();
            default -> null;
        };
    }
}
