# Webhook Platform

[![CI](https://github.com/vadymkykalo/webhook-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/vadymkykalo/webhook-platform/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Required-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Java](https://img.shields.io/badge/Java-17-orange)]()
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2-green)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)]()
[![Kafka](https://img.shields.io/badge/Kafka-3.7-231F20)]()
[![Redis](https://img.shields.io/badge/Redis-7-DC382D)]()

Production-grade webhook delivery infrastructure with **at-least-once guarantees**, FIFO ordering, automatic retries, HMAC signatures, and horizontal scaling. Self-hosted alternative to Svix / Hookdeck.

<div align="center">
  <img src="docs/screenshot.png" alt="Webhook Platform Dashboard" width="800">
</div>

```bash
git clone https://github.com/vadymkykalo/webhook-platform.git
cd webhook-platform
make up
```

**Dashboard** → http://localhost:5173 &nbsp;|&nbsp; **API Docs** → http://localhost:8080/swagger-ui.html

---

## Architecture

```mermaid
graph TB
    subgraph "Your Infrastructure"
        App[Your Application]
    end
    
    subgraph "Webhook Platform"
        UI[Dashboard<br/>React + Vite]
        API[API Service<br/>Spring Boot]
        DB[(PostgreSQL<br/>Events · Deliveries · Outbox)]
        Redis[(Redis<br/>Rate Limits · Ordering Buffer)]
        Kafka[Kafka<br/>Delivery Dispatch · Retry Topics · DLQ]
        Worker[Worker Service<br/>Spring Boot]
    end
    
    subgraph "Customer Endpoints"
        EP1[Endpoint A]
        EP2[Endpoint B]
        EP3[Endpoint C]
    end
    
    App -->|POST /api/v1/events| API
    UI  -->|REST API| API
    API -->|Rate Limit Check| Redis
    API -->|Transactional Write| DB
    API -->|Outbox Publish| Kafka
    Kafka -->|Consume| Worker
    Worker -->|Read/Update| DB
    Worker -->|Ordering Buffer| Redis
    Worker -->|POST + HMAC-SHA256| EP1
    Worker -->|POST + HMAC-SHA256| EP2
    Worker -->|POST + HMAC-SHA256| EP3
    
    style API fill:#4CAF50
    style Worker fill:#2196F3
    style UI fill:#FF9800
    style DB fill:#9C27B0
    style Kafka fill:#F44336
    style Redis fill:#DC382D
```

| Service | Port | Role |
|---------|------|------|
| **API** | 8080 | Event ingestion, REST API, outbox publisher, Flyway migrations |
| **Worker** | 8081 | Kafka consumer, HTTP delivery, retry scheduling, stuck delivery recovery |
| **UI** | 5173 | Admin dashboard (React / Vite / TailwindCSS / shadcn/ui) |
| **PostgreSQL** | 5432 | Persistent storage |
| **Kafka** | 9092 | Message broker (dispatch + 6 retry delay topics + DLQ) |
| **Redis** | 6379 | Rate limiting, FIFO ordering buffer |

---

## Features

- Transactional outbox → Kafka → at-least-once delivery
- FIFO ordering per endpoint (Redis ordering buffer)
- Retries with configurable delays + Dead Letter Queue
- HMAC-SHA256 signatures, AES-GCM secrets, mTLS, endpoint verification
- Multi-tenant: Organizations → Projects → Endpoints → Subscriptions (RBAC)
- Redis rate limiting, Prometheus metrics, built-in Request Bin
- Horizontal scaling: stateless services, 12 Kafka partitions

---

## Quick Start

**Prerequisites:** Docker 20.10+, Docker Compose v2+, make.
Everything else runs inside containers.

```bash
git clone https://github.com/vadymkykalo/webhook-platform.git
cd webhook-platform
make up        # build, start, create Kafka topics, run migrations
```

Open http://localhost:5173, register, create a project + API key, then:

```bash
curl -X POST http://localhost:8080/api/v1/projects/{projectId}/events \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "order.completed", "payload": {"orderId": "12345"}}'
```

---

## Deployment

### Development

```bash
make up          # Start all services
make down        # Stop (data preserved)
make logs        # Follow logs
```

### Production

```bash
cp .env.dist .env   # then edit .env
make up             # or: make up-external-db (for managed DB)
make health         # verify all services are UP
```

All environment variables are documented in [`.env.dist`](./.env.dist).

## Make Commands

Run `make help` for the full list. Key commands:

```bash
make up                   # Start everything from scratch
make down                 # Stop (keeps data)
make nuke CONFIRM=YES     # Destroy everything (containers, volumes, images)
make health               # Check service health
make logs                 # Follow all logs
make dev-api              # Quick rebuild API + tail logs
make backup-db            # Backup database to ./backups/
make doctor               # Pre-flight diagnostics
```

---

## SDKs

| Language | Package | Docs |
|----------|---------|------|
| **Node.js** | `npm install @webhook-platform/node` | [README](./sdks/node/README.md) |
| **Python** | `pip install webhook-platform` | [README](./sdks/python/README.md) |
| **PHP** | `composer require webhook-platform/php` | [README](./sdks/php/README.md) |

All SDKs include signature verification, error handling, and idempotency support.

---

## How Delivery Works

```mermaid
sequenceDiagram
    participant App as Your Application
    participant API as API Service
    participant DB as PostgreSQL
    participant Kafka as Kafka
    participant Worker as Worker
    participant EP as Customer Endpoint
    
    App->>API: POST /events
    API-->>App: 202 Accepted
    API->>DB: INSERT event + deliveries + outbox (single TX)
    
    Note over API: Outbox publisher polls every 100ms
    API->>Kafka: Publish DeliveryMessage
    API->>DB: Mark outbox PUBLISHED
    
    Kafka->>Worker: Consume from deliveries.dispatch
    Worker->>DB: Load delivery + endpoint + secret
    Worker->>EP: POST payload + HMAC-SHA256 signature
    
    alt 2xx Response
        EP-->>Worker: 200 OK
        Worker->>DB: Status = SUCCESS
    else 4xx/5xx / Timeout
        EP-->>Worker: 503 / timeout
        Worker->>Kafka: Publish to deliveries.retry.1m
        Note over Worker: Retry delays: 1m → 5m → 15m → 1h → 6h → 24h
    else All retries exhausted
        Worker->>Kafka: Publish to deliveries.dlq
        Worker->>DB: Status = DLQ
    end
```

---

## Contributing

Fork → branch → test → PR. All CI checks must pass. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © Vadym Kykalo
