# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Java 17 + Spring Boot 3.5 (Maven reactor), React + Vite + TypeScript in `webhook-platform-ui`.

`make help` lists every target. Non-obvious bits: `make up` also creates `.env` from `.env.dist` and creates the Kafka topics — don't do either by hand; `make dev-api` / `dev-worker` / `dev-ui` rebuild one service with cache and restart it, which is the fast inner loop once the stack is up.

```bash
mvn clean compile -B                # what CI compiles with
mvn package -DskipTests -B          # build all module jars
make test-ui                        # frontend unit tests (Vitest)
npm run lint && npm run typecheck    # in webhook-platform-ui/, both gate CI
```

For running or writing Java tests, use the `backend-tests` skill — test class names decide which CI job a test lands in, and `scripts/check-test-routing.sh` fails the build when a Docker-dependent test is named so it routes to the no-Docker unit job.

### Two checks that fail CI for reasons that aren't in the diff

- **`openapi.yaml` is committed and semantically diffed** against the spec springdoc serves, by `OpenApiDriftIntegrationTest`. After an intentional API change, regenerate rather than hand-edit:
  `mvn test -pl webhook-platform-api -Dtest=OpenApiDriftIntegrationTest -Dopenapi.regenerate=true`, then review and commit the file.
- **The version lives in seven places** — reactor pom, `deploy/helm/hookflow/Chart.yaml` (version *and* appVersion), `webhook-platform-ui/package.json`, and all three SDK manifests under `sdks/`. Never bump one by hand: `make version-set VERSION=2.4.0`, and `make version-check` runs the same drift check CI does.

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
- PRs need at least one approval and green CI.
- **Merge style depends on the target.** `feature/*` → `develop`: squash, so a
  feature's work-in-progress commits land as one. `release/*` and `hotfix/*` →
  `main`: **a merge commit, never squash or rebase.** Squashing collapses the
  branch into a new SHA with no shared ancestry, so `main` and `develop` stop
  having a common base — the back-merge then conflicts on every file either side
  has touched, including files that are byte-identical. Release 2.3.0 hit exactly
  this: PR #100 was squash-merged, and the next release's merge reported 19
  conflicts of which 12 were between identical files.
- Release: `release/1.x.0` from `develop` → bump versions → PR to `main` → tag `v1.x.0` after merge → merge back to `develop`.

Commit messages use conventional prefixes: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`. See `CONTRIBUTING.md` for the full policy.

## Working notes and decisions

Two places, with different lifetimes — do not conflate them:

- **`docs/adr/`** is tracked and permanent. An ADR records a decision that is load-bearing:
  one a future reader would otherwise re-litigate, because the code shows *what* was built
  and not *why the obvious alternative was rejected*. `docs/adr/README.md` has the index and
  the format. Do not re-open a decision an ADR settles without saying so in the ADR.
- **`.claude/features/`** is gitignored scratch: one file per piece of work that spans
  sessions or needs decisions settled before code. It says what we're doing and where we are;
  the ADR says why. **A feature doc is deleted when its work lands** — whatever is still true
  moves into the ADR first. `.claude/features/README.md` has the flow and `TEMPLATE.md` the
  shape. Being gitignored, those two exist only in a working copy that has them; this
  paragraph is what makes the convention discoverable at all.

## Architecture

Five modules: `common` (shared DTOs, `KafkaTopics`, crypto/signature/PII utils), `api` (REST + ingress + tunnel hub + outbox publisher, **owns all Flyway migrations**), `worker` (Kafka consumers, HTTP delivery/forwarding, retries), `cli` (picocli), `ui`.

API and worker each keep **their own JPA entity + repository copies** of the shared tables (`Event`, `Delivery`, `Endpoint`, `IncomingEvent`, …). Any schema change touches both sides plus a migration — see the `db-migration` skill before editing an entity or `db/migration`. `EntityMappingParityIntegrationTest` fails the build when a column of a shared table goes unmapped by either side; a deliberate omission goes in its `DELIBERATELY_UNMAPPED` list with a reason. ADR-0002 has the rationale.

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
