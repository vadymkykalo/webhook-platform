# Webhook Platform

[![CI](https://github.com/vadymkykalo/webhook-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/vadymkykalo/webhook-platform/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Required-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Java](https://img.shields.io/badge/Java-17-orange)]()
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2-green)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)]()
[![Kafka](https://img.shields.io/badge/Kafka-3.7-231F20)]()
[![Redis](https://img.shields.io/badge/Redis-7-DC382D)]()

**Distributed webhook delivery platform** with at-least-once guarantees, automatic retries, and horizontal scaling.

<div align="center">
  <img src="docs/screenshot.png" alt="Webhook Platform Dashboard" width="800">
</div>

```bash
git clone https://github.com/vadymkykalo/webhook-platform.git && cd webhook-platform && make up
```

**UI**: http://localhost:5173 | **API Docs**: http://localhost:8080/swagger-ui.html

Self-hosted alternative to Svix/Hookdeck. Send events, get reliable delivery with retries, HMAC signatures, and full observability. Production-ready in 5 minutes.

## Requirements

| Dependency | Version | Notes |
|------------|---------|-------|
| **Docker** | 20.10+ | Container runtime |
| **Docker Compose** | v2.0+ (or v1.29+) | Service orchestration |
| **make** | any | Build automation |
| **git** | any | Clone repository |

> **Note**: All other dependencies (Java, PostgreSQL, Kafka, Redis) run inside Docker containers — no local installation needed.

## Architecture

```mermaid
graph TB
    subgraph "Your Infrastructure"
        App[Your Application]
    end
    
    subgraph "Webhook Platform"
        API[API Service<br/>Event Ingestion]
        DB[(PostgreSQL<br/>Events & Deliveries)]
        Redis[(Redis<br/>Rate Limiting)]
        Kafka[Kafka<br/>Message Queue]
        Worker[Worker Service<br/>HTTP Delivery]
        UI[Admin Dashboard<br/>Monitoring & Replay]
    end
    
    subgraph "Customer Infrastructure"
        Customer1[Customer A Endpoint]
        Customer2[Customer B Endpoint]
        Customer3[Customer C Endpoint]
    end
    
    App -->|POST /events| API
    API -->|Rate Limit| Redis
    API -->|Write| DB
    API -->|Publish| Kafka
    Kafka -->|Consume| Worker
    Worker -->|Concurrency| Redis
    Worker -->|Read/Update| DB
    Worker -->|POST with HMAC| Customer1
    Worker -->|POST with HMAC| Customer2
    Worker -->|POST with HMAC| Customer3
    UI -->|Query Stats| DB
    
    style API fill:#4CAF50
    style Worker fill:#2196F3
    style UI fill:#FF9800
    style DB fill:#9C27B0
    style Kafka fill:#F44336
    style Redis fill:#DC382D
```

## How It Works

```mermaid
sequenceDiagram
    participant YourApp as Your Application
    participant API as Webhook Platform
    participant Customer as Customer Endpoint
    
    YourApp->>API: POST /events<br/>(order.completed)
    API-->>YourApp: 202 Accepted
    Note over API: Event saved in database
    
    API->>Customer: POST /webhook<br/>+ HMAC signature
    
    alt Successful Delivery
        Customer-->>API: 200 OK
        Note over API,Customer: Delivery marked SUCCESS
    else Temporary Failure
        Customer-->>API: 503 Service Unavailable
        Note over API: Auto-retry after 1m
        API->>Customer: POST /webhook (retry #2)
        Customer-->>API: 200 OK
        Note over API,Customer: Delivery SUCCESS on retry
    else Permanent Failure
        Customer-->>API: 404 Not Found
        Note over API: Retries: 1m, 5m, 15m, 1h, 6h, 24h
        Note over API: After 7 attempts → Dead Letter Queue
    end
```

**Retry strategy**: 7 attempts over ~31 hours (1m → 5m → 15m → 1h → 6h → 24h), then Dead Letter Queue.

## Features

| Category | Details |
|----------|---------|
| **Delivery** | Transactional outbox, at-least-once semantics, 30s timeout per attempt |
| **Retry** | Exponential backoff (1m to 24h), 7 attempts, DLQ for exhausted deliveries |
| **Security** | HMAC-SHA256 signatures, AES-GCM encrypted secrets, JWT auth, multi-tenant isolation |
| **Scale** | Redis rate limiting (100 req/s default), 12 Kafka partitions, stateless horizontal scaling |
| **Observability** | Prometheus metrics, delivery dashboard, attempt history with full request/response |

## SDKs

| Language | Install | Docs |
|----------|---------|------|
| **Node.js** | `npm install @webhook-platform/node` | [README](./sdks/node/README.md) |
| **Python** | `pip install webhook-platform` | [README](./sdks/python/README.md) |
| **PHP** | `composer require webhook-platform/php` | [README](./sdks/php/README.md) |

## Deployment

```bash
# Development
make up                    # Start all services
make down                  # Stop
make logs                  # View logs

# Production - edit .env first:
# APP_ENV=production
# WEBHOOK_ENCRYPTION_KEY=<32+ chars>
# JWT_SECRET=<32+ chars>
make up
```

Register at http://localhost:5173 or via API. Configuration: [`.env.dist`](./.env.dist)

## Commands

| Command | Description |
|---------|-------------|
| `make up` | Start all services |
| `make down` | Stop services |
| `make logs` | Follow logs |
| `make dev-api` | Rebuild + restart API |
| `make dev-worker` | Rebuild + restart Worker |
| `make dev-ui` | Rebuild + restart UI |
| `make backup-db` | Backup database |
| `make doctor` | Diagnostics |
| `make nuke CONFIRM=YES` | Delete everything |

## Contributing

Fork → branch → test → PR. All builds run in Docker (`make build`).
