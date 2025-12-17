# Webhook Platform

Distributed webhook delivery system with at-least-once guarantees, multi-tenant isolation, and automated retry handling.

## What it is

This platform handles reliable webhook delivery at scale using the transactional outbox pattern. Events are written to PostgreSQL, published to Kafka, and delivered to configured HTTP endpoints with HMAC signatures and exponential backoff retries.

Built for production use where delivery reliability, tenant isolation, and observability matter. The architecture separates ingestion from delivery to prevent backpressure and enables independent scaling of both concerns.

## Features

- Transactional outbox pattern for guaranteed event publishing
- HMAC-SHA256 webhook signatures with timestamp validation
- Exponential backoff retry strategy (1m to 24h, 7 attempts)
- Single and bulk delivery replay for manual intervention
- Per-project rate limiting using token bucket algorithm
- Organization-based multi-tenant isolation with JWT authentication
- Automated data retention policies for outbox and delivery attempts
- Admin dashboard with delivery statistics and endpoint health metrics
- Idempotent event ingestion via header-based deduplication
- Dead letter queue for exhausted retry deliveries

## Architecture overview

The platform consists of five components that together provide reliable webhook delivery.

**API service** receives HTTP events, writes them transactionally to PostgreSQL alongside delivery records, and runs a scheduled publisher that moves pending messages to Kafka topics.

**Worker service** consumes from Kafka, executes HTTP POST requests to webhook endpoints with HMAC signatures, records attempt details, and publishes failed deliveries to time-delayed retry topics or the dead letter queue.

**Message broker** (Kafka) decouples ingestion from delivery and provides natural time-based retry scheduling through multiple topics with different consumer lag patterns.

**Database** (PostgreSQL) is the source of truth for all state: events, deliveries, attempts, endpoints, subscriptions, and tenant configuration.

**UI** (React) provides management interface for projects, endpoints, subscriptions, and delivery inspection.

```
Client → API → Outbox → Kafka → Worker → Webhook Endpoint
                  ↓        ↓         ↓
              PostgreSQL (events, deliveries, attempts)
```

This architecture prevents event loss during downstream failures. The outbox ensures events reach Kafka before acknowledgment. Kafka persistence ensures delivery attempts survive worker crashes. The retry scheduler in the worker polls the database for deliveries needing retry and republishes them to appropriate time-delayed topics.

## Repository structure

**`/webhook-platform-api`** - Spring Boot REST API. Handles event ingestion with rate limiting and idempotency checks, manages projects/endpoints/subscriptions, provides delivery query and replay operations, runs the outbox publisher scheduler, contains Flyway migrations.

**`/webhook-platform-worker`** - Spring Boot Kafka consumer. Listens to dispatch and retry topics, executes webhook HTTP delivery with signature generation, records delivery attempts with full request/response data, runs retry scheduler that polls database for deliveries needing retry.

**`/webhook-platform-ui`** - React TypeScript application. Dashboard for delivery statistics, project and endpoint management, subscription configuration, delivery history with filtering.

**`/webhook-platform-common`** - Shared Java utilities. Crypto functions for AES-GCM encryption and HMAC signature generation, DTO classes for Kafka messages, common constants.

## How it works

1. **Event ingestion** - Client sends event via REST API with API key authentication. System checks rate limit (100 events/second per project by default), validates idempotency key if provided, writes event to database.

2. **Delivery creation** - Transaction finds all active subscriptions matching event type, creates delivery records in PENDING status for each matching endpoint, writes outbox message in same transaction.

3. **Async processing** - Outbox publisher polls every 1 second for PENDING messages, publishes to `deliveries.dispatch` topic, marks as PUBLISHED in database.

4. **Initial delivery attempt** - Worker consumes message, loads delivery and endpoint data, decrypts webhook secret, generates HMAC signature, executes HTTP POST with 30-second timeout, records attempt with status code and response.

5. **Retry handling** - On 5xx or timeout, worker calculates next retry time using exponential backoff, updates delivery status to RETRY, publishes to time-delayed retry topic (1m, 5m, 15m, 1h, 6h, 24h).

6. **Failure handling** - On 4xx (except 408, 425, 429), marks delivery as FAILED. After 7 total attempts, publishes to DLQ topic and marks delivery as DLQ status.

7. **Manual replay** - Admin can replay individual or bulk deliveries via API, which resets attempt counter and republishes to dispatch topic.

## Quick start

Prerequisites: Docker, Docker Compose, Maven, JDK 17.

```bash
mvn clean package -DskipTests
docker compose up -d
```

Create Kafka topics:

```bash
docker exec -it webhook-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create --topic deliveries.dispatch --partitions 3 --replication-factor 1
docker exec -it webhook-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create --topic deliveries.retry.1m --partitions 3 --replication-factor 1
docker exec -it webhook-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create --topic deliveries.retry.5m --partitions 3 --replication-factor 1
docker exec -it webhook-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create --topic deliveries.retry.15m --partitions 3 --replication-factor 1
docker exec -it webhook-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create --topic deliveries.retry.1h --partitions 3 --replication-factor 1
docker exec -it webhook-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create --topic deliveries.retry.6h --partitions 3 --replication-factor 1
docker exec -it webhook-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create --topic deliveries.retry.24h --partitions 3 --replication-factor 1
docker exec -it webhook-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create --topic deliveries.dlq --partitions 3 --replication-factor 1
```

Access UI at `http://localhost:5173` and register:

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"secure_password","organizationName":"Your Company"}'
```

## Configuration

**`WEBHOOK_ENCRYPTION_KEY`** - AES master key for encrypting webhook secrets in database. Must be set. System will fail to start if missing. Use 32+ characters.

**`KAFKA_BOOTSTRAP_SERVERS`** - Kafka connection string. Defaults to localhost:9092. Worker and API must both reach Kafka or startup will fail after retry exhaustion.

**`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`** - PostgreSQL connection parameters. System validates connection at startup. Flyway migrations run automatically and will fail startup if schema is inconsistent.

**`DATA_RETENTION_OUTBOX_DAYS`** - Days to keep published outbox messages (default 7). Cleanup runs daily at 2 AM via scheduled job.

**`DATA_RETENTION_ATTEMPTS_DAYS`** - Days to keep delivery attempts (default 90). Cleanup runs daily at 2 AM via scheduled job.

**`DATA_RETENTION_MAX_ATTEMPTS_PER_DELIVERY`** - Maximum attempts to retain per delivery (default 10). Keeps most recent N attempts. Cleanup runs every 30 minutes.

If `WEBHOOK_ENCRYPTION_KEY` is missing, system fails at startup. If database is unreachable, system enters readiness probe failure state but continues liveness checks. If Kafka is unavailable, consumers retry indefinitely while health checks report degraded state.

## Operational guarantees & limits

**Delivery semantics** - At-least-once delivery. Duplicate deliveries are possible during network partitions or worker crashes. Consumers should implement idempotency using `X-Delivery-Id` header.

**Retention policy** - Published outbox messages deleted after 7 days. Delivery attempts deleted after 90 days or when exceeding 10 attempts per delivery (keeps most recent). Deliveries and events persist indefinitely.

**Payload limits** - No hard limit enforced at ingestion. Large payloads increase memory usage and HTTP timeout risk. Recommended maximum 1 MB per event.

**Rate limits** - 100 events per second per project by default (configurable). Rate limit enforced at ingestion before database write. Exceeded requests receive 429 status with retry-after header.

**Retry limits** - 7 total delivery attempts over ~31 hours. After exhaustion, delivery moves to DLQ and requires manual replay.

**Timeout** - 30 seconds per HTTP delivery attempt. Non-configurable.

## Security model

**API authentication** - JWT-based authentication for management endpoints. Projects, endpoints, and subscriptions are scoped to organizations. Users belong to organizations via membership table with role-based access control.

**Event ingestion authentication** - API key authentication via `X-API-Key` header. Keys are hashed using SHA-256 and stored without plaintext. Each key is scoped to a single project.

**Webhook signatures** - Each webhook receives HMAC-SHA256 signature in `X-Signature` header formatted as `t=<timestamp>,v1=<hmac>`. HMAC is computed over concatenation of timestamp and request body. Prevents replay attacks via timestamp validation on receiver side.

**Secret storage** - Webhook secrets encrypted using AES-GCM with master key from environment variable. Encryption includes random IV stored alongside ciphertext. Decryption occurs only in worker during delivery.

**Tenant isolation** - All queries filtered by organization ID extracted from JWT. Database constraints prevent cross-tenant data access. Organizations are fully isolated with no shared resources.

## Testing & quality

Integration tests use Testcontainers with PostgreSQL and Kafka containers. Tests cover authentication flows, organization isolation enforcement, outbox publisher behavior, retry scheduler logic, concurrent cleanup operations with ShedLock, and data retention policies.

Test coverage includes:

- JWT authentication with organization context
- Role-based access control enforcement
- Multi-tenant isolation verification (cross-organization access attempts fail)
- Outbox message lifecycle (creation, publishing, cleanup)
- Retry scheduler polling and topic selection
- Data retention cleanup with batch processing
- Distributed lock behavior for scheduled jobs

Tests run against actual PostgreSQL and Kafka, not mocks. This validates schema migrations, Kafka consumer configurations, and transactional behavior. Build fails if any integration test fails.

## Status & roadmap

**Stable components**: Event ingestion, transactional outbox, Kafka-based delivery, retry mechanism, HMAC signatures, multi-tenant isolation, JWT authentication, data retention.

**Evolving components**: UI dashboard (functional but minimal), observability (basic health checks and metrics exposed, no alerting), rate limiting (per-project only, not per-endpoint).

**Explicitly out of scope**: Webhook endpoint verification, payload transformations, custom retry policies per subscription, batch delivery API, OAuth2 for webhook endpoints, geo-distributed deployment patterns.

## Contribution & license

Standard GitHub workflow: fork, branch, test, pull request. Ensure integration tests pass before submitting. Use conventional commit messages.

Requires JDK 17, Maven 3.8+, Docker for integration tests.

Licensed under MIT.
