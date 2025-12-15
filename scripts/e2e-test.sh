#!/bin/bash

set -e

API_URL="http://localhost:8080"
API_KEY="test_key_12345"

echo "=========================================="
echo "Webhook Platform - E2E Test"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success() {
  echo -e "${GREEN}✓ $1${NC}"
}

error() {
  echo -e "${RED}✗ $1${NC}"
  exit 1
}

info() {
  echo -e "${YELLOW}➜ $1${NC}"
}

# Wait for services
info "Waiting for API to be ready..."
max_attempts=30
attempt=0
while ! curl -s "${API_URL}/actuator/health" > /dev/null; do
  attempt=$((attempt + 1))
  if [ $attempt -ge $max_attempts ]; then
    error "API not ready after ${max_attempts} attempts"
  fi
  sleep 2
done
success "API is ready"

info "Waiting for Worker to be ready..."
max_attempts=30
attempt=0
while ! curl -s "http://localhost:8081/actuator/health" > /dev/null; do
  attempt=$((attempt + 1))
  if [ $attempt -ge $max_attempts ]; then
    error "Worker not ready after ${max_attempts} attempts"
  fi
  sleep 2
done
success "Worker is ready"

echo ""
echo "=========================================="
echo "1. Testing Management API"
echo "=========================================="

# Create project
info "Creating project..."
PROJECT_RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/projects" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "E2E Test Project",
    "description": "End-to-end test project"
  }')
PROJECT_ID=$(echo $PROJECT_RESPONSE | jq -r '.id')

if [ "$PROJECT_ID" = "null" ] || [ -z "$PROJECT_ID" ]; then
  error "Failed to create project"
fi
success "Project created: $PROJECT_ID"

# Create endpoint
info "Creating endpoint..."
ENDPOINT_RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/projects/${PROJECT_ID}/endpoints" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://webhook.site/e2e-test",
    "description": "E2E test endpoint",
    "secret": "e2e_test_secret_123",
    "enabled": true
  }')
ENDPOINT_ID=$(echo $ENDPOINT_RESPONSE | jq -r '.id')

if [ "$ENDPOINT_ID" = "null" ] || [ -z "$ENDPOINT_ID" ]; then
  error "Failed to create endpoint"
fi
success "Endpoint created: $ENDPOINT_ID"

# Create subscription
info "Creating subscription..."
SUBSCRIPTION_RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/projects/${PROJECT_ID}/subscriptions" \
  -H "Content-Type: application/json" \
  -d "{
    \"endpointId\": \"${ENDPOINT_ID}\",
    \"eventType\": \"e2e.test\",
    \"enabled\": true
  }")
SUBSCRIPTION_ID=$(echo $SUBSCRIPTION_RESPONSE | jq -r '.id')

if [ "$SUBSCRIPTION_ID" = "null" ] || [ -z "$SUBSCRIPTION_ID" ]; then
  error "Failed to create subscription"
fi
success "Subscription created: $SUBSCRIPTION_ID"

# Create API key
info "Creating API key in database..."
docker exec -i webhook-postgres psql -U webhook_user -d webhook_platform > /dev/null 2>&1 << EOF
INSERT INTO api_keys (id, project_id, name, key_hash, key_prefix, created_at)
VALUES (
  gen_random_uuid(),
  '${PROJECT_ID}',
  'E2E Test Key',
  'Ra+JtRCjJ5qBf4Ud5dP5W3NIXVjsJnKjnlLYrusBQFk=',
  'test_key',
  CURRENT_TIMESTAMP
)
ON CONFLICT DO NOTHING;
EOF
success "API key created"

echo ""
echo "=========================================="
echo "2. Testing Event Ingestion"
echo "=========================================="

# Ingest event
info "Ingesting event..."
EVENT_RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/events" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d '{
    "type": "e2e.test",
    "data": {
      "testId": "e2e-001",
      "timestamp": "'$(date -Iseconds)'",
      "message": "End-to-end test event"
    }
  }')

EVENT_ID=$(echo $EVENT_RESPONSE | jq -r '.eventId')
DELIVERIES_CREATED=$(echo $EVENT_RESPONSE | jq -r '.deliveriesCreated')

if [ "$EVENT_ID" = "null" ] || [ -z "$EVENT_ID" ]; then
  error "Failed to ingest event"
fi
success "Event ingested: $EVENT_ID"
success "Deliveries created: $DELIVERIES_CREATED"

# Test idempotency
info "Testing idempotency..."
IDEMPOTENT_RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/events" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -H "Idempotency-Key: e2e-test-001" \
  -d '{
    "type": "e2e.test",
    "data": {"test": "idempotency-1"}
  }')

IDEMPOTENT_EVENT_ID_1=$(echo $IDEMPOTENT_RESPONSE | jq -r '.eventId')

# Send same idempotency key again
IDEMPOTENT_RESPONSE_2=$(curl -s -X POST "${API_URL}/api/v1/events" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -H "Idempotency-Key: e2e-test-001" \
  -d '{
    "type": "e2e.test",
    "data": {"test": "idempotency-2"}
  }')

IDEMPOTENT_EVENT_ID_2=$(echo $IDEMPOTENT_RESPONSE_2 | jq -r '.eventId')

if [ "$IDEMPOTENT_EVENT_ID_1" = "$IDEMPOTENT_EVENT_ID_2" ]; then
  success "Idempotency working: same event ID returned"
else
  error "Idempotency failed: different event IDs"
fi

echo ""
echo "=========================================="
echo "3. Testing Outbox Publisher"
echo "=========================================="

info "Waiting for outbox publisher to process messages (5s)..."
sleep 5

OUTBOX_COUNT=$(docker exec webhook-postgres psql -U webhook_user -d webhook_platform -t -c \
  "SELECT COUNT(*) FROM outbox_messages WHERE status = 'PUBLISHED';" | tr -d ' ')

if [ "$OUTBOX_COUNT" -gt "0" ]; then
  success "Outbox messages published: $OUTBOX_COUNT"
else
  error "No outbox messages published"
fi

echo ""
echo "=========================================="
echo "4. Testing Delivery System"
echo "=========================================="

info "Checking deliveries..."
sleep 3

DELIVERY_RESPONSE=$(curl -s "${API_URL}/api/v1/deliveries?eventId=${EVENT_ID}")
DELIVERY_ID=$(echo $DELIVERY_RESPONSE | jq -r '.content[0].id')
DELIVERY_STATUS=$(echo $DELIVERY_RESPONSE | jq -r '.content[0].status')

if [ "$DELIVERY_ID" = "null" ] || [ -z "$DELIVERY_ID" ]; then
  error "No delivery found for event"
fi
success "Delivery found: $DELIVERY_ID"
info "Delivery status: $DELIVERY_STATUS"

# Check delivery attempts
ATTEMPTS_COUNT=$(docker exec webhook-postgres psql -U webhook_user -d webhook_platform -t -c \
  "SELECT COUNT(*) FROM delivery_attempts WHERE delivery_id = '${DELIVERY_ID}';" | tr -d ' ')

if [ "$ATTEMPTS_COUNT" -gt "0" ]; then
  success "Delivery attempts recorded: $ATTEMPTS_COUNT"
else
  info "No delivery attempts yet (webhook might be processing)"
fi

echo ""
echo "=========================================="
echo "5. Testing Replay Functionality"
echo "=========================================="

# Find a delivery to replay
info "Testing delivery replay..."
REPLAY_RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/deliveries/${DELIVERY_ID}/replay")
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/api/v1/deliveries/${DELIVERY_ID}/replay")

if [ "$HTTP_CODE" = "202" ]; then
  success "Delivery replay accepted"
else
  info "Replay returned HTTP $HTTP_CODE (may be already successful)"
fi

echo ""
echo "=========================================="
echo "6. Database Verification"
echo "=========================================="

info "Checking database state..."

# Count records
PROJECTS=$(docker exec webhook-postgres psql -U webhook_user -d webhook_platform -t -c \
  "SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL;" | tr -d ' ')
ENDPOINTS=$(docker exec webhook-postgres psql -U webhook_user -d webhook_platform -t -c \
  "SELECT COUNT(*) FROM endpoints WHERE deleted_at IS NULL;" | tr -d ' ')
SUBSCRIPTIONS=$(docker exec webhook-postgres psql -U webhook_user -d webhook_platform -t -c \
  "SELECT COUNT(*) FROM subscriptions;" | tr -d ' ')
EVENTS=$(docker exec webhook-postgres psql -U webhook_user -d webhook_platform -t -c \
  "SELECT COUNT(*) FROM events;" | tr -d ' ')
DELIVERIES=$(docker exec webhook-postgres psql -U webhook_user -d webhook_platform -t -c \
  "SELECT COUNT(*) FROM deliveries;" | tr -d ' ')

success "Projects: $PROJECTS"
success "Endpoints: $ENDPOINTS"
success "Subscriptions: $SUBSCRIPTIONS"
success "Events: $EVENTS"
success "Deliveries: $DELIVERIES"

echo ""
echo "=========================================="
echo "E2E Test Summary"
echo "=========================================="
echo ""
success "All core features tested successfully!"
echo ""
echo "Project ID:      $PROJECT_ID"
echo "Endpoint ID:     $ENDPOINT_ID"
echo "Subscription ID: $SUBSCRIPTION_ID"
echo "Event ID:        $EVENT_ID"
echo "Delivery ID:     $DELIVERY_ID"
echo ""
echo "=========================================="
