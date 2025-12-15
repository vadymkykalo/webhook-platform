# ITERATION 3 - Testing Outbox Publisher

## Overview

The outbox publisher polls the `outbox_messages` table every 1 second, reads pending messages, publishes them to Kafka, and marks them as published.

## Test Flow

```bash
# 1. Rebuild and restart
mvn -q clean package -DskipTests
docker compose down -v
docker compose up -d --build

# Wait for services to start (~30s)
sleep 30

# 2. Check Kafka topics exist
docker exec -it webhook-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list

# 3. Create Kafka consumer to watch deliveries.dispatch topic
docker exec -it webhook-kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic deliveries.dispatch \
  --from-beginning \
  --property print.key=true \
  --property key.separator=" | " &

# 4. Ingest an event
curl -X POST http://localhost:8080/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_key_12345" \
  -d '{
    "type": "user.created",
    "data": {
      "userId": "user789",
      "email": "alice@example.com",
      "name": "Alice Smith"
    }
  }'

# Expected response:
# {
#   "eventId": "...",
#   "type": "user.created",
#   "createdAt": "...",
#   "deliveriesCreated": 1
# }

# 5. Wait 1-2 seconds for outbox publisher to run

# 6. Check outbox messages are published
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT id, aggregate_type, kafka_topic, status, published_at FROM outbox_messages ORDER BY created_at DESC LIMIT 5;"

# Should show status = 'published' and published_at timestamp

# 7. Check Kafka consumer output
# Should see message like:
# e1f2a3b4-5678-90cd-ef12-3456789abcde | {"deliveryId":"...","eventId":"...","endpointId":"...","subscriptionId":"...","status":"PENDING","attemptCount":0}
```

## Verify Outbox Publisher Logs

```bash
# Check API logs for outbox publisher activity
docker logs webhook-api --tail 50 | grep -i outbox

# Should see logs like:
# Publishing 1 pending outbox messages
# Marked outbox message ... as published
```

## Test Multiple Events

```bash
# Send multiple events rapidly
for i in {1..5}; do
  curl -X POST http://localhost:8080/api/v1/events \
    -H "Content-Type: application/json" \
    -H "X-API-Key: test_key_12345" \
    -d "{\"type\":\"user.created\",\"data\":{\"userId\":\"user$i\"}}" &
done
wait

# Check all outbox messages published
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT status, COUNT(*) FROM outbox_messages GROUP BY status;"

# Should show all as 'published'
```

## Expected Results

✅ Outbox messages transition from `PENDING` → `PUBLISHED`  
✅ `published_at` timestamp is set  
✅ Messages appear in Kafka `deliveries.dispatch` topic  
✅ Kafka message key = `endpointId` (for ordering)  
✅ Outbox publisher runs every 1 second  
✅ No duplicate messages sent to Kafka
