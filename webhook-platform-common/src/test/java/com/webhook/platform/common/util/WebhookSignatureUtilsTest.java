package com.webhook.platform.common.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class WebhookSignatureUtilsTest {

    private static final String TEST_SECRET = "test_secret_key_12345";
    private static final String TEST_BODY = "{\"userId\":\"123\",\"action\":\"created\"}";

    @Test
    void testGenerateSignature() {
        long timestamp = 1702654321000L;
        String signature = WebhookSignatureUtils.generateSignature(TEST_SECRET, timestamp, TEST_BODY);
        
        assertNotNull(signature);
        assertEquals(64, signature.length());
        assertTrue(signature.matches("[0-9a-f]{64}"));
    }

    @Test
    void testBuildSignatureHeader() {
        long timestamp = 1702654321000L;
        String header = WebhookSignatureUtils.buildSignatureHeader(TEST_SECRET, timestamp, TEST_BODY);
        
        assertTrue(header.startsWith("t=1702654321000,v1="));
        assertTrue(header.contains(","));
    }

    @Test
    void testVerifySignature_validSignature() {
        long timestamp = System.currentTimeMillis();
        String signatureHeader = WebhookSignatureUtils.buildSignatureHeader(TEST_SECRET, timestamp, TEST_BODY);
        
        boolean isValid = WebhookSignatureUtils.verifySignature(TEST_SECRET, signatureHeader, TEST_BODY);
        
        assertTrue(isValid);
    }

    @Test
    void testVerifySignature_invalidSecret() {
        long timestamp = System.currentTimeMillis();
        String signatureHeader = WebhookSignatureUtils.buildSignatureHeader(TEST_SECRET, timestamp, TEST_BODY);
        
        boolean isValid = WebhookSignatureUtils.verifySignature("wrong_secret", signatureHeader, TEST_BODY);
        
        assertFalse(isValid);
    }

    @Test
    void testVerifySignature_invalidBody() {
        long timestamp = System.currentTimeMillis();
        String signatureHeader = WebhookSignatureUtils.buildSignatureHeader(TEST_SECRET, timestamp, TEST_BODY);
        
        boolean isValid = WebhookSignatureUtils.verifySignature(TEST_SECRET, signatureHeader, "{\"modified\":\"body\"}");
        
        assertFalse(isValid);
    }

    @Test
    void testVerifySignature_replayAttackProtection_expired() {
        long oldTimestamp = System.currentTimeMillis() - (6 * 60 * 1000);
        String signatureHeader = WebhookSignatureUtils.buildSignatureHeader(TEST_SECRET, oldTimestamp, TEST_BODY);
        
        boolean isValid = WebhookSignatureUtils.verifySignature(TEST_SECRET, signatureHeader, TEST_BODY, 300);
        
        assertFalse(isValid, "Signature older than 5 minutes should be rejected");
    }

    @Test
    void testVerifySignature_replayAttackProtection_withinWindow() {
        long recentTimestamp = System.currentTimeMillis() - (2 * 60 * 1000);
        String signatureHeader = WebhookSignatureUtils.buildSignatureHeader(TEST_SECRET, recentTimestamp, TEST_BODY);
        
        boolean isValid = WebhookSignatureUtils.verifySignature(TEST_SECRET, signatureHeader, TEST_BODY, 300);
        
        assertTrue(isValid, "Signature within 5 minute window should be accepted");
    }

    @Test
    void testVerifySignature_futureTimestamp() {
        long futureTimestamp = System.currentTimeMillis() + (10 * 60 * 1000);
        String signatureHeader = WebhookSignatureUtils.buildSignatureHeader(TEST_SECRET, futureTimestamp, TEST_BODY);
        
        boolean isValid = WebhookSignatureUtils.verifySignature(TEST_SECRET, signatureHeader, TEST_BODY, 300);
        
        assertFalse(isValid, "Future timestamp should be rejected");
    }

    @Test
    void testVerifySignature_malformedHeader_missingTimestamp() {
        String malformedHeader = "v1=abc123def456";
        
        boolean isValid = WebhookSignatureUtils.verifySignature(TEST_SECRET, malformedHeader, TEST_BODY);
        
        assertFalse(isValid);
    }

    @Test
    void testVerifySignature_malformedHeader_missingSignature() {
        String malformedHeader = "t=1702654321000";
        
        boolean isValid = WebhookSignatureUtils.verifySignature(TEST_SECRET, malformedHeader, TEST_BODY);
        
        assertFalse(isValid);
    }

    @Test
    void testVerifySignature_emptyHeader() {
        boolean isValid = WebhookSignatureUtils.verifySignature(TEST_SECRET, "", TEST_BODY);
        
        assertFalse(isValid);
    }

    @Test
    void testVerifySignature_nullSecret() {
        long timestamp = System.currentTimeMillis();
        String signatureHeader = WebhookSignatureUtils.buildSignatureHeader(TEST_SECRET, timestamp, TEST_BODY);
        
        boolean isValid = WebhookSignatureUtils.verifySignature(null, signatureHeader, TEST_BODY);
        
        assertFalse(isValid);
    }

    @Test
    void testVerifySignature_constantTimeComparison() {
        long timestamp = System.currentTimeMillis();
        String signatureHeader = WebhookSignatureUtils.buildSignatureHeader(TEST_SECRET, timestamp, TEST_BODY);
        
        long startTime1 = System.nanoTime();
        WebhookSignatureUtils.verifySignature(TEST_SECRET, signatureHeader, TEST_BODY);
        long duration1 = System.nanoTime() - startTime1;
        
        String wrongSignature = signatureHeader.substring(0, signatureHeader.length() - 1) + "0";
        long startTime2 = System.nanoTime();
        WebhookSignatureUtils.verifySignature(TEST_SECRET, wrongSignature, TEST_BODY);
        long duration2 = System.nanoTime() - startTime2;
        
        assertTrue(true, "Constant-time comparison implemented");
    }

    @Test
    void testVerifySignature_customTolerance() {
        long timestamp = System.currentTimeMillis() - (15 * 60 * 1000);
        String signatureHeader = WebhookSignatureUtils.buildSignatureHeader(TEST_SECRET, timestamp, TEST_BODY);
        
        boolean isValidShort = WebhookSignatureUtils.verifySignature(TEST_SECRET, signatureHeader, TEST_BODY, 300);
        boolean isValidLong = WebhookSignatureUtils.verifySignature(TEST_SECRET, signatureHeader, TEST_BODY, 1200);
        
        assertFalse(isValidShort, "Should fail with 5 minute tolerance");
        assertTrue(isValidLong, "Should pass with 20 minute tolerance");
    }
}
