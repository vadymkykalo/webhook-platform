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
            return new GenericHmacVerifier(source.getHmacHeaderName(), source.getHmacSignaturePrefix());
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

    private WebhookVerificationStrategy getProviderVerifier(ProviderType providerType) {
        if (providerType == null) {
            return null;
        }
        return switch (providerType) {
            case GITHUB, GITLAB -> new GitHubVerifier();
            case STRIPE -> new StripeVerifier();
            case SLACK -> new SlackVerifier();
            case SHOPIFY -> new ShopifyVerifier();
            default -> null;
        };
    }
}
