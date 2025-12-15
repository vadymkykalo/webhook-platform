# Webhook & Event Delivery Platform

Production-ready webhook delivery system with Kafka-based retry mechanism, transactional outbox pattern, HMAC signatures, and comprehensive management API.

## Features

✅ **Reliable Event Delivery** - At-least-once delivery with transactional outbox  
✅ **Smart Retry Logic** - Exponential backoff (1m → 24h) with 7 retry attempts  
✅ **HMAC Signatures** - SHA-256 webhook security with timestamp validation  
✅ **Idempotency** - Duplicate event prevention via `Idempotency-Key` header  
✅ **Fan-out** - Multiple webhooks per event with subscription management  
✅ **Dead Letter Queue** - Failed deliveries captured for manual replay  
✅ **Management API** - Full CRUD for projects, endpoints, subscriptions, deliveries  
✅ **Secret Encryption** - AES-GCM encryption for webhook secrets  
✅ **Audit Trail** - Complete delivery attempt history  
✅ **Ordering Guarantee** - Per-endpoint message ordering via Kafka partitioning  

## Tech Stack

- **Java 17** - Modern JVM features
- **Spring Boot 3.2** - Production-grade framework
- **PostgreSQL 16** - Source of truth with JSONB support
- **Apache Kafka 3.7** - Message bus with KRaft mode
- **Maven** - Multi-module project structure
- **Docker Compose** - Local development environment
- **WebClient** - Non-blocking HTTP for webhook delivery
- **Flyway** - Database migrations

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Producer  │────────▶│   API (8080) │────────▶│  PostgreSQL │
└─────────────┘  REST   └──────────────┘  Write  └─────────────┘
                              │                          │
                              │ Outbox Publisher         │
                              ▼                          │
                         ┌─────────┐                     │
                         │  Kafka  │                     │
                         │ Topics  │                     │
                         └─────────┘                     │
                              │                          │
                              ▼                          │
                    ┌──────────────────┐                 │
                    │  Worker (8081)   │────────────────┘
                    │  - Dispatch      │      Read
                    │  - Retry (6)     │
                    │  - DLQ           │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Webhook Targets │
                    └──────────────────┘
```

## Project Structure

```
webhook-platform/
├── webhook-platform-common/      # Shared utilities, DTOs, constants
│   ├── util/
│   │   ├── CryptoUtils.java      # AES-GCM encryption, API key hashing
│   │   └── WebhookSignatureUtils.java  # HMAC signature generation
│   └── dto/
│       └── DeliveryMessage.java  # Kafka message format
│
├── webhook-platform-api/         # REST API + Outbox Publisher
│   ├── controller/               # REST endpoints
│   ├── service/                  # Business logic
│   ├── security/                 # API key authentication
│   ├── domain/                   # JPA entities + repositories
│   └── resources/
│       └── db/migration/         # Flyway SQL scripts
│
├── webhook-platform-worker/      # Kafka Consumer + HTTP Delivery
│   ├── consumer/                 # Kafka listeners
│   ├── service/
│   │   ├── WebhookDeliveryService.java  # HTTP POST with signatures
│   │   └── RetrySchedulerService.java   # Retry polling
│   └── domain/                   # JPA entities + repositories
│
└── scripts/
    ├── setup.sh                  # One-command setup
    ├── e2e-test.sh              # End-to-end test suite
    └── create-kafka-topics.sh   # Kafka topic creation
```

## Quick Start

### Automated Setup

```bash
# Build, start services, create topics
bash scripts/setup.sh

# Run end-to-end test
bash scripts/e2e-test.sh
```

### Manual Setup

```bash
# 1. Build
mvn clean package -DskipTests

# 2. Start services
docker compose up -d

# 3. Wait for services (~30s)
sleep 30

# 4. Create Kafka topics
bash scripts/create-kafka-topics.sh

# 5. Health checks
curl http://localhost:8080/actuator/health
curl http://localhost:8081/actuator/health
```

## Usage

### 1. Create Project & Endpoint

```bash
# Create project
PROJECT_ID=$(curl -s -X POST http://localhost:8080/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"My Project","description":"Production webhooks"}' | jq -r '.id')

# Create webhook endpoint
ENDPOINT_ID=$(curl -s -X POST http://localhost:8080/api/v1/projects/$PROJECT_ID/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://your-webhook-url.com/webhook",
    "secret":"your_webhook_secret_key",
    "enabled":true
  }' | jq -r '.id')

# Create subscription
curl -X POST http://localhost:8080/api/v1/projects/$PROJECT_ID/subscriptions \
  -H "Content-Type: application/json" \
  -d "{
    \"endpointId\":\"$ENDPOINT_ID\",
    \"eventType\":\"user.created\",
    \"enabled\":true
  }"
```

### 2. Generate API Key

```bash
# Insert API key into database (hash of "your_api_key")
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform << EOF
INSERT INTO api_keys (id, project_id, name, key_hash, key_prefix, created_at)
VALUES (
  gen_random_uuid(),
  '$PROJECT_ID',
  'Production Key',
  encode(digest('your_api_key', 'sha256'), 'base64'),
  'your_api',
  CURRENT_TIMESTAMP
);
EOF
```

### 3. Send Events

```bash
# Send event
curl -X POST http://localhost:8080/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{
    "type": "user.created",
    "data": {
      "userId": "user123",
      "email": "user@example.com",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  }'

# With idempotency
curl -X POST http://localhost:8080/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -H "Idempotency-Key: unique-request-id" \
  -d '{"type":"order.completed","data":{"orderId":"order456"}}'
```

### 4. Query Deliveries

```bash
# List deliveries
curl "http://localhost:8080/api/v1/deliveries?page=0&size=20"

# Get delivery details
curl http://localhost:8080/api/v1/deliveries/{delivery_id}

# Replay failed delivery
curl -X POST http://localhost:8080/api/v1/deliveries/{delivery_id}/replay
```

## Webhook Payload

Your webhook endpoint receives:

**Headers:**
```
X-Signature: t=1702654321000,v1=abc123def456...
X-Event-Id: uuid-of-event
X-Delivery-Id: uuid-of-delivery
X-Timestamp: 1702654321000
Content-Type: application/json
```

**Body:** Original event data (JSON)

**Signature Verification:**
```java
String signature = HMAC_SHA256(secret, timestamp + "." + body);
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| API | 8080 | REST API, event ingestion, management |
| Worker | 8081 | Management/health only |
| PostgreSQL | 5432 | Database |
| Kafka | 9092 | Message broker |
| MinIO | 9000/9001 | Object storage (future use) |

## Kafka Topics

| Topic | Purpose | Delay |
|-------|---------|-------|
| `deliveries.dispatch` | Initial delivery | Immediate |
| `deliveries.retry.1m` | First retry | 1 minute |
| `deliveries.retry.5m` | Second retry | 5 minutes |
| `deliveries.retry.15m` | Third retry | 15 minutes |
| `deliveries.retry.1h` | Fourth retry | 1 hour |
| `deliveries.retry.6h` | Fifth retry | 6 hours |
| `deliveries.retry.24h` | Sixth retry | 24 hours |
| `deliveries.dlq` | Dead letter queue | Manual replay |

## Configuration

### Environment Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=webhook_platform
DB_USER=webhook_user
DB_PASSWORD=webhook_pass

# Kafka
KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# Security
WEBHOOK_ENCRYPTION_KEY=your-32-char-master-key-here

# Ports
SERVER_PORT=8080
MANAGEMENT_PORT=8081
```

### Application Properties

```yaml
# API (application.yml)
outbox:
  publisher:
    poll-interval-ms: 1000

# Worker (application.yml)
retry:
  scheduler:
    poll-interval-ms: 10000
```

## Monitoring

### Health Endpoints

```bash
# Liveness
curl http://localhost:8080/actuator/health/liveness
curl http://localhost:8081/actuator/health/liveness

# Readiness
curl http://localhost:8080/actuator/health/readiness
curl http://localhost:8081/actuator/health/readiness

# Metrics (Prometheus)
curl http://localhost:8080/actuator/metrics
curl http://localhost:8081/actuator/metrics
```

### Database Queries

```bash
# Delivery statistics
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT status, COUNT(*) FROM deliveries GROUP BY status;"

# Recent attempts
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT http_status_code, COUNT(*) FROM delivery_attempts GROUP BY http_status_code;"

# Outbox lag
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform \
  -c "SELECT status, COUNT(*) FROM outbox_messages GROUP BY status;"
```

## Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Detailed system design
- **[TEST_ITERATION_2.md](TEST_ITERATION_2.md)** - Auth & ingestion tests
- **[TEST_ITERATION_3.md](TEST_ITERATION_3.md)** - Outbox publisher tests
- **[TEST_ITERATION_4.md](TEST_ITERATION_4.md)** - Worker & retry tests
- **[TEST_ITERATION_5.md](TEST_ITERATION_5.md)** - Management API tests

## Development

```bash
# Run tests
mvn test

# Build without Docker
mvn clean package -DskipTests

# View logs
docker logs webhook-api -f
docker logs webhook-worker -f

# Database shell
docker exec -it webhook-postgres psql -U webhook_user -d webhook_platform

# Kafka console consumer
docker exec -it webhook-kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic deliveries.dispatch \
  --from-beginning
```

## Production Considerations

- [ ] Replace permitAll() with proper authentication for management API
- [ ] Configure PostgreSQL connection pooling for scale
- [ ] Set up Kafka replication factor > 1
- [ ] Configure proper WEBHOOK_ENCRYPTION_KEY (32+ chars)
- [ ] Enable SSL/TLS for all services
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Implement rate limiting per endpoint
- [ ] Add SSRF protection (IP allowlist/blocklist)
- [ ] Set up regular database backups
- [ ] Configure resource limits in Docker/K8s

## License

MIT
