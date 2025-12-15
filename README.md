# Webhook & Event Delivery Platform

Event delivery platform with Kafka-based retry mechanism and webhook delivery.

## Tech Stack

- Java 17
- Spring Boot 3.2
- Maven (multi-module)
- PostgreSQL 16
- Apache Kafka 3.7 (KRaft)
- MinIO
- Docker Compose

## Project Structure

```
webhook-platform/
├── webhook-platform-common/    # Shared DTOs, constants, utilities
├── webhook-platform-api/       # REST API (event ingestion, management)
└── webhook-platform-worker/    # Kafka consumer (webhook delivery)
```

## Quick Start

### Build

```bash
mvn -q -DskipTests package
```

### Run

```bash
docker compose up -d
```

### Health Check

```bash
# API
curl http://localhost:8080/actuator/health

# Worker
curl http://localhost:8081/actuator/health
```

## Services

- **API**: http://localhost:8080
- **Worker Management**: http://localhost:8081
- **PostgreSQL**: localhost:5432
- **Kafka**: localhost:9092
- **MinIO Console**: http://localhost:9001

## Kafka Topics

- `deliveries.dispatch`
- `deliveries.retry.1m`
- `deliveries.retry.5m`
- `deliveries.retry.15m`
- `deliveries.retry.1h`
- `deliveries.retry.6h`
- `deliveries.retry.24h`
- `deliveries.dlq`
