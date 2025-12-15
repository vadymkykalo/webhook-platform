package com.webhook.platform.common.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

public class WebhookSignatureUtils {

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    public static String generateSignature(String secret, long timestamp, String body) {
        try {
            String payload = timestamp + "." + body;
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            SecretKeySpec secretKeySpec = new SecretKeySpec(
                    secret.getBytes(StandardCharsets.UTF_8),
                    HMAC_ALGORITHM
            );
            mac.init(secretKeySpec);
            byte[] hash = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new RuntimeException("Failed to generate webhook signature", e);
        }
    }

    public static String buildSignatureHeader(String secret, long timestamp, String body) {
        String signature = generateSignature(secret, timestamp, body);
        return "t=" + timestamp + ",v1=" + signature;
    }

    public static boolean verifySignature(String secret, String signatureHeader, String body) {
        try {
            String[] parts = signatureHeader.split(",");
            long timestamp = 0;
            String providedSignature = null;

            for (String part : parts) {
                String[] kv = part.split("=", 2);
                if (kv.length == 2) {
                    if ("t".equals(kv[0])) {
                        timestamp = Long.parseLong(kv[1]);
                    } else if ("v1".equals(kv[0])) {
                        providedSignature = kv[1];
                    }
                }
            }

            if (timestamp == 0 || providedSignature == null) {
                return false;
            }

            String expectedSignature = generateSignature(secret, timestamp, body);
            return expectedSignature.equals(providedSignature);
        } catch (Exception e) {
            return false;
        }
    }
}
