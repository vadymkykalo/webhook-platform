package com.webhook.platform.api.service.verification;

import com.webhook.platform.common.util.WebhookSignatureUtils;
import jakarta.servlet.http.HttpServletRequest;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

/**
 * Generic HMAC-SHA256 verifier.
 * Supports configurable header name and signature prefix.
 * Also handles platform's standard format (t=timestamp,v1=signature).
 */
public class GenericHmacVerifier implements WebhookVerificationStrategy {

    private final String headerName;
    private final String signaturePrefix;

    public GenericHmacVerifier(String headerName, String signaturePrefix) {
        this.headerName = headerName != null ? headerName : "X-Signature";
        this.signaturePrefix = signaturePrefix != null ? signaturePrefix : "";
    }

    @Override
    public VerificationResult verify(String secret, String body, HttpServletRequest request) {
        String signatureHeader = request.getHeader(headerName);
        if (signatureHeader == null || signatureHeader.isBlank()) {
            return VerificationResult.failure("Missing signature header: " + headerName);
        }

        String signature = signatureHeader;
        if (!signaturePrefix.isEmpty() && signature.startsWith(signaturePrefix)) {
            signature = signature.substring(signaturePrefix.length());
        }

        // Platform's standard format (t=timestamp,v1=signature)
        if (signature.contains("t=") && signature.contains("v1=")) {
            boolean valid = WebhookSignatureUtils.verifySignature(secret, signature, body);
            return valid ? VerificationResult.success() : VerificationResult.failure("Signature mismatch");
        }

        // Raw HMAC-SHA256 hex comparison
        String computed = computeHmacSha256(secret, body);
        boolean valid = MessageDigest.isEqual(
                computed.getBytes(StandardCharsets.UTF_8),
                signature.getBytes(StandardCharsets.UTF_8));
        return valid ? VerificationResult.success() : VerificationResult.failure("Signature mismatch");
    }

    static String computeHmacSha256(String secret, String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] hash = mac.doFinal(body != null ? body.getBytes(StandardCharsets.UTF_8) : new byte[0]);
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("Failed to compute HMAC-SHA256", e);
        }
    }
}
