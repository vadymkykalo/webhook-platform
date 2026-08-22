# 0002 — `api` and `worker` keep separate JPA entity copies of the shared tables

**Status:** Accepted, with a stated revisit trigger

## Context

`api` and `worker` both read and write the same physical tables: `deliveries`, `events`,
`endpoints`, `incoming_events`, `incoming_sources`, `incoming_destinations`,
`transformations` and their attempt tables. Each module declares its own
`@Entity` and its own Spring Data repository for each of them, in its own package.

The two sides genuinely need different things from the same table. `api` needs the whole
row — it renders it in the dashboard, exposes it over REST, and owns writes to columns the
worker never touches (`secret_previous_encrypted`, `verification_token`, `query_params`,
`client_ip`). The worker needs the delivery hot path and a handful of claim/finalize
queries. The worker's `Endpoint` maps roughly two thirds of the columns the api's does.

`webhook-platform-common` deliberately carries no JPA or Spring Data dependency — it holds
DTOs, `KafkaTopics`, crypto and PII utilities, and is on the CLI's classpath, which must
not drag in a persistence stack.

## Decision

Keep the duplication. `api` owns all Flyway migrations; both modules map the resulting
schema independently, mapping only the columns each actually uses.

Any schema change is therefore a **three-file change**: the migration, the api entity, and
the worker entity. This is stated in `CLAUDE.md` and in the `db-migration` skill because
nothing in the build enforces it.

## Consequences

- **This has already cost real bugs, twice, in one commit.** `events.payload_compressed`
  was never mapped by the worker's `Event`, so every event above the 1 KB compression
  threshold was delivered — and HMAC-signed — as a gzip+Base64 blob instead of JSON.
  `endpoints.deleted_at` was never mapped either, so a soft-deleted endpoint kept
  receiving queued events for the whole life of its retry ladder. Both columns had been
  in the schema for releases.
- Hibernate's schema validation cannot catch a *missing* mapping, only a wrong one. The
  failure mode is silent by construction.
- The upside is real and is why the decision stands: the worker's entities stay small,
  the worker does not link Spring Data REST/dashboard concerns, and neither module can
  break the other's mapping by editing a shared class.

## Revisit trigger

A third drift bug of the same shape — a column present in the schema and used by one
module, unmapped by the other — is the signal to introduce a
`webhook-platform-persistence` module holding one entity per table, with the api and
worker repositories projecting from it. Do not do this pre-emptively: the shared-entity
version was rejected below for reasons that have not changed.

## Alternatives rejected

- **One shared entity module.** Couples the CLI and the worker to the full api-side
  mapping, and makes every dashboard-only column a worker-side deployment concern. The
  cost is paid on every change; the drift bugs, so far, have been rarer than that.
- **Generating both entities from the migration.** Adds a code generator to the build for
  a schema that changes a few times per release.
- **Enforcing parity with a test that reflects over both entity sets.** Genuinely
  attractive and *not* rejected — it just doesn't exist yet. A test comparing each shared
  table's `information_schema` columns against both `@Entity` mappings, with an explicit
  allowlist for deliberately-unmapped columns, would turn this ADR's failure mode from
  silent to loud. See ADR-0006 for the same ratchet pattern applied to authorization.
