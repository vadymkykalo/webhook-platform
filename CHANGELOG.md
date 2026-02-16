# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitFlow branching strategy with `develop` branch
- CONTRIBUTING.md with development guidelines
- Issue and PR templates
- SECURITY.md policy

### Fixed
- Integration tests with proper `@MockBean` for Redis services
- `GlobalExceptionHandler` now properly handles `ResponseStatusException`
- Test assertions in `MembershipRbacTest` and `AuthIntegrationTest`

## [1.0.0] - 2025-12-17

### Added
- **Core Platform**
  - Multi-tenant webhook management with organization isolation
  - Event ingestion API with payload validation
  - Subscription management for routing events to endpoints

- **Delivery Engine**
  - Reliable webhook delivery with exponential backoff retry
  - HMAC-SHA256 signature generation for payload verification
  - Configurable retry policies (max attempts, backoff multiplier)
  - Dead letter queue for failed deliveries

- **High Availability**
  - Redis-based distributed rate limiting
  - ShedLock for distributed scheduler coordination
  - Kafka-based event streaming between API and Worker

- **Security**
  - JWT authentication with refresh tokens
  - API key authentication for programmatic access
  - Role-based access control (Owner, Admin, Developer, Viewer)

- **Observability**
  - Real-time delivery dashboard
  - Delivery attempt history and logs
  - Event and subscription analytics

- **Infrastructure**
  - Docker Compose setup for local development
  - Kubernetes-ready with health checks
  - PostgreSQL for persistent storage
  - Redis for caching and rate limiting
  - Kafka for event streaming

### Technical Stack
- Backend: Java 17, Spring Boot 3.x
- Frontend: React 18, TypeScript, Vite, TailwindCSS
- Database: PostgreSQL 15
- Cache: Redis 7
- Message Broker: Apache Kafka

[Unreleased]: https://github.com/vadymkykalo/webhook-platform/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/vadymkykalo/webhook-platform/releases/tag/v1.0.0
