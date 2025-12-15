# Architecture

## Overview

Webhook Platform is a reliable event delivery system built on Spring Boot, Kafka, and PostgreSQL.

## Components

### 1. API Service (Port 8080)

**Responsibilities:**
- Event ingestion with idempotency
- Management API (projects, endpoints, subscriptions, deliveries)
- API key authentication
- Transactional outbox pattern
- Scheduled outbox publisher

**Key Features:**
- REST API with Spring Boot
- PostgreSQL for persistence
- Flyway for migrations
- API key auth via SHA-256 hash
- AES-GCM secret encryption
- Transactional outbox for reliable messaging

### 2. Worker Service (Port 8081 - management only)

**Responsibilities:**
- Consume delivery messages from Kafka
- Execute HTTP POST to webhook endpoints
- Generate HMAC signatures
- Record delivery attempts
- Handle retries with exponential backoff
- Move failed deliveries to DLQ

**Key Features:**
- Kafka consumers (dispatch + 6 retry topics + DLQ)
- WebClient for non-blocking HTTP
- Retry scheduler (polls DB every 10s)
- HMAC-SHA256 webhook signatures

## Data Flow

```
1. Event Ingestion
   POST /api/v1/events
   ↓
   [API Key Auth]
   ↓
   [Idempotency Check]
   ↓
   [Save Event]
   ↓
   [Find Subscriptions]
   ↓
   [Create Deliveries + Outbox] (single transaction)

2. Outbox Publishing
   [Outbox Publisher] (every 1s)
   ↓
   [Read Pending Messages]
   ↓
   [Publish to Kafka: deliveries.dispatch]
   ↓
   [Mark as Published]

3. Webhook Delivery
   [Worker Consumer]
   ↓
   [Load Delivery, Endpoint, Event]
   ↓
   [Decrypt Secret]
   ↓
   [Generate HMAC Signature]
   ↓
   [HTTP POST via WebClient]
   ↓
   [Record Attempt]
   ↓
   Decision:
     - 2xx → SUCCESS
     - 5xx/timeout → RETRY (schedule next retry)
     - 4xx (non-retryable) → FAILED
     - Max attempts (7) → DLQ

4. Retry Scheduling
   [Retry Scheduler] (every 10s)
   ↓
   [Find deliveries with next_retry_at < now]
   ↓
   [Publish to appropriate retry topic]
   ↓
   [Worker consumes and retries]

5. Replay
   POST /api/v1/deliveries/{id}/replay
   ↓
   [Reset delivery: status=PENDING, attempts=0]
   ↓
   [Create new outbox message]
   ↓
   [Republish to deliveries.dispatch]
```

## Database Schema

### Core Tables

- **projects** - Multi-tenant projects
- **api_keys** - Hashed API keys for authentication
- **events** - Incoming events with idempotency
- **endpoints** - Webhook URLs with encrypted secrets
- **subscriptions** - Event type → endpoint mappings
- **deliveries** - Delivery state machine
- **delivery_attempts** - Audit log of all attempts
- **outbox_messages** - Transactional outbox for Kafka

### Key Constraints

- `events(project_id, idempotency_key)` - UNIQUE (idempotency)
- `deliveries(event_id, endpoint_id, subscription_id)` - UNIQUE (no duplicates)
- `subscriptions(endpoint_id, event_type)` - UNIQUE (one sub per endpoint+type)

## Kafka Topics

### Dispatch & Retry Topics

- `deliveries.dispatch` - Initial delivery attempts
- `deliveries.retry.1m` - 1 minute retry
- `deliveries.retry.5m` - 5 minutes retry
- `deliveries.retry.15m` - 15 minutes retry
- `deliveries.retry.1h` - 1 hour retry
- `deliveries.retry.6h` - 6 hours retry
- `deliveries.retry.24h` - 24 hours retry
- `deliveries.dlq` - Dead letter queue (max attempts reached)

**Message Key:** `endpointId` (ensures ordering per endpoint)

**Partitions:** 3 (for parallelism)

## Retry Strategy

| Attempt | Delay | Topic |
|---------|-------|-------|
| 1 | immediate | deliveries.dispatch |
| 2 | 1m | deliveries.retry.1m |
| 3 | 5m | deliveries.retry.5m |
| 4 | 15m | deliveries.retry.15m |
| 5 | 1h | deliveries.retry.1h |
| 6 | 6h | deliveries.retry.6h |
| 7 | 24h | deliveries.retry.24h |
| 8+ | DLQ | deliveries.dlq |

## Security

### Authentication

- **Producer Auth:** API key via `X-API-Key` header
- **Storage:** SHA-256 hash only (never store plaintext)
- **Validation:** Compare hash on each request

### Webhook Signatures

```
X-Signature: t=<timestamp_ms>,v1=<hmac_hex>

hmac_hex = HMAC-SHA256(secret, timestamp + "." + body)
```

**Additional Headers:**
- `X-Event-Id` - Event UUID
- `X-Delivery-Id` - Delivery UUID
- `X-Timestamp` - Unix timestamp (ms)

### Secret Encryption

- **Algorithm:** AES-GCM (128-bit)
- **Storage:** Encrypted ciphertext + IV
- **Master Key:** From environment variable
- **Decryption:** On-demand in worker only

## Reliability Guarantees

### At-Least-Once Delivery

- Transactional outbox ensures events are never lost
- Manual Kafka commit after successful processing
- Retry mechanism for transient failures

### Idempotency

- Event ingestion: `Idempotency-Key` header
- Delivery creation: Unique constraint prevents duplicates
- Kafka producer: Idempotence enabled

### Ordering

- Kafka message key = `endpointId`
- All messages to same endpoint processed in order
- Single partition ensures strict ordering per endpoint

### Durability

- PostgreSQL: All state persisted
- Kafka: Replication (configurable)
- Delivery attempts: Full audit trail

## Scalability

### Horizontal Scaling

- **API:** Stateless, scale behind load balancer
- **Worker:** Multiple instances, Kafka consumer groups
- **Kafka:** Add partitions, scale consumers
- **Database:** Connection pooling, read replicas

### Performance

- **Outbox Publisher:** Configurable poll interval (default 1s)
- **Worker Concurrency:** 3 consumers per instance
- **Retry Scheduler:** Configurable poll interval (default 10s)
- **HTTP Timeout:** 30s per webhook request

## Monitoring

### Health Endpoints

- `GET /actuator/health` - Service health
- `GET /actuator/health/liveness` - Liveness probe
- `GET /actuator/health/readiness` - Readiness probe
- `GET /actuator/metrics` - Prometheus metrics

### Key Metrics

- Event ingestion rate
- Delivery success/failure rate
- Retry queue depth
- DLQ message count
- Average delivery latency
- Outbox processing lag

## Configuration

### Environment Variables

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `KAFKA_BOOTSTRAP_SERVERS`
- `WEBHOOK_ENCRYPTION_KEY` (AES master key)
- `SERVER_PORT` (API), `MANAGEMENT_PORT` (Worker)

### Application Properties

- `outbox.publisher.poll-interval-ms` (default: 1000)
- `retry.scheduler.poll-interval-ms` (default: 10000)
- `spring.kafka.consumer.concurrency` (default: 3)

## Deployment

### Docker Compose (Development)

```bash
mvn clean package -DskipTests
docker compose up -d
```

### Kubernetes (Production)

- Separate deployments for API and Worker
- HPA for auto-scaling
- StatefulSet for Kafka
- External PostgreSQL (managed service)

## Future Enhancements

- [ ] Rate limiting per endpoint
- [ ] SSRF protection (IP allowlist/blocklist)
- [ ] OAuth2 authentication for management API
- [ ] Webhook endpoint verification
- [ ] Delivery analytics dashboard
- [ ] Custom retry policies per subscription
- [ ] Batch delivery support
- [ ] Webhook payload transformations
