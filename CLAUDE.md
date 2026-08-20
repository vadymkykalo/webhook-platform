# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

`make help` lists every target. Non-obvious bit: `make up` also creates `.env` from `.env.dist` and creates the Kafka topics — don't do either by hand.

For running or writing Java tests, use the `backend-tests` skill — test class names decide which CI job a test lands in.

## Git workflow (GitFlow)

This repo follows GitFlow. Respect it in every change: **never commit or push directly to `main`**, and never open a feature PR against `main`.

| Branch | Cut from | Merges into | Purpose |
|--------|----------|-------------|---------|
| `main` | — | — | Production-ready. Only ever receives `release/*` and `hotfix/*` |
| `develop` | `main` | `release/*` | Integration branch — the default working branch |
| `feature/*` | `develop` | `develop` | New work |
| `release/*` | `develop` | `main` **and** back into `develop` | Release preparation, version bumps |
| `hotfix/*` | `main` | `main` **and** back into `develop` | Production fixes |

Rules that follow from the table and are easy to get wrong:

- Start work from an up-to-date `develop` (`git checkout develop && git pull`), branch as `feature/<short-kebab-description>`.
- Anything merged to `main` must also be merged back into `develop`, or the fix silently disappears at the next release.
- A hotfix branches from `main`, not from `develop` — branching it from `develop` drags unreleased work into production.
- PRs need at least one approval and green CI; squash merge is preferred.
- Release: `release/1.x.0` from `develop` → bump versions → PR to `main` → tag `v1.x.0` after merge → merge back to `develop`.

Commit messages use conventional prefixes: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`. See `CONTRIBUTING.md` for the full policy.

## Architecture

Five modules: `common` (shared DTOs, `KafkaTopics`, crypto/signature/PII utils), `api` (REST + ingress + tunnel hub + outbox publisher, **owns all Flyway migrations**), `worker` (Kafka consumers, HTTP delivery/forwarding, retries), `cli` (picocli), `ui`.

API and worker each keep **their own JPA entity + repository copies** of the shared tables (`Event`, `Delivery`, `Endpoint`, `IncomingEvent`, …). Any schema change touches both sides plus a migration — see the `db-migration` skill before editing an entity or `db/migration`.

### Two delivery pipelines

Outgoing (`/api/v1/projects/{id}/events`) and incoming (`/ingress/{token}`) both run through the **same transactional outbox** — nothing is published to Kafka inside a business transaction. `OutboxPublisherService` is a scheduled poller, ShedLock-guarded, with a per-project fairness cap. README.md has the sequence diagrams for both flows.

All topic names live in `KafkaTopics`; adding one also means adding it to the topic-creation step in the `Makefile`.

FIFO ordering is not a Kafka guarantee here: `SequenceGeneratorService` (API) stamps sequence numbers and `OrderingBufferService` (worker) buffers out-of-order deliveries per endpoint in Redis, with `ordering_cursors` in Postgres as the durable fallback.

### Tunnel

CLI ↔ `/ws/tunnel` bridges a public `POST /tunnel/{slug}` to the developer's `localhost:PORT` (README has the diagram). `RedisTunnelCoordinator` exists because a tunnel's WebSocket may be held by a different API instance than the one receiving the request.

### Auth & tenancy

Requests carry either a JWT (dashboard/CLI) or `X-API-Key` (server-to-server); `JwtAuthenticationFilter` / `ApiKeyAuthenticationFilter` both resolve into a single `AuthContext` record, injected into controllers as a plain method parameter via `AuthContextArgumentResolver`. Enforcement layers:

- `AuthContext.requireWriteAccess()` / `requireOwnerAccess()` — RBAC (Owner/Developer/Viewer/API_KEY).
- `@RequireScope(ApiKeyScope…)` — API-key scope, checked by `ScopeEnforcementInterceptor`.
- `@RequireOrgAccess` — `OrgAccessAspect` compares the `{orgId}` path variable against the token's org and throws 403 on mismatch.
- `AuthContext.validateProjectAccess(projectId)` — an API key may only touch its own project.

New tenant-scoped endpoints must go through these; don't hand-roll org checks. Public paths are whitelisted in `SecurityConfig` (`/ingress/**`, `/tunnel/**`, `/hook/**`, `/ws/tunnel`, auth + billing webhooks).

Errors: throw `NotFoundException` / `ForbiddenException` / `ConflictException` / `UnauthorizedException` / `QuotaExceededException` — `GlobalExceptionHandler` maps them to the shared `ErrorResponse`.

Secrets (endpoint signing secrets, source secrets, destination auth) are AES-256-GCM encrypted with versioned keys (`EncryptionKeyRegistry`, `EncryptionKeyRotationService`); never persist them in plaintext.

## Conventions

- Config is env-var-driven: every variable is documented in `.env.dist`, consumed through `docker-compose.yml` into `application.yml`. Add new settings there rather than hardcoding, and keep `ProductionSafetyValidator` / `SecurityConfigValidator` in mind — they fail startup on unsafe production config.
- Runbooks and operational procedures: `docs/OPERATIONS.md`, `docs/runbooks/`.
