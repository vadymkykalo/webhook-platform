import * as crypto from 'crypto';
import { WebhookEvent } from './types';
import { HookflowError } from './errors';

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
 * Verifies the webhook signature using HMAC-SHA256.
 *
 * The header is `t=<unix-ms>,v1=<hex>`, and it may carry **more than one** `v1`.
 * After you rotate an endpoint's secret, Hookflow signs each delivery with both
 * the new secret and the retired one for the endpoint's grace window (24 hours
 * by default), so you can deploy the new secret whenever you like instead of at
 * the instant you press rotate. The delivery is authentic if *any* `v1` matches,
 * which is what this checks.
 *
 * @param payload - Raw request body as string
 * @param signature - X-Signature header value (format: t=timestamp,v1=signature[,v1=...])
 * @param secret - Endpoint webhook secret
 * @param options - Verification options
 * @returns true if signature is valid
 * @throws HookflowError if signature is invalid
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string,
  options: VerifyOptions = {}
): boolean {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;

  if (!signature) {
    throw new HookflowError('Missing signature header', 400, 'invalid_signature');
  }

  const parts = signature.split(',');
  let timestamp: string | undefined;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = value?.trim();
    // Collected, not overwritten: a header sent during a secret rotation carries
    // one v1 per valid secret, and keeping only the last would reject whichever
    // of the pair you are currently holding.
    if (key === 'v1' && value) signatures.push(value.trim());
  }

  if (!timestamp || signatures.length === 0) {
    throw new HookflowError(
      'Invalid signature format. Expected: t=timestamp,v1=signature',
      400,
      'invalid_signature'
    );
  }

  const timestampMs = parseInt(timestamp, 10);
  const now = Date.now();

  if (Math.abs(now - timestampMs) > tolerance) {
    throw new HookflowError(
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

  const expectedBuffer = Buffer.from(expectedSignature);
  // Every candidate is compared — no early exit — so the time taken does not
  // depend on which position matched.
  let matched = false;
  for (const candidate of signatures) {
    const sigBuffer = Buffer.from(candidate);
    if (sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      matched = true;
    }
  }

  if (!matched) {
    throw new HookflowError('Invalid signature', 400, 'invalid_signature');
  }

  return true;
}

/**
 * Constructs a webhook event from the request.
 *
 * What Hookflow actually PUTs on the wire is the event's **payload**, not an
 * envelope: a `client.events.send({ type: 'order.completed', data: {...} })`
 * arrives at your endpoint as the `data` object alone, with the identifiers
 * carried in headers (`X-Event-Id`, `X-Delivery-Id`, `X-Timestamp`,
 * `X-Sequence-Number`). So:
 *
 * - `eventId` / `deliveryId` / `timestamp` come from the headers and are
 *   always populated for a real delivery.
 * - `data` is the parsed body.
 * - `type` is only populated when the body happens to carry a `type` key —
 *   which for a default subscription it does not. Route on the payload, or
 *   configure the subscription's `payloadTemplate` to wrap the event so that
 *   `type` is part of the body.
 *
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
    throw new HookflowError('Missing X-Signature header', 400, 'missing_header');
  }

  verifySignature(payload, signature, secret, options);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(payload);
  } catch {
    throw new HookflowError('Invalid JSON payload', 400, 'invalid_payload');
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
