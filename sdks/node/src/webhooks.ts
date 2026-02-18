import * as crypto from 'crypto';
import { WebhookEvent } from './types';
import { WebhookPlatformError } from './errors';

const SIGNATURE_HEADER = 'x-signature';
const TIMESTAMP_HEADER = 'x-timestamp';
const EVENT_ID_HEADER = 'x-event-id';
const DELIVERY_ID_HEADER = 'x-delivery-id';

const DEFAULT_TOLERANCE = 300000; // 5 minutes in milliseconds

export interface WebhookHeaders {
  'x-signature'?: string;
  'x-timestamp'?: string;
  'x-event-id'?: string;
  'x-delivery-id'?: string;
  [key: string]: string | undefined;
}

export interface VerifyOptions {
  tolerance?: number;
}

/**
 * Verifies the webhook signature using HMAC-SHA256
 * @param payload - Raw request body as string
 * @param signature - X-Signature header value (format: t=timestamp,v1=signature)
 * @param secret - Endpoint webhook secret
 * @param options - Verification options
 * @returns true if signature is valid
 * @throws WebhookPlatformError if signature is invalid
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string,
  options: VerifyOptions = {}
): boolean {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;

  if (!signature) {
    throw new WebhookPlatformError('Missing signature header', 400, 'invalid_signature');
  }

  const parts = signature.split(',');
  let timestamp: string | undefined;
  let sig: string | undefined;

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') sig = value;
  }

  if (!timestamp || !sig) {
    throw new WebhookPlatformError(
      'Invalid signature format. Expected: t=timestamp,v1=signature',
      400,
      'invalid_signature'
    );
  }

  const timestampMs = parseInt(timestamp, 10);
  const now = Date.now();

  if (Math.abs(now - timestampMs) > tolerance) {
    throw new WebhookPlatformError(
      'Webhook timestamp is outside tolerance window',
      400,
      'timestamp_expired'
    );
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  const sigBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new WebhookPlatformError('Invalid signature', 400, 'invalid_signature');
  }

  return true;
}

/**
 * Constructs a webhook event from the request
 * @param payload - Raw request body as string
 * @param headers - Request headers
 * @param secret - Endpoint webhook secret
 * @param options - Verification options
 * @returns Parsed and verified webhook event
 */
export function constructEvent(
  payload: string,
  headers: WebhookHeaders,
  secret: string,
  options: VerifyOptions = {}
): WebhookEvent {
  const signature = headers[SIGNATURE_HEADER] || headers['X-Signature'];
  const timestamp = headers[TIMESTAMP_HEADER] || headers['X-Timestamp'];
  const eventId = headers[EVENT_ID_HEADER] || headers['X-Event-Id'];
  const deliveryId = headers[DELIVERY_ID_HEADER] || headers['X-Delivery-Id'];

  if (!signature) {
    throw new WebhookPlatformError('Missing X-Signature header', 400, 'missing_header');
  }

  verifySignature(payload, signature, secret, options);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(payload);
  } catch {
    throw new WebhookPlatformError('Invalid JSON payload', 400, 'invalid_payload');
  }

  return {
    eventId: eventId || '',
    deliveryId: deliveryId || '',
    timestamp: timestamp ? parseInt(timestamp, 10) : Date.now(),
    type: (data.type as string) || '',
    data: (data.data as Record<string, unknown>) || data,
  };
}

/**
 * Generates a signature for testing purposes
 * @param payload - Request body as string
 * @param secret - Webhook secret
 * @param timestamp - Optional timestamp (defaults to now)
 * @returns Signature string in format t=timestamp,v1=signature
 */
export function generateSignature(
  payload: string,
  secret: string,
  timestamp?: number
): string {
  const ts = timestamp ?? Date.now();
  const signedPayload = `${ts}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return `t=${ts},v1=${signature}`;
}
