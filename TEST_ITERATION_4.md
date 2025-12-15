# ITERATION 4 - Testing Worker Delivery + Retry/DLQ

## Overview

Worker consumes from Kafka, makes HTTP POST to webhook endpoints with HMAC signatures, records attempts, handles retries with exponential backoff, and moves to DLQ after max attempts.

## Test Setup

### 1. Create a Test Webhook Endpoint

Use webhook.site or run a local mock server:

```bash
# Option A: Use webhook.site
# Visit https://webhook.site and copy your unique URL
# Update the endpoint URL in the database

# Option B: Local mock server (simple Python)
cat > mock_webhook.py << 'EOF'
from flask import Flask, request
import sys

app = Flask(__name__)

@app.route('/', methods=['POST'])
def webhook():
    print(f"Headers: {dict(request.headers)}")
    print(f"Body: {request.get_data(as_text=True)}")
    
    # Return success
    return {"status": "received"}, 200
    
    # Or test retry with 5xx
    # return {"error": "temporary failure"}, 503

if __name__ == '__main__':
    app.run(port=9999)
EOF

python3 mock_webhook.py &
```

### 2. Update Test Data

```bash
# Update endpoint URL to point to your test endpoint
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform << EOF
UPDATE endpoints 
SET url = 'http://host.docker.internal:9999' 
WHERE id = 'e1f2a3b4-5678-90cd-ef12-3456789abcde';
EOF
```

## End-to-End Test

```bash
# 1. Rebuild and restart all services
mvn -q clean package -DskipTests
docker compose down -v
docker compose up -d --build

# Wait for services (~40s)
sleep 40

# 2. Send an event
curl -X POST http://localhost:8080/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_key_12345" \
  -d '{
    "type": "user.created",
    "data": {
      "userId": "test_user_001",
      "email": "test@example.com",
      "name": "Test User"
    }
  }'

# Expected: 201 Created with eventId and deliveriesCreated: 1

# 3. Check worker logs (should see HTTP POST attempt)
docker logs webhook-worker --tail 50

# Should see:
# - "Received delivery from deliveries.dispatch"
# - "Delivery ... succeeded after 1 attempts" (if webhook returns 2xx)

# 4. Check delivery attempts in DB
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT d.id, d.status, d.attempt_count, da.http_status_code, da.duration_ms 
      FROM deliveries d 
      LEFT JOIN delivery_attempts da ON da.delivery_id = d.id 
      ORDER BY d.created_at DESC LIMIT 5;"

# Expected: status='SUCCESS', attempt_count=1, http_status_code=200
```

## Test Retry Logic

```bash
# 1. Make webhook endpoint return 503 (Service Unavailable)
# Modify mock_webhook.py to return 503, or use webhook.site with 503 response

# 2. Send event
curl -X POST http://localhost:8080/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_key_12345" \
  -H "Idempotency-Key: retry-test-001" \
  -d '{"type":"user.created","data":{"test":"retry"}}'

# 3. Check delivery status
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT id, status, attempt_count, next_retry_at FROM deliveries 
      WHERE status = 'PENDING' ORDER BY created_at DESC LIMIT 1;"

# Expected: status='PENDING', attempt_count=1, next_retry_at set to ~1 minute from now

# 4. Wait for retry scheduler (polls every 10s)
# After next_retry_at is reached, delivery will be sent to retry topic

# 5. Monitor worker logs
docker logs webhook-worker -f

# Should see retry attempts with increasing delays:
# - Retry 1: after 1 minute (deliveries.retry.1m)
# - Retry 2: after 5 minutes (deliveries.retry.5m)
# - Retry 3: after 15 minutes (deliveries.retry.15m)
# - etc.
```

## Test DLQ (Max Attempts)

```bash
# After 7 failed attempts, delivery moves to DLQ

docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT id, status, attempt_count, failed_at 
      FROM deliveries 
      WHERE status = 'DLQ' 
      ORDER BY created_at DESC;"

# DLQ messages are consumed but only logged (no further processing)
```

## Verify Webhook Signatures

Check your webhook endpoint received proper headers:

```
X-Signature: t=1702654321000,v1=abc123def456...
X-Event-Id: uuid-of-event
X-Delivery-Id: uuid-of-delivery
X-Timestamp: 1702654321000
```

Verify signature:
```bash
# Signature format: HMAC-SHA256(secret, "timestamp.body")
# signature = HMAC-SHA256("test_secret_123", "1702654321000.{json_payload}")
```

## Database Queries

```bash
# All deliveries summary
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT status, COUNT(*) FROM deliveries GROUP BY status;"

# Recent attempts
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT da.attempt_number, da.http_status_code, da.error_message, da.duration_ms, da.created_at 
      FROM delivery_attempts da 
      ORDER BY da.created_at DESC 
      LIMIT 10;"

# Pending retries
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT id, attempt_count, next_retry_at 
      FROM deliveries 
      WHERE status = 'PENDING' AND next_retry_at IS NOT NULL 
      ORDER BY next_retry_at;"
```

## Expected Behavior

✅ **Success (2xx)** → Delivery marked SUCCESS, no retry  
✅ **Retryable (5xx, 408, 429)** → Schedule retry with backoff  
✅ **Non-retryable (4xx except 408/429)** → Delivery marked FAILED  
✅ **Timeout/Network Error** → Schedule retry  
✅ **Max Attempts (7)** → Move to DLQ  
✅ **HMAC Signature** → Proper X-Signature header sent  
✅ **Attempt Audit** → Every attempt recorded in delivery_attempts  
✅ **Ordering** → Messages to same endpoint processed in order (Kafka key = endpointId)

## Retry Schedule

| Attempt | Delay | Topic |
|---------|-------|-------|
| 1 | 1m | deliveries.retry.1m |
| 2 | 5m | deliveries.retry.5m |
| 3 | 15m | deliveries.retry.15m |
| 4 | 1h | deliveries.retry.1h |
| 5 | 6h | deliveries.retry.6h |
| 6 | 24h | deliveries.retry.24h |
| 7 | DLQ | deliveries.dlq |
