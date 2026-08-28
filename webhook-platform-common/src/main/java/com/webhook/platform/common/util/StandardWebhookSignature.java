package com.webhook.platform.common.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * Signatures in the shape the <a href="https://github.com/standard-webhooks/standard-webhooks">
 * Standard Webhooks</a> convention describes.
 *
 * <p>This exists alongside {@link WebhookSignatureUtils}, which produces the Stripe-shaped
 * {@code X-Signature: t=…,v1=…} header this platform has always sent, and does not replace
 * it. The point is interoperability: a receiver following the convention can verify with an
 * off-the-shelf library rather than by reading our documentation, and the convention has been
 * adopted widely enough — OpenAI, Anthropic, Twilio, PagerDuty, Supabase — that "which
 * library verifies this?" is a question worth having a good answer to.</p>
 *
 * <h2>The three headers</h2>
 * <pre>
 *   webhook-id:        the delivery id — stable across retries, so a receiver can dedupe on it
 *   webhook-timestamp: unix seconds
 *   webhook-signature: v1,&lt;base64&gt; [v1,&lt;base64&gt; …]
 * </pre>
 * signed over {@code {id}.{timestamp}.{body}} with HMAC-SHA256. Note what differs from our
 * own scheme beyond the header names: the id participates in the signed content, the digest
 * is base64 rather than hex, and multiple signatures are separated by spaces rather than
 * commas.
 *
 * <h2>What the key is</h2>
 * <p>The secret's raw UTF-8 bytes. The reference libraries take a base64 secret, conventionally
 * written {@code whsec_<base64>}, and decode it to the key bytes — so a receiver using one of
 * them passes {@link #asSharedSecret(String)} of our secret and gets back exactly these bytes.
 * Signing with the raw bytes rather than trying to base64-decode whatever is stored keeps this
 * working for a customer-supplied secret, which is arbitrary text and need not be base64 at
 * all.</p>
 */
public final class StandardWebhookSignature {

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final String VERSION = "v1";

    /** Conventional prefix on the base64 secret handed to a receiver's library. */
    private static final String SECRET_PREFIX = "whsec_";

    /** The spec's recommended tolerance either side of now. */
    public static final long DEFAULT_TOLERANCE_SECONDS = 300;

    private StandardWebhookSignature() {
    }

    /**
     * The secret in the form the reference libraries expect: {@code whsec_} followed by the
     * standard-base64 of the same bytes this class signs with.
     *
     * <p>Ours are URL-safe base64 without padding, which is a different alphabet — handing one
     * straight to a library that base64-decodes it would either fail or, worse, decode to
     * different bytes. This is the value to show a receiver, not the stored secret.</p>
     */
    public static String asSharedSecret(String secret) {
        return SECRET_PREFIX + Base64.getEncoder()
                .encodeToString(secret.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * @param messageId the delivery id, which stays the same across every attempt of one
     *                  delivery — that is what makes it usable for deduplication
     */
    public static String sign(String secret, String messageId, long timestampSeconds, String body) {
        return sign(secret.getBytes(StandardCharsets.UTF_8), messageId, timestampSeconds, body);
    }

    /**
     * The signing primitive, over key bytes rather than text.
     *
     * <p>A key is bytes, and the String overload above is a convenience that happens to fit
     * how this platform stores its secrets. Anything derived from base64 — which is what the
     * reference libraries hand their HMAC — is not text at all: round-tripping such bytes
     * through a String mangles every one above 0x7F, and the resulting signature is wrong in
     * a way no round-trip test against ourselves would ever notice.</p>
     */
    public static String sign(byte[] key, String messageId, long timestampSeconds, String body) {
        try {
            String signedContent = messageId + "." + timestampSeconds + "." + body;
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(key, HMAC_ALGORITHM));
            byte[] hash = mac.doFinal(signedContent.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("Failed to generate Standard Webhooks signature", e);
        }
    }

    /**
     * Builds the {@code webhook-signature} value, carrying a second signature for
     * {@code previousSecret} during a rotation grace window.
     *
     * <p>The convention allows several space-separated signatures precisely so that rotation
     * does not require the receiver to change anything: it accepts if any one matches. Our own
     * header solves the same problem with two {@code v1=} values, so rotation behaves
     * identically under both schemes.</p>
     *
     * @param previousSecret the secret being retired, or {@code null} outside a grace window
     */
    public static String buildSignatureHeader(String secret, String previousSecret,
            String messageId, long timestampSeconds, String body) {
        StringBuilder header = new StringBuilder(VERSION).append(',')
                .append(sign(secret, messageId, timestampSeconds, body));
        if (previousSecret != null && !previousSecret.isBlank() && !previousSecret.equals(secret)) {
            header.append(' ').append(VERSION).append(',')
                    .append(sign(previousSecret, messageId, timestampSeconds, body));
        }
        return header.toString();
    }

    public static boolean verify(String secret, String messageId, String timestampHeader,
            String signatureHeader, String body) {
        return verify(secret, messageId, timestampHeader, signatureHeader, body, DEFAULT_TOLERANCE_SECONDS);
    }

    /**
     * Verifies a received webhook, rejecting one whose timestamp is outside the tolerance.
     *
     * <p>The timestamp check is not decoration: without it a captured request stays replayable
     * for as long as the secret lives, because the signature over a fixed body never stops
     * being valid.</p>
     */
    public static boolean verify(String secret, String messageId, String timestampHeader,
            String signatureHeader, String body, long toleranceSeconds) {
        if (secret == null || messageId == null || timestampHeader == null || signatureHeader == null) {
            return false;
        }

        long timestamp;
        try {
            timestamp = Long.parseLong(timestampHeader.trim());
        } catch (NumberFormatException e) {
            return false;
        }

        long skew = Math.abs(System.currentTimeMillis() / 1000 - timestamp);
        if (skew > toleranceSeconds) {
            return false;
        }

        String expected = sign(secret, messageId, timestamp, body);

        // Every signature in the header is checked, not just the first: during a rotation
        // grace window the sender emits two, and the receiver holds only one of the pair.
        List<String> provided = new ArrayList<>(2);
        for (String part : signatureHeader.trim().split("\\s+")) {
            int comma = part.indexOf(',');
            if (comma > 0 && VERSION.equals(part.substring(0, comma))) {
                provided.add(part.substring(comma + 1));
            }
        }
        if (provided.isEmpty()) {
            return false;
        }

        // No short-circuit on the first match: returning early would leak, through timing,
        // which of the two signatures matched during a rotation window.
        boolean matched = false;
        byte[] expectedBytes = expected.getBytes(StandardCharsets.UTF_8);
        for (String candidate : provided) {
            if (MessageDigest.isEqual(expectedBytes, candidate.getBytes(StandardCharsets.UTF_8))) {
                matched = true;
            }
        }
        return matched;
    }
}
