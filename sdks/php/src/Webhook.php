<?php

declare(strict_types=1);

namespace WebhookPlatform;

use WebhookPlatform\Exception\WebhookPlatformException;

class Webhook
{
    private const DEFAULT_TOLERANCE_MS = 300000; // 5 minutes

    /**
     * Verify webhook signature using HMAC-SHA256.
     *
     * @param string $payload Raw request body
     * @param string $signature X-Signature header value (format: t=timestamp,v1=signature)
     * @param string $secret Endpoint webhook secret
     * @param int $toleranceMs Maximum age of signature in milliseconds
     * @return bool True if signature is valid
     * @throws WebhookPlatformException If signature is invalid or expired
     */
    public static function verifySignature(
        string $payload,
        string $signature,
        string $secret,
        int $toleranceMs = self::DEFAULT_TOLERANCE_MS
    ): bool {
        if (empty($signature)) {
            throw new WebhookPlatformException('Missing signature header', 400, 'invalid_signature');
        }

        $timestamp = null;
        $sig = null;

        foreach (explode(',', $signature) as $part) {
            if (str_starts_with($part, 't=')) {
                $timestamp = substr($part, 2);
            } elseif (str_starts_with($part, 'v1=')) {
                $sig = substr($part, 3);
            }
        }

        if ($timestamp === null || $sig === null) {
            throw new WebhookPlatformException(
                'Invalid signature format. Expected: t=timestamp,v1=signature',
                400,
                'invalid_signature'
            );
        }

        $timestampMs = (int) $timestamp;
        $nowMs = (int) (microtime(true) * 1000);

        if (abs($nowMs - $timestampMs) > $toleranceMs) {
            throw new WebhookPlatformException(
                'Webhook timestamp is outside tolerance window',
                400,
                'timestamp_expired'
            );
        }

        $signedPayload = "{$timestamp}.{$payload}";
        $expectedSignature = hash_hmac('sha256', $signedPayload, $secret);

        if (!hash_equals($expectedSignature, $sig)) {
            throw new WebhookPlatformException('Invalid signature', 400, 'invalid_signature');
        }

        return true;
    }

    /**
     * Construct a webhook event from request, verifying signature.
     *
     * @param string $payload Raw request body
     * @param array $headers Request headers (case-insensitive)
     * @param string $secret Endpoint webhook secret
     * @param int $toleranceMs Maximum age of signature in milliseconds
     * @return array Parsed webhook event with eventId, deliveryId, timestamp, type, data
     * @throws WebhookPlatformException If signature is invalid or payload is malformed
     */
    public static function constructEvent(
        string $payload,
        array $headers,
        string $secret,
        int $toleranceMs = self::DEFAULT_TOLERANCE_MS
    ): array {
        // Normalize headers to lowercase
        $normalizedHeaders = [];
        foreach ($headers as $key => $value) {
            $normalizedHeaders[strtolower($key)] = is_array($value) ? $value[0] : $value;
        }

        $signature = $normalizedHeaders['x-signature'] ?? '';
        $timestamp = $normalizedHeaders['x-timestamp'] ?? '';
        $eventId = $normalizedHeaders['x-event-id'] ?? '';
        $deliveryId = $normalizedHeaders['x-delivery-id'] ?? '';

        if (empty($signature)) {
            throw new WebhookPlatformException('Missing X-Signature header', 400, 'missing_header');
        }

        self::verifySignature($payload, $signature, $secret, $toleranceMs);

        $data = json_decode($payload, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new WebhookPlatformException('Invalid JSON payload', 400, 'invalid_payload');
        }

        return [
            'eventId' => $eventId,
            'deliveryId' => $deliveryId,
            'timestamp' => $timestamp ? (int) $timestamp : (int) (microtime(true) * 1000),
            'type' => $data['type'] ?? '',
            'data' => $data['data'] ?? $data,
        ];
    }

    /**
     * Generate a signature for testing purposes.
     *
     * @param string $payload Request body
     * @param string $secret Webhook secret
     * @param int|null $timestampMs Optional timestamp in milliseconds (defaults to now)
     * @return string Signature string in format t=timestamp,v1=signature
     */
    public static function generateSignature(
        string $payload,
        string $secret,
        ?int $timestampMs = null
    ): string {
        $ts = $timestampMs ?? (int) (microtime(true) * 1000);
        $signedPayload = "{$ts}.{$payload}";
        $signature = hash_hmac('sha256', $signedPayload, $secret);

        return "t={$ts},v1={$signature}";
    }
}
