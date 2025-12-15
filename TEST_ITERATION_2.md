# ITERATION 2 - Testing Auth + Ingest

## Test Data

**Project ID:** `d7f8e9a0-1234-5678-9abc-def012345678`  
**API Key:** `test_key_12345`  
**Event Types Subscribed:** `user.created`, `order.completed`

## Test Endpoint

```bash
# 1. Start services
docker compose up -d

# 2. Wait for API to be ready
curl http://localhost:8080/actuator/health

# 3. Test without API key (should fail with 401)
curl -X POST http://localhost:8080/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "user.created",
    "data": {
      "userId": "user123",
      "email": "test@example.com",
      "name": "Test User"
    }
  }'

# 4. Test with valid API key (should succeed)
curl -X POST http://localhost:8080/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_key_12345" \
  -d '{
    "type": "user.created",
    "data": {
      "userId": "user123",
      "email": "test@example.com",
      "name": "Test User"
    }
  }'

# 5. Test idempotency (same request with idempotency key)
curl -X POST http://localhost:8080/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_key_12345" \
  -H "Idempotency-Key: req-001" \
  -d '{
    "type": "user.created",
    "data": {
      "userId": "user456",
      "email": "test2@example.com"
    }
  }'

# Send again (should return existing event)
curl -X POST http://localhost:8080/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_key_12345" \
  -H "Idempotency-Key: req-001" \
  -d '{
    "type": "user.created",
    "data": {
      "userId": "user456",
      "email": "test2@example.com"
    }
  }'

# 6. Test event type with no subscriptions (should succeed but create 0 deliveries)
curl -X POST http://localhost:8080/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_key_12345" \
  -d '{
    "type": "payment.failed",
    "data": {
      "paymentId": "pay123"
    }
  }'
```

## Verify in DB

```bash
# Check events created
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT id, event_type, idempotency_key, created_at FROM events ORDER BY created_at DESC LIMIT 5;"

# Check deliveries created
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT id, event_id, endpoint_id, status, attempt_count FROM deliveries ORDER BY created_at DESC LIMIT 5;"

# Check outbox messages (pending for publisher)
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT id, aggregate_type, kafka_topic, status, created_at FROM outbox_messages WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5;"
```

## Expected Results

1. **Unauthorized request** → 401
2. **Valid request** → 201 with `eventId`, `deliveriesCreated: 1`
3. **Idempotent requests** → Same `eventId` returned
4. **Unsubscribed event** → 201 with `deliveriesCreated: 0`
5. **Database** → Events, deliveries, outbox_messages records created
