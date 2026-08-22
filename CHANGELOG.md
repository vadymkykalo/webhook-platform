# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.3.0] - 2026-08-22

### Added
- `deliveries.claim_token` (V055): a fencing token stamped by whichever claim
  moves a delivery to PROCESSING. `markAsSuccess` / `scheduleRetry` /
  `markAsFailed` now write only while the row's token still matches the one
  their attempt was claimed under. Guarding on `status = PROCESSING` alone
  could not tell an attempt's own claim from a newer one: after
  `StuckDeliveryRecoveryService` released a claim and the ladder reclaimed the
  row, the abandoned attempt's late response finalized a delivery it no longer
  owned, and the reclaimed attempt never reached the endpoint at all.
- `ORDERING_BUFFER_RESCHEDULE_DELAY_SECONDS`: the fallback poll interval for a
  delivery parked behind an outstanding sequence, previously hardcoded at 5s.
- `OpenApiOperationIdTest`: fails the build on any controller method that would
  be handed a scan-order-dependent operationId.
- `scripts/check-openapi-drift.py`: semantic (parsed) comparison of the
  committed openapi.yaml against the live spec.
- GitFlow branching strategy with `develop` branch
- CONTRIBUTING.md with development guidelines
- Issue and PR templates
- SECURITY.md policy

### Changed
- OWASP Dependency-Check moved out of CI into `.github/workflows/security-sca.yml`,
  now nightly plus `release/*` and `hotfix/*`, with a 75-minute timeout and its
  NVD cache saved even when the scan fails. It had been costing 60-104 minutes
  per run whenever the cache was cold — which a failed scan guaranteed for the
  next run, since `actions/cache` skips its save step on failure. Pull requests
  keep dependency-CVE coverage through the Trivy image scan.
- `RetryGovernor` poll-interval recommendations are now multiples of the
  configured interval instead of hardcoded constants, so
  `RETRY_SCHEDULER_POLL_INTERVAL_MS` finally takes effect. The multipliers
  reproduce the previous 30s/10s/5s/2s exactly at the 10s default.
- OpenAPI operationIds are deterministic: `OperationIdNamingConfig` replaces
  springdoc's positional `_1`/`_2` disambiguation, and 43 cross-controller
  collisions carry explicit, descriptive ids. The spec is now byte-identical
  across restarts.
- **Spring Boot upgraded 3.2.0 → 3.5.16** (the 3.2.x line went OSS-EOL in
  2024; 3.5.16 was the final OSS release of the 3.5.x line before it too
  went EOL 2026-06-30 - see `docs`/the P1-19 task record for why this stops
  short of the current Spring Boot 4.x line). Along with it: jjwt 0.12.3 →
  0.13.0, redisson-spring-boot-starter 3.24.3 → 3.52.0, ShedLock 5.10.0 →
  5.16.0, springdoc-openapi 2.3.0 → 2.9.0, stripe-java 28.2.0 → 28.4.0,
  maven-surefire-plugin 2.22.2 → 3.5.6 (required - the old version silently
  discovered zero tests under Boot 3.5.16's newer JUnit Jupiter).
- UI build image `node:18-alpine` (EOL April 2025) → `node:22-alpine`;
  runtime image `nginx:1.25-alpine` → `nginx:1.30-alpine`. Vite 5 → 7,
  Vitest 1 → 3.
- Helm chart (`deploy/helm/hookflow`): removed the Bitnami
  postgresql/redis/kafka subchart dependencies (Bitnami restricted its free
  catalog in August 2025 and dropped Kafka from it entirely). The chart now
  requires bring-your-own PostgreSQL/Kafka/Redis via each service's
  `external.*` values - see the Helm README.

### Fixed
- `RetrySchedulerService` no longer writes back rows whose Kafka send succeeded.
  A successful send hands the row to the consumer, which often advanced it
  within milliseconds; re-saving the Phase 1 snapshot raced that update, and
  when the consumer lost the optimistic-lock race `BoundedAsyncExecutor` did not
  ack — **stalling the entire retry partition until a restart or rebalance**.
- The ordering buffer tolerates a concurrent update while parking a delivery
  instead of failing the consumer task (same partition-stall blast radius).
- Integration tests with proper `@MockBean` for Redis services
- `GlobalExceptionHandler` now properly handles `ResponseStatusException`
- Test assertions in `MembershipRbacTest` and `AuthIntegrationTest`

## [2.2.1] - 2026-03-18

### Fixed
- Small worker-side fix following the CLI module release (`8aba8fa`).

## [2.2.0] - 2026-03-16

A large release spanning several new subsystems, folded into one changelog
entry because the underlying commit history (`add feature` / `add cli
module` / `fix`, ~160 commits) doesn't distinguish them individually. The
Flyway migrations added in this range (`V028`–`V042`) are the most reliable
record of what shipped:

### Added
- **Rules engine** for conditional event routing (`V028_rules_engine`,
  `V029_rules_condition_tree`)
- **Workflow engine**: multi-step workflows with reliability/retry tracking
  (`V030_workflows`, `V031_workflow_reliability`)
- **Billing**: plans, subscriptions, and yearly-interval pricing
  (`V036_billing_plans`, `V037_billing_subscriptions`,
  `V038_billing_yearly_interval`)
- **CLI** (`webhook-platform-cli`) as a standalone Picocli module, published
  via a new `release-cli.yml` workflow
- **Tunnel**: `CLI ↔ /ws/tunnel` local-development tunneling, with session
  tracking, request logging, and plan-based limits (`V040_tunnel_sessions`,
  `V041_tunnel_request_log`, `V042_tunnel_plan_limits`)
- Multi-key encryption support for zero-downtime key rotation
  (`WEBHOOK_ENCRYPTION_KEYS`, `WEBHOOK_ENCRYPTION_KEY_ACTIVE_VERSION`,
  `V039_encryption_key_versioning`) — additive and optional; existing
  single-key deployments are unaffected
- Dashboard materialized view for faster analytics queries
  (`V033_dashboard_materialized_view`)
- Event payload compression (`V032_event_payload_compression`)
- API key scopes (`V025_api_key_scope`)
- PII masking and debug links for delivery inspection
  (`V012_pii_masking_and_debug_links`)
- Replay sessions for re-driving past deliveries (`V013_replay_sessions`,
  `V018_replay_unique_constraint`)

### Changed
- Invite tokens are now hashed at rest rather than stored in plaintext
  (`V034_hash_invite_tokens`)
- Several indexing passes for delivery-dashboard and high-load query paths
  (`V015`, `V019`, `V022`, `V035`)

## [2.1.0] - 2026-03-02

### Added
- Wildcard subscriptions (route by event-type pattern, not just exact match)
- Event schema registry (`V010_schema_registry`)
- Deterministic replay support (`V011_deterministic_replay`)

## [2.0.0] - 2026-03-01

**Major release — breaking changes. See [UPGRADING.md](UPGRADING.md) before
upgrading an existing v1.x deployment.**

### Security
- **Encryption key derivation replaced.** Secrets (endpoint signing
  secrets, source secrets, destination auth) were previously encrypted with
  a key derived by truncating a SHA-256 digest of `WEBHOOK_ENCRYPTION_KEY`
  to 16 bytes (effectively AES-128). This is now `PBKDF2WithHmacSHA256`
  (65,536 iterations) over `WEBHOOK_ENCRYPTION_KEY` + a new required
  `WEBHOOK_ENCRYPTION_SALT`, producing a real 256-bit AES key
  (`CryptoUtils.deriveKey`). **Ciphertext encrypted under v1.x cannot be
  decrypted by v2.x** — see UPGRADING.md.
- Request/payload size limits enforced via a new `RequestSizeLimitFilter`
  (`WEBHOOK_MAX_PAYLOAD_SIZE_BYTES`, `WEBHOOK_INCOMING_MAX_PAYLOAD_SIZE_BYTES`)
- Auth rate limiting on login/register, independent of the general API rate
  limiter (`AUTH_RATE_LIMIT_LOGIN_PER_MINUTE`, `AUTH_RATE_LIMIT_REGISTER_PER_MINUTE`)
- Refresh-token handling hardened; typed exceptions replace generic ones in
  several security-sensitive paths
- Redis now requires authentication (`REDIS_PASSWORD`, defaulted in
  `docker-compose.yml` but must be set explicitly in production)
- Kafka, Redis, and API ports are no longer published on all interfaces by
  default — Kafka/Redis bind to `127.0.0.1`, and the API respects a new
  `API_BIND` variable (default `127.0.0.1`, was implicitly `0.0.0.0`)
- Membership invite tokens now expire and are tracked server-side
  (`V008_membership_invite_tokens`)
- Outbox publisher tracks `last_attempt_at` to prevent silently stuck
  messages from being re-picked forever (`V009_outbox_last_attempt_at`)
- Webhook signature verification enforcement tightened in
  `WebhookVerifierFactory`
- `ProductionSafetyValidator` added — fails startup on unsafe production
  config (default secrets, `WEBHOOK_ALLOW_PRIVATE_IPS=true` in prod, etc.)

### Added
- Incoming webhooks (ingress) pipeline: source/destination management,
  request forwarding, retry scheduling
  (`V005_incoming_webhooks`, `V006_incoming_webhooks_highload`,
  `V007_incoming_webhooks_enhancements`)
- Redis-distributed rate limiting and reactive delivery path; Kafka topics
  moved to 12 partitions for higher throughput
- DLQ management, payload transformation, custom headers, and IP allowlist
  for outgoing endpoints
- OpenAPI docs, request DTO validation, rate-limit response headers, and a
  delivery circuit breaker
- mTLS support for outbound webhook delivery
- Endpoint ownership verification flow
- PHP SDK (`sdks/php`), alongside the existing Node and Python SDKs
- Email service for verification and password-reset mail
  (`V003_email_verification`, `V004_password_reset`), with `EMAIL_ENABLED`,
  `SMTP_*` env vars (SMTP disabled by default — verification links are
  logged to console)
- Audit log (`V002_audit_log`)
- UI internationalization: English and Ukrainian locales
- Resource limits, log rotation, and healthcheck tuning across all
  `docker-compose.yml` services

### Changed
- **Schema history replaced.** All pre-2.0 Flyway migrations
  (`V001`–`V025` under the old numbering) were consolidated into a new
  `V001__initial_schema.sql`…`V009__outbox_last_attempt_at.sql` set. This is
  a fresh baseline, not a continuation — see UPGRADING.md for what this
  means for an existing v1.x database.
- `docker-compose.yml` no longer sets explicit `container_name` on the
  `api`/`worker`/`ui` services; the default `TEST_ENDPOINT_BASE_URL`
  changed from `http://webhook-api:8080` to `http://api:8080` to match
  (Docker Compose's built-in service-name DNS, not the removed container
  name)
- Vendored PHP SDK dependencies (`sdks/php/vendor/`) removed from version
  control — run `composer install` locally instead

## [1.1.0] - 2026-02-16

*Tagging anomaly: this tag is an ancestor of `v1.0.1`–`v1.0.3` below — those
three patch releases were cut from the `1.1.0` line but kept the `1.0.x`
numbering rather than `1.1.x`. Listed here in the chronological order the
releases actually happened, not strict numeric order.*

### Added
- DLQ management, payload transformation, custom headers, and IP allowlist
  for outgoing endpoints
- OpenAPI documentation, request DTO validation, rate-limit response
  headers, delivery circuit breaker
- PHP client SDK
- Redis-distributed rate limiting, reactive delivery path, 12 Kafka
  partitions for higher throughput (`feat(highload)`)
- JVM tuning for the API/worker containers

### Fixed
- CI: Testcontainers/Docker compatibility fixes for integration tests
  (Docker API version pinning, container pre-pull, socket permissions)
- Various integration-test stability fixes (Redis/Kafka mocking, ordering
  fields, `ResponseStatusException` handling)

## [1.0.1] - 2026-02-18

- First publish of the Node.js, Python, and PHP SDKs to npm/PyPI/Packagist,
  with a dedicated CI workflow (`publish-sdks.yml`)

## [1.0.2] - 2026-02-18

- Fixed PHPUnit configuration in the PHP SDK's CI job

## [1.0.3] - 2026-02-18

- Fixed PHP SDK CI (`--no-coverage` flag) and corrected author metadata in
  package manifests

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

[Unreleased]: https://github.com/vadymkykalo/webhook-platform/compare/v2.2.1...HEAD
[2.2.1]: https://github.com/vadymkykalo/webhook-platform/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/vadymkykalo/webhook-platform/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/vadymkykalo/webhook-platform/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/vadymkykalo/webhook-platform/compare/v1.0.3...v2.0.0
[1.1.0]: https://github.com/vadymkykalo/webhook-platform/compare/v1.0.0...v1.1.0
[1.0.1]: https://github.com/vadymkykalo/webhook-platform/compare/v1.1.0...v1.0.1
[1.0.2]: https://github.com/vadymkykalo/webhook-platform/compare/v1.0.1...v1.0.2
[1.0.3]: https://github.com/vadymkykalo/webhook-platform/compare/v1.0.2...v1.0.3
[1.0.0]: https://github.com/vadymkykalo/webhook-platform/releases/tag/v1.0.0
