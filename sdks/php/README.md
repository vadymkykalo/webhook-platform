# webhook-platform/php

Official PHP SDK for [Webhook Platform](https://github.com/vadymkykalo/webhook-platform).

## Requirements

- PHP 8.1+
- ext-json
- ext-curl

## Installation

```bash
composer require webhook-platform/php
```

## Quick Start

```php
<?php

use WebhookPlatform\WebhookPlatform;

$client = new WebhookPlatform(
    apiKey: 'wh_live_your_api_key',
    baseUrl: 'http://localhost:8080' // optional
);

// Send an event
$event = $client->events->send(
    type: 'order.completed',
    data: [
        'orderId' => 'ord_12345',
        'amount' => 99.99,
        'currency' => 'USD',
    ]
);

echo "Event created: {$event['eventId']}\n";
echo "Deliveries created: {$event['deliveriesCreated']}\n";
```

## API Reference

### Events

```php
// Send event with idempotency key
$event = $client->events->send(
    type: 'order.completed',
    data: ['orderId' => '123'],
    idempotencyKey: 'unique-key'
);
```

### Endpoints

```php
// Create endpoint
$endpoint = $client->endpoints->create($projectId, [
    'url' => 'https://api.example.com/webhooks',
    'description' => 'Production webhooks',
    'enabled' => true,
]);

// List endpoints
$endpoints = $client->endpoints->list($projectId);

// Update endpoint
$client->endpoints->update($projectId, $endpointId, [
    'enabled' => false,
]);

// Delete endpoint
$client->endpoints->delete($projectId, $endpointId);

// Rotate secret
$updated = $client->endpoints->rotateSecret($projectId, $endpointId);
echo "New secret: {$updated['secret']}\n";

// Test endpoint connectivity
$result = $client->endpoints->test($projectId, $endpointId);
$status = $result['success'] ? 'passed' : 'failed';
echo "Test {$status}: {$result['latencyMs']}ms\n";
```

### Subscriptions

```php
// Subscribe endpoint to event types
$subscription = $client->subscriptions->create($projectId, [
    'endpointId' => $endpoint['id'],
    'eventTypes' => ['order.completed', 'order.cancelled'],
    'enabled' => true,
]);

// List subscriptions
$subscriptions = $client->subscriptions->list($projectId);

// Update subscription
$client->subscriptions->update($projectId, $subscriptionId, [
    'eventTypes' => ['order.*'],
]);

// Delete subscription
$client->subscriptions->delete($projectId, $subscriptionId);
```

### Deliveries

```php
// List deliveries with filters
$deliveries = $client->deliveries->list($projectId, [
    'status' => 'FAILED',
    'page' => 0,
    'size' => 20,
]);

echo "Total failed: {$deliveries['totalElements']}\n";

// Get delivery attempts
$attempts = $client->deliveries->getAttempts($deliveryId);
foreach ($attempts as $attempt) {
    echo "Attempt {$attempt['attemptNumber']}: {$attempt['httpStatus']} ({$attempt['latencyMs']}ms)\n";
}

// Replay failed delivery
$client->deliveries->replay($deliveryId);
```

## Webhook Signature Verification

Verify incoming webhooks in your endpoint:

```php
<?php

use WebhookPlatform\Webhook;
use WebhookPlatform\Exception\WebhookPlatformException;

// Get raw request body
$payload = file_get_contents('php://input');
$headers = getallheaders();
$secret = getenv('WEBHOOK_SECRET');

try {
    // Option 1: Just verify
    Webhook::verifySignature($payload, $headers['X-Signature'] ?? '', $secret);

    // Option 2: Verify and parse
    $event = Webhook::constructEvent($payload, $headers, $secret);

    echo "Received {$event['type']}: " . json_encode($event['data']) . "\n";

    // Handle the event
    switch ($event['type']) {
        case 'order.completed':
            handleOrderCompleted($event['data']);
            break;
    }

    http_response_code(200);
    echo 'OK';

} catch (WebhookPlatformException $e) {
    error_log("Webhook verification failed: {$e->getMessage()}");
    http_response_code(400);
    echo 'Invalid signature';
}
```

### Laravel Example

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use WebhookPlatform\Webhook;
use WebhookPlatform\Exception\WebhookPlatformException;

class WebhookController extends Controller
{
    public function handle(Request $request)
    {
        $payload = $request->getContent();
        $headers = $request->headers->all();
        
        try {
            $event = Webhook::constructEvent(
                $payload,
                $headers,
                config('services.webhook.secret')
            );

            // Process event...
            
            return response('OK', 200);

        } catch (WebhookPlatformException $e) {
            return response('Invalid signature', 400);
        }
    }
}
```

### Symfony Example

```php
<?php

namespace App\Controller;

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use WebhookPlatform\Webhook;
use WebhookPlatform\Exception\WebhookPlatformException;

class WebhookController
{
    public function handle(Request $request): Response
    {
        $payload = $request->getContent();
        $headers = $request->headers->all();

        try {
            $event = Webhook::constructEvent(
                $payload,
                $headers,
                $_ENV['WEBHOOK_SECRET']
            );

            // Process event...

            return new Response('OK', 200);

        } catch (WebhookPlatformException $e) {
            return new Response('Invalid signature', 400);
        }
    }
}
```

## Error Handling

```php
<?php

use WebhookPlatform\Exception\WebhookPlatformException;
use WebhookPlatform\Exception\RateLimitException;
use WebhookPlatform\Exception\AuthenticationException;
use WebhookPlatform\Exception\ValidationException;

try {
    $client->events->send('test', []);
} catch (RateLimitException $e) {
    // Wait and retry
    $retryAfterMs = $e->getRetryAfterMs();
    echo "Rate limited. Retry after {$retryAfterMs}ms\n";
    usleep($retryAfterMs * 1000);
} catch (AuthenticationException $e) {
    echo "Invalid API key\n";
} catch (ValidationException $e) {
    echo "Validation failed: " . json_encode($e->getFieldErrors()) . "\n";
} catch (WebhookPlatformException $e) {
    echo "Error {$e->getStatusCode()}: {$e->getMessage()}\n";
}
```

## Configuration

```php
$client = new WebhookPlatform(
    apiKey: 'wh_live_xxx',           // Required: Your API key
    baseUrl: 'https://api.example.com', // Optional: API base URL
    timeout: 30                      // Optional: Request timeout in seconds (default: 30)
);
```

## Development

### Running Tests

**Local (requires PHP 8.1+):**
```bash
composer install
composer test
```

**Docker:**
```bash
docker run --rm -v $(pwd):/app -w /app composer:2 sh -c "composer install && composer test"
```

## License

MIT
