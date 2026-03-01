# webhook-platform

Official Python SDK for [Webhook Platform](https://github.com/vadymkykalo/webhook-platform).

## Installation

```bash
pip install webhook-platform
```

## Quick Start

```python
from webhook_platform import WebhookPlatform, Event

client = WebhookPlatform(
    api_key="wh_live_your_api_key",
    base_url="http://localhost:8080",  # optional
)

# Send an event
event = client.events.send(
    Event(
        type="order.completed",
        data={
            "order_id": "ord_12345",
            "amount": 99.99,
            "currency": "USD",
        },
    )
)

print(f"Event created: {event.event_id}")
print(f"Deliveries created: {event.deliveries_created}")
```

## API Reference

### Events

```python
from webhook_platform import Event

# Send event with idempotency key
event = client.events.send(
    Event(type="order.completed", data={"order_id": "123"}),
    idempotency_key="unique-key",
)
```

### Endpoints

```python
from webhook_platform import EndpointCreateParams, EndpointUpdateParams

# Create endpoint
endpoint = client.endpoints.create(
    project_id,
    EndpointCreateParams(
        url="https://api.example.com/webhooks",
        description="Production webhooks",
        enabled=True,
    ),
)

# List endpoints
endpoints = client.endpoints.list(project_id)

# Update endpoint
client.endpoints.update(
    project_id,
    endpoint_id,
    EndpointUpdateParams(enabled=False),
)

# Delete endpoint
client.endpoints.delete(project_id, endpoint_id)

# Rotate secret
updated = client.endpoints.rotate_secret(project_id, endpoint_id)
print(f"New secret: {updated.secret}")

# Test endpoint connectivity
result = client.endpoints.test(project_id, endpoint_id)
print(f"Test {'passed' if result.success else 'failed'}: {result.latency_ms}ms")
```

### Subscriptions

```python
from webhook_platform import SubscriptionCreateParams

# Subscribe endpoint to an event type
subscription = client.subscriptions.create(
    project_id,
    SubscriptionCreateParams(
        endpoint_id=endpoint.id,
        event_type="order.completed",
        enabled=True,
    ),
)

# List subscriptions
subscriptions = client.subscriptions.list(project_id)

# Update subscription
client.subscriptions.update(
    project_id,
    subscription_id,
    event_type="order.shipped",
)

# Delete subscription
client.subscriptions.delete(project_id, subscription_id)
```

### Deliveries

```python
from webhook_platform import DeliveryListParams, DeliveryStatus

# List deliveries with filters
deliveries = client.deliveries.list(
    project_id,
    DeliveryListParams(status=DeliveryStatus.FAILED, page=0, size=20),
)

print(f"Total failed: {deliveries.total_elements}")

# Get delivery attempts
attempts = client.deliveries.get_attempts(delivery_id)
for attempt in attempts:
    print(f"Attempt {attempt.attempt_number}: {attempt.http_status} ({attempt.latency_ms}ms)")

# Replay failed delivery
client.deliveries.replay(delivery_id)
```

## Incoming Webhooks

Receive, validate, and forward webhooks from third-party providers (Stripe, GitHub, Twilio, etc.).

### Incoming Sources

```python
from webhook_platform import IncomingSourceCreateParams, IncomingSourceUpdateParams

# Create an incoming source with HMAC verification
source = client.incoming_sources.create(
    project_id,
    IncomingSourceCreateParams(
        name="Stripe Webhooks",
        slug="stripe",
        provider_type="STRIPE",
        verification_mode="HMAC_GENERIC",
        hmac_secret="whsec_...",
        hmac_header_name="Stripe-Signature",
    ),
)

print(f"Ingress URL: {source.ingress_url}")

# List sources
sources = client.incoming_sources.list(project_id)

# Update source
client.incoming_sources.update(
    project_id,
    source_id,
    IncomingSourceUpdateParams(name="Stripe Production", rate_limit_per_second=100),
)

# Delete source
client.incoming_sources.delete(project_id, source_id)
```

### Incoming Destinations

```python
from webhook_platform import IncomingDestinationCreateParams

# Add a forwarding destination
dest = client.incoming_sources.create_destination(
    project_id,
    source_id,
    IncomingDestinationCreateParams(
        url="https://your-api.com/webhooks/stripe",
        enabled=True,
        max_attempts=5,
        timeout_seconds=30,
    ),
)

# List destinations
dests = client.incoming_sources.list_destinations(project_id, source_id)

# Delete destination
client.incoming_sources.delete_destination(project_id, source_id, dest_id)
```

### Incoming Events

```python
from webhook_platform import IncomingEventListParams

# List incoming events (with optional source filter)
events = client.incoming_events.list(
    project_id,
    IncomingEventListParams(source_id=source.id, page=0, size=20),
)

# Get event details
event = client.incoming_events.get(project_id, event_id)

# Get forward attempts
attempts = client.incoming_events.get_attempts(project_id, event_id)

# Replay event to all destinations
result = client.incoming_events.replay(project_id, event_id)
print(f"Replayed to {result.destinations_count} destinations")
```

## Webhook Signature Verification

Verify incoming webhooks in your endpoint:

```python
from webhook_platform import verify_signature, construct_event, WebhookPlatformError

# Flask example
from flask import Flask, request

app = Flask(__name__)

@app.route("/webhooks", methods=["POST"])
def handle_webhook():
    payload = request.get_data(as_text=True)
    headers = dict(request.headers)
    secret = os.environ["WEBHOOK_SECRET"]

    try:
        # Option 1: Just verify
        verify_signature(payload, headers.get("X-Signature", ""), secret)

        # Option 2: Verify and parse
        event = construct_event(payload, headers, secret)

        print(f"Received {event.type}: {event.data}")

        # Handle the event
        if event.type == "order.completed":
            handle_order_completed(event.data)

        return "OK", 200

    except WebhookPlatformError as e:
        print(f"Webhook verification failed: {e.message}")
        return "Invalid signature", 400
```

### FastAPI Example

```python
from fastapi import FastAPI, Request, HTTPException
from webhook_platform import construct_event, WebhookPlatformError

app = FastAPI()

@app.post("/webhooks")
async def handle_webhook(request: Request):
    payload = await request.body()
    headers = dict(request.headers)

    try:
        event = construct_event(
            payload.decode("utf-8"),
            headers,
            os.environ["WEBHOOK_SECRET"],
        )

        # Process event...
        return {"status": "ok"}

    except WebhookPlatformError as e:
        raise HTTPException(status_code=400, detail=e.message)
```

## Error Handling

```python
from webhook_platform import (
    WebhookPlatformError,
    RateLimitError,
    AuthenticationError,
    ValidationError,
)

try:
    client.events.send(Event(type="test", data={}))
except RateLimitError as e:
    # Wait and retry
    print(f"Rate limited. Retry after {e.retry_after_ms}ms")
    time.sleep(e.retry_after_ms / 1000)
except AuthenticationError:
    print("Invalid API key")
except ValidationError as e:
    print(f"Validation failed: {e.field_errors}")
except WebhookPlatformError as e:
    print(f"Error {e.status}: {e.message}")
```

## Configuration

```python
client = WebhookPlatform(
    api_key="wh_live_xxx",          # Required: Your API key
    base_url="https://api.example.com",  # Optional: API base URL
    timeout=30,                     # Optional: Request timeout in seconds (default: 30)
)
```

## Type Hints

This SDK includes full type hints for better IDE support:

```python
from webhook_platform import (
    Event,
    EventResponse,
    Endpoint,
    Delivery,
    DeliveryStatus,
)
```

## Development

### Running Tests

**Local (requires Python 3.8+):**
```bash
pip install -e ".[dev]"
pytest
```

**Docker:**
```bash
docker run --rm -v $(pwd):/app -w /app python:3.11-slim sh -c "pip install -e '.[dev]' && pytest"
```

## License

MIT
