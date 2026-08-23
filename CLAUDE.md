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

### Checks that fail CI for reasons that aren't in the diff

Several of these are *ratchets*: they don't demand the codebase be perfect, they demand the
known exception list stop growing. Where one has a documented-exemption list, adding to it is a
review decision with a stated reason, never a way to get green.

- **`openapi.yaml` is committed and semantically diffed** against the spec springdoc serves, by `OpenApiDriftIntegrationTest`. After an intentional API change, regenerate rather than hand-edit:
  `mvn test -pl webhook-platform-api -Dtest=OpenApiDriftIntegrationTest -Dopenapi.regenerate=true`, then review and commit the file.
  `OpenApiOperationIdTest` additionally fails when two handlers would collide on a springdoc-derived
  operationId — those are generated-SDK method names, so fix it at the source with an explicit
  `@Operation(operationId = …)`, not in the spec file.
- **The version lives in seven places** — reactor pom, `deploy/helm/hookflow/Chart.yaml` (version *and* appVersion), `webhook-platform-ui/package.json`, and all three SDK manifests under `sdks/`. Never bump one by hand: `make version-set VERSION=2.4.0`, and `make version-check` runs the same drift check CI does.
- **A new mutating handler must declare who may call it.** Two reflection-only unit tests
  (`MutatingHandlerScopeDeclarationTest`, `MutatingHandlerAccessDeclarationTest`) fail the build
  when a `POST`/`PUT`/`PATCH`/`DELETE` handler carries neither `@RequireScope` / `@RequireAccess`
  nor an entry in that test's exemption list. Both interceptor defaults are *allow*, which is why
  the omission is otherwise silent. `AccessLevelEnforcementTest` separately proves the annotation
  is actually enforced and not decoration.
- **Schema and entity parity** — `EntityMappingParityIntegrationTest` (a column of a shared table
  unmapped by api or worker) and `SchemaRetryLadderDefaultsTest` (Flyway column defaults drifting
  from `RetryLadderDefaults`).
- **Tenancy** — `ServiceTenantParameterTest` fails on any service method that takes an
  `organizationId` parameter. See *Auth & tenancy* below.
- **Locale parity** — `webhook-platform-ui/src/i18n/__tests__/locales.test.ts` fails when a key exists in `en.json`
  but not `uk.json` or vice versa. Every user-facing string needs both.
- **Per-module JaCoCo ratchets** are bound to `verify`, and CI only runs them in the aggregate
  job after merging the unit *and* integration exec files. Running `mvn verify` locally over a
  partial test selection trips them against partial data — use `mvn test` for ordinary work.

## Git workflow (GitFlow)

Two rules carry the rest: **never commit or push directly to `main`**, and **never open a
`feature/*` PR against `main`**.

| Branch | Cut from | Merges into | Purpose |
|--------|----------|-------------|---------|
| `main` | — | — | Production-ready. Only ever receives `release/*` and `hotfix/*` |
| `develop` | `main` | `release/*` | Integration branch — the default working branch |
| `feature/*` | `develop` | `develop` | New work |
| `release/*` | `develop` | `main` **and** back into `develop` | Release preparation, version bumps |
| `hotfix/*` | `main` | `main` **and** back into `develop` | Production fixes |

- Start work from an up-to-date `develop` (`git checkout develop && git pull`), branch as
  `feature/<short-kebab-description>`.
- A hotfix branches from `main`, not from `develop` — branching it from `develop` drags
  unreleased work into production.
- Release: `release/1.x.0` from `develop` → `make version-set VERSION=…` → PR to `main` →
  tag `v1.x.0` after merge → merge back into `develop`.
- **Anything that lands on `main` must be merged back into `develop`**, or the fix disappears at
  the next release. That back-merge is a local operation — `git checkout develop && git merge
  origin/main`, then push `develop` — not a PR.

### Merge style, and why `main` is the exception

`feature/*` → `develop`: **squash** by default, so a branch's work-in-progress commits land as
one. Use `--no-ff` instead when the branch carries two or more deliberate, separately-meaningful
commits that are worth keeping apart. Either is safe here: the branch is deleted afterwards and
nothing else builds on it, so a rewritten SHA costs nothing.

`release/*` and `hotfix/*` → `main`: **a merge commit. Never squash, never rebase.** Both
rewrite the branch into new SHAs with no shared ancestry, so `main` and `develop` stop having a
common base and every later merge between them conflicts on files that are byte-identical.

This has now happened twice, which is why the rule is stated this bluntly:

- PR #100 (release 2.3.0) was squash-merged; the next release's back-merge reported 19 conflicts,
  12 of them between identical files.
- PR #160 squashed a feature branch straight into `main` — against the second rule at the top of
  this section — and the back-merge reported 9 conflicts, *all* of them between identical files.

A repository ruleset on `main` now allows only merge commits, so the GitHub UI cannot offer
squash or rebase there. `develop` is deliberately left unrestricted.

### Repairing a broken ancestry

If it happens anyway, do not hand-resolve the conflicts: that fixes one merge and leaves the
ancestry broken for the next one. Check first whether `main` contributes anything at all.

```bash
# 1. does main's tip hold the same tree as develop's own commit of that work?
git diff <main-tip> <develop-commit>          # empty  → identical trees
# 2. is that develop commit already in develop's history?
git merge-base --is-ancestor <develop-commit> develop
```

Both true means `main`'s content is a point that already sits inside `develop`'s history, so the
merge has nothing to contribute and `git merge -s ours origin/main` is correct — it records only
the parent link and leaves the tree byte-identical. Verify afterwards that `git diff
<pre-merge-sha> HEAD` is empty and that `git merge-tree --write-tree origin/main develop` reports
no conflicts; the second one is the check that the *next* release merge is actually fixed.

Without that containment proof `-s ours` silently discards the other side, so do not reach for it
on a hunch.

### What is actually enforced

Worth knowing, because the settings and the conventions are not the same thing:

- `main` — PR required, 11 status checks must be green, conversations resolved, merge commits
  only, force-push and deletion blocked, and the rules apply to admins too. **Reviews are not
  gated** (`required_approving_review_count` is 0); asking for one is a convention.
- `develop` — force-push and deletion blocked, nothing else. Direct pushes are the normal way it
  is updated.

Commit messages use conventional prefixes: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
`chore:`. See `CONTRIBUTING.md` for the full policy.

## Vocabulary

`CONTEXT.md` is the project's domain model: what an Event, a Delivery, a Forward, a Claim, an
Attempt, a Deferral, a Source, a Destination each mean here, and — for every one of them — the
near-synonyms to **avoid**. It is deliberate that "outgoing/incoming" are the two directions and
"outbound/inbound/egress/relay" are not, and that a Delivery is the *obligation* while an Attempt
is one *try* at it.

Read it before naming a class, a column, a metric or a UI string, and before writing an ADR.
Where the code and `CONTEXT.md` disagree, that is a bug in one of them worth raising, not a
licence to pick either word.

## Working notes and decisions

Three places, with different lifetimes and different tenses — do not conflate them:

- **`docs/adr/`** is tracked and permanent, and it is about the **past**. An ADR records a
  decision that is load-bearing: one a future reader would otherwise re-litigate, because the
  code shows *what* was built and not *why the obvious alternative was rejected*.
  `docs/adr/README.md` has the index and the format. Do not re-open a decision an ADR settles
  without saying so in the ADR.
- **`.claude/features/`** is gitignored scratch, and it is about the **maybe**: proposals.
  One file per idea we might build — the shape it would take, what it would cost, what it rules
  out. Nothing here is committed to, and **a feature doc is not a work order**: do not start
  implementing one because it exists. When a proposal is accepted it becomes a task file (below);
  when it is rejected, say why in the file before deleting it, or the same idea comes back next
  quarter. `.claude/features/README.md` has the flow and `TEMPLATE.md` the shape.
- **`.claude/tasks/`** is gitignored scratch, and it is about the **now**: work that is actually
  meant to happen. One file per branch, broken into steps someone can pick up cold — each step
  carrying `file:line`, the symptom, the cause, the fix, and how to verify it. This is the only
  one of the three that authorizes writing code. **A task file is deleted when its branch
  merges** — whatever is still true moves into an ADR first. `.claude/tasks/README.md` has the
  format.

Being gitignored, `features/` and `tasks/` exist only in a working copy that has them; this
section is what makes the convention discoverable at all.

## Architecture

Five modules: `common` (shared DTOs, `KafkaTopics`, crypto/signature/PII utils), `api` (REST + ingress + tunnel hub + outbox publisher, **owns all Flyway migrations**), `worker` (Kafka consumers, HTTP delivery/forwarding, retries), `cli` (picocli), `ui`.

API and worker each keep **their own JPA entity + repository copies** of the shared tables (`Event`, `Delivery`, `Endpoint`, `IncomingEvent`, …). Any schema change touches both sides plus a migration — see the `db-migration` skill before editing an entity or `db/migration`. `EntityMappingParityIntegrationTest` fails the build when a column of a shared table goes unmapped by either side; a deliberate omission goes in its `DELIBERATELY_UNMAPPED` list with a reason. ADR-0002 has the rationale.

### Two delivery pipelines

Outgoing (`/api/v1/projects/{id}/events`) and incoming (`/ingress/{token}`) both run through the **same transactional outbox** — nothing is published to Kafka inside a business transaction. `OutboxPublisherService` is a scheduled poller, ShedLock-guarded, with a per-project fairness cap. README.md has the sequence diagrams for both flows.

All topic names live in `KafkaTopics`; adding one also means adding it to the topic-creation step in the `Makefile`.

FIFO ordering is not a Kafka guarantee here: `SequenceGeneratorService` (API) stamps sequence numbers and `OrderingBufferService` (worker) buffers out-of-order deliveries per endpoint in Redis, with `ordering_cursors` in Postgres as the durable fallback.

### One attempt lifecycle, two stores

The two pipelines diverge in *what* they carry and converge in *how* one try is made.
`worker/attempt/AttemptRunner` owns the order of operations for a single Attempt — claim, admit
(rate limit, concurrency permit, circuit breaker), transform, send, classify, finalise — and both
directions run it. What differs is behind `AttemptStore`, of which there are exactly two:
`OutgoingAttemptStore` (Deliveries, HMAC-signed) and `IncomingAttemptStore` (Forwards,
destination auth). ADR-0011 has the rationale; the short version is that the incoming pipeline
began as a copy of the outgoing one and four separate fixes then had to be hand-ported between
them.

**A fix to attempt behaviour belongs in the Runner, not in one direction.** If it cannot go
there, that is the signal it is genuinely store-specific. The `AttemptRunner` javadoc lists the
invariants it exists to hold — no DB/Redis/Kafka work inside the reactive chain, no successor
unless `finalise` reports it wrote, every permit released on every path — each of which was once
a real duplicate-delivery or stuck-throttle bug.

`RetryLadderDefaults` (common) is the **single declaration** of both default ladders. The two
directions differ on purpose — outgoing 7 attempts out to 24h, incoming 5 out to 6h — because
holding a customer's own event for a day is a reasonable promise and holding somebody else's
relayed webhook that long is not. That asymmetry is not drift; do not "fix" it into agreement.

### Tunnel

CLI ↔ `/ws/tunnel` bridges a public `POST /tunnel/{slug}` to the developer's `localhost:PORT` (README has the diagram). `RedisTunnelCoordinator` exists because a tunnel's WebSocket may be held by a different API instance than the one receiving the request.

### Auth & tenancy

Requests carry either a JWT (dashboard/CLI) or `X-API-Key` (server-to-server); `JwtAuthenticationFilter` / `ApiKeyAuthenticationFilter` both resolve into a single `AuthContext` record, injected into controllers as a plain method parameter via `AuthContextArgumentResolver`. Enforcement layers:

- `@RequireAccess(AccessLevel.WRITE)` — the caller's role, checked by `ScopeEnforcementInterceptor` before the handler runs. This is the declarative half and is what the CI ratchet enforces on new mutating handlers.
- `AuthContext.requireWriteAccess()` / `requireOwnerAccess()` — the same RBAC question (Owner/Developer/Viewer/API_KEY) asked imperatively. Kept as defence in depth *alongside* the annotation, not replaced by it — a handler normally carries both.
- `@RequireScope(ApiKeyScope…)` — API-key scope, checked by `ScopeEnforcementInterceptor`. Distinct from the above: scope is what an API key may do, access level is what a role may do, and a handler may legitimately need one and not the other.
- `@RequireOrgAccess` — `OrgAccessAspect` compares the `{orgId}` path variable against the token's org and throws 403 on mismatch.
- `AuthContext.validateProjectAccess(projectId)` — an API key may only touch its own project.

Org ownership is **not** on that list, because it is no longer something an endpoint does. `TenantContextFilter` puts the caller's organization into `TenantContext`, and `@TenantId` makes Hibernate add `organization_id = <current tenant>` to every query — `findById` included. A service method that takes an `organizationId` fails `ServiceTenantParameterTest`. ADR-0006 has the whole shape; three things follow from it that are easy to trip over:

- **Anything without a request needs a scope of its own.** `@SystemTenant` on a scheduler or consumer; `TenantContext.runAs(orgId, …)` on a public path after it resolves whose data it is handling. No scope is a 500, deliberately.
- **Enter the scope outside the transaction.** Hibernate reads the tenant when it opens the session, so a scope entered inside one is too late and the row gets the wrong organization stamped on it.
- **Native queries are exempt from the filter** and must carry their own `organization_id` predicate unless they are system paths — see the repository package's `package-info.java`.

New tenant-scoped endpoints must go through the checks above; don't hand-roll org checks. Public paths are whitelisted in `SecurityConfig` (`/ingress/**`, `/tunnel/**`, `/hook/**`, `/ws/tunnel`, auth + billing webhooks).

Errors: throw `NotFoundException` / `ForbiddenException` / `ConflictException` / `UnauthorizedException` / `QuotaExceededException` — `GlobalExceptionHandler` maps them to the shared `ErrorResponse`.

Secrets (endpoint signing secrets, source secrets, destination auth) are AES-256-GCM encrypted with versioned keys (`EncryptionKeyRegistry`, `EncryptionKeyRotationService`); never persist them in plaintext.

## Conventions

- **New behaviour is written test-first.** A `.claude/tasks/` step that adds functionality starts
  with a test that states the expected result and fails, and only then the implementation — use
  the `tdd` skill for the loop and `backend-tests` for what to name the class (the name decides
  which CI job it lands in). Changes that don't alter behaviour — refactors, `docs:`, `chore:` —
  are exempt. The point of writing it down: a test added after the fact proves the code does what
  it does, not what it was supposed to do.
- Config is env-var-driven: every variable is documented in `.env.dist`, consumed through `docker-compose.yml` into `application.yml`. Add new settings there rather than hardcoding, and keep `ProductionSafetyValidator` / `SecurityConfigValidator` in mind — they fail startup on unsafe production config.
- Runbooks and operational procedures: `docs/OPERATIONS.md`, `docs/runbooks/`.
- `webhook-platform-ui/CLAUDE.md` carries the frontend-specific conventions (the shared axios
  client, centralized query keys, locale parity, the page-test harness). It loads automatically
  when you work in that directory — add UI rules there, not here.
