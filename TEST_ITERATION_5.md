# ITERATION 5 - Testing Management API

## Overview

Management API provides REST endpoints for CRUD operations on projects, endpoints, subscriptions, and deliveries with replay functionality.

## Test Endpoints

### Projects

```bash
# Create project
curl -X POST http://localhost:8080/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My API Project",
    "description": "Test project for webhooks"
  }'

# Response: {"id":"...", "name":"My API Project", ...}

# List projects
curl http://localhost:8080/api/v1/projects

# Get project
curl http://localhost:8080/api/v1/projects/{project_id}

# Update project
curl -X PUT http://localhost:8080/api/v1/projects/{project_id} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Project Name",
    "description": "Updated description"
  }'

# Delete project (soft delete)
curl -X DELETE http://localhost:8080/api/v1/projects/{project_id}
```

### Endpoints

```bash
# Create endpoint
curl -X POST http://localhost:8080/api/v1/projects/{project_id}/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://webhook.site/your-unique-id",
    "description": "Production webhook",
    "secret": "my_webhook_secret_key_123",
    "enabled": true,
    "rateLimitPerSecond": 10
  }'

# Response: endpoint with encrypted secret (secret not returned)

# List endpoints
curl http://localhost:8080/api/v1/projects/{project_id}/endpoints

# Get endpoint
curl http://localhost:8080/api/v1/projects/{project_id}/endpoints/{endpoint_id}

# Update endpoint (can update secret)
curl -X PUT http://localhost:8080/api/v1/projects/{project_id}/endpoints/{endpoint_id} \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://webhook.site/updated-id",
    "enabled": false,
    "secret": "new_secret_key"
  }'

# Delete endpoint (soft delete)
curl -X DELETE http://localhost:8080/api/v1/projects/{project_id}/endpoints/{endpoint_id}
```

### Subscriptions

```bash
# Create subscription
curl -X POST http://localhost:8080/api/v1/projects/{project_id}/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "endpointId": "endpoint-uuid",
    "eventType": "order.created",
    "enabled": true
  }'

# List subscriptions
curl http://localhost:8080/api/v1/projects/{project_id}/subscriptions

# Update subscription (enable/disable)
curl -X PUT http://localhost:8080/api/v1/projects/{project_id}/subscriptions/{subscription_id} \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false
  }'

# Delete subscription
curl -X DELETE http://localhost:8080/api/v1/projects/{project_id}/subscriptions/{subscription_id}
```

### Deliveries

```bash
# Get delivery details
curl http://localhost:8080/api/v1/deliveries/{delivery_id}

# List all deliveries (paginated)
curl "http://localhost:8080/api/v1/deliveries?page=0&size=20"

# List deliveries for specific event
curl "http://localhost:8080/api/v1/deliveries?eventId={event_id}&page=0&size=20"

# Replay failed/DLQ delivery
curl -X POST http://localhost:8080/api/v1/deliveries/{delivery_id}/replay

# Response: 202 Accepted (delivery reset and re-queued)
```

## Complete Workflow Example

```bash
# 1. Create project
PROJECT_ID=$(curl -s -X POST http://localhost:8080/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Project","description":"Testing"}' | jq -r '.id')

echo "Project ID: $PROJECT_ID"

# 2. Create endpoint
ENDPOINT_ID=$(curl -s -X POST http://localhost:8080/api/v1/projects/$PROJECT_ID/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://webhook.site/unique-url",
    "secret":"test_secret_123",
    "enabled":true
  }' | jq -r '.id')

echo "Endpoint ID: $ENDPOINT_ID"

# 3. Create subscription
SUBSCRIPTION_ID=$(curl -s -X POST http://localhost:8080/api/v1/projects/$PROJECT_ID/subscriptions \
  -H "Content-Type: application/json" \
  -d "{
    \"endpointId\":\"$ENDPOINT_ID\",
    \"eventType\":\"user.signup\",
    \"enabled\":true
  }" | jq -r '.id')

echo "Subscription ID: $SUBSCRIPTION_ID"

# 4. Create API key (manual DB insert for now)
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform << EOF
INSERT INTO api_keys (id, project_id, name, key_hash, key_prefix, created_at)
VALUES (
  gen_random_uuid(),
  '$PROJECT_ID',
  'Test API Key',
  'qnR5htNz1D8pTNh8i8V3dJQzXhBL4l0RciOiCNFNLWo=',
  'test_key',
  CURRENT_TIMESTAMP
);
EOF

# 5. Send event
EVENT_ID=$(curl -s -X POST http://localhost:8080/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_key_12345" \
  -d '{"type":"user.signup","data":{"userId":"user001"}}' | jq -r '.eventId')

echo "Event ID: $EVENT_ID"

# 6. List deliveries for event
curl "http://localhost:8080/api/v1/deliveries?eventId=$EVENT_ID"

# 7. Get delivery details
DELIVERY_ID=$(curl -s "http://localhost:8080/api/v1/deliveries?eventId=$EVENT_ID" | jq -r '.content[0].id')
curl http://localhost:8080/api/v1/deliveries/$DELIVERY_ID

# 8. Replay delivery (if failed)
curl -X POST http://localhost:8080/api/v1/deliveries/$DELIVERY_ID/replay
```

## Verify Secret Encryption

```bash
# Check that secrets are encrypted in DB
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT id, url, secret_encrypted, secret_iv FROM endpoints LIMIT 5;"

# Secrets should NOT be readable (encrypted with AES-GCM)
```

## Database Queries

```bash
# View all resources
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform << EOF
SELECT 'Projects' as type, COUNT(*) as count FROM projects WHERE deleted_at IS NULL
UNION ALL
SELECT 'Endpoints', COUNT(*) FROM endpoints WHERE deleted_at IS NULL
UNION ALL
SELECT 'Subscriptions', COUNT(*) FROM subscriptions
UNION ALL
SELECT 'Events', COUNT(*) FROM events
UNION ALL
SELECT 'Deliveries', COUNT(*) FROM deliveries;
EOF

# View project with all resources
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform << EOF
SELECT 
  p.name as project,
  COUNT(DISTINCT e.id) as endpoints,
  COUNT(DISTINCT s.id) as subscriptions,
  COUNT(DISTINCT ev.id) as events,
  COUNT(DISTINCT d.id) as deliveries
FROM projects p
LEFT JOIN endpoints e ON e.project_id = p.id AND e.deleted_at IS NULL
LEFT JOIN subscriptions s ON s.project_id = p.id
LEFT JOIN events ev ON ev.project_id = p.id
LEFT JOIN deliveries d ON d.event_id = ev.id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name;
EOF
```

## Expected Behavior

✅ **Projects** - CRUD with soft delete  
✅ **Endpoints** - CRUD with secret encryption (AES-GCM)  
✅ **Subscriptions** - CRUD with unique constraint (endpoint + event type)  
✅ **Deliveries** - Read and replay functionality  
✅ **Replay** - Resets delivery to PENDING, creates new outbox message  
✅ **Pagination** - Delivery listing supports page/size params  
✅ **Security** - Secrets never returned in API responses  

## Test Replay

```bash
# 1. Create delivery that fails
# (make endpoint return 500)

# 2. Wait for max attempts (7) or DLQ

# 3. Replay delivery
curl -X POST http://localhost:8080/api/v1/deliveries/{delivery_id}/replay

# 4. Verify delivery reset
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT id, status, attempt_count, next_retry_at FROM deliveries WHERE id = '{delivery_id}';"

# Expected: status='PENDING', attempt_count=0, next_retry_at=null

# 5. Check outbox for replay message
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT event_type, status FROM outbox_messages WHERE aggregate_id = '{delivery_id}' ORDER BY created_at DESC LIMIT 2;"

# Should see both 'DeliveryCreated' and 'DeliveryReplayed'
```

## Notes

- Management API currently has no authentication (permitAll)
- In production, add proper auth (API keys, OAuth, etc.)
- Secrets are stored encrypted and never returned in responses
- Soft deletes preserve referential integrity
- Replay is idempotent - can replay multiple times
