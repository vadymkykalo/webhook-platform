# @webhook-platform/node

Official Node.js SDK for [Webhook Platform](https://github.com/vadymkykalo/webhook-platform).

## Installation

```bash
npm install @webhook-platform/node
```

## Quick Start

```typescript
import { WebhookPlatform } from '@webhook-platform/node';

const client = new WebhookPlatform({
  apiKey: 'wh_live_your_api_key',
  baseUrl: 'http://localhost:8080', // optional, defaults to localhost
});

// Send an event
const event = await client.events.send({
  type: 'order.completed',
  data: {
    orderId: 'ord_12345',
    amount: 99.99,
    currency: 'USD',
  },
});

console.log(`Event created: ${event.eventId}`);
console.log(`Deliveries created: ${event.deliveriesCreated}`);
```

## API Reference

### Events

```typescript
// Send event with idempotency key
const event = await client.events.send(
  { type: 'order.completed', data: { orderId: '123' } },
  'unique-idempotency-key'
);
```

### Endpoints

```typescript
// Create endpoint
const endpoint = await client.endpoints.create(projectId, {
  url: 'https://api.example.com/webhooks',
  description: 'Production webhooks',
  enabled: true,
});

// List endpoints
const endpoints = await client.endpoints.list(projectId);

// Update endpoint
await client.endpoints.update(projectId, endpointId, {
  enabled: false,
});

// Delete endpoint
await client.endpoints.delete(projectId, endpointId);

// Rotate secret
const updated = await client.endpoints.rotateSecret(projectId, endpointId);
console.log(`New secret: ${updated.secret}`);

// Test endpoint connectivity
const result = await client.endpoints.test(projectId, endpointId);
console.log(`Test ${result.success ? 'passed' : 'failed'}: ${result.latencyMs}ms`);
```

### Subscriptions

```typescript
// Subscribe endpoint to an event type
const subscription = await client.subscriptions.create(projectId, {
  endpointId: endpoint.id,
  eventType: 'order.completed',
  enabled: true,
});

// List subscriptions
const subscriptions = await client.subscriptions.list(projectId);

// Update subscription
await client.subscriptions.update(projectId, subscriptionId, {
  eventType: 'order.shipped',
  enabled: true,
});

// Delete subscription
await client.subscriptions.delete(projectId, subscriptionId);
```

### Deliveries

```typescript
// List deliveries with filters
const deliveries = await client.deliveries.list(projectId, {
  status: 'FAILED',
  page: 0,
  size: 20,
});

console.log(`Total failed: ${deliveries.totalElements}`);

// Get delivery attempts
const attempts = await client.deliveries.getAttempts(deliveryId);
for (const attempt of attempts) {
  console.log(`Attempt ${attempt.attemptNumber}: ${attempt.httpStatus} (${attempt.latencyMs}ms)`);
}

// Replay failed delivery
await client.deliveries.replay(deliveryId);
```

## Webhook Signature Verification

Verify incoming webhooks in your endpoint:

```typescript
import { verifySignature, constructEvent } from '@webhook-platform/node';

app.post('/webhooks', (req, res) => {
  const payload = req.body; // raw body string
  const signature = req.headers['x-signature'];
  const secret = process.env.WEBHOOK_SECRET;

  try {
    // Option 1: Just verify
    verifySignature(payload, signature, secret);

    // Option 2: Verify and parse
    const event = constructEvent(payload, req.headers, secret);
    
    console.log(`Received ${event.type}:`, event.data);
    
    // Handle the event
    switch (event.type) {
      case 'order.completed':
        handleOrderCompleted(event.data);
        break;
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    res.status(400).send('Invalid signature');
  }
});
```

### Express.js Example

```typescript
import express from 'express';
import { constructEvent } from '@webhook-platform/node';

const app = express();

// Important: Use raw body for signature verification
app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
  const event = constructEvent(
    req.body.toString(),
    req.headers,
    process.env.WEBHOOK_SECRET
  );

  // Process event...
  res.sendStatus(200);
});
```

## Error Handling

```typescript
import { 
  WebhookPlatformError, 
  RateLimitError, 
  AuthenticationError,
  ValidationError 
} from '@webhook-platform/node';

try {
  await client.events.send({ type: 'test', data: {} });
} catch (err) {
  if (err instanceof RateLimitError) {
    // Wait and retry
    console.log(`Rate limited. Retry after ${err.retryAfter}ms`);
    await sleep(err.retryAfter);
  } else if (err instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (err instanceof ValidationError) {
    console.error('Validation failed:', err.fieldErrors);
  } else if (err instanceof WebhookPlatformError) {
    console.error(`Error ${err.status}: ${err.message}`);
  }
}
```

## Configuration

```typescript
const client = new WebhookPlatform({
  apiKey: 'wh_live_xxx',      // Required: Your API key
  baseUrl: 'https://api.example.com', // Optional: API base URL
  timeout: 30000,              // Optional: Request timeout in ms (default: 30000)
});
```

## TypeScript Support

This SDK is written in TypeScript and includes full type definitions:

```typescript
import type { 
  Event, 
  EventResponse, 
  Endpoint, 
  Delivery,
  DeliveryStatus 
} from '@webhook-platform/node';
```

## Development

### Running Tests

**Local (requires Node.js 16+):**
```bash
npm install
npm test
```

**Docker:**
```bash
docker run --rm -v $(pwd):/app -w /app node:20-alpine sh -c "npm install && npm test"
```

### Building

```bash
npm run build
```

## License

MIT
