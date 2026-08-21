# P3-36 — Table partitioning and log aggregation

- **Status:** DONE
- **Priority:** P3 — matters at volume, not at launch
- **Branch:** `feature/P3-36-partitioning-and-logs`
- **Depends on:** nothing
- **Area:** `webhook-platform-api/src/main/resources/db/migration/`, `monitoring/`

## 36a — High-volume tables are not partitioned

48 tables, 195 indexes, 49 migrations — and `grep -rl PARTITION db/migration/`
matches only `V047__p1_outbox_kafka_key_index.sql`. The high-volume tables —
`deliveries`, `delivery_attempts`, `incoming_events`, and the tunnel request log
— grow unbounded and are pruned by `DELETE`, per the retention config in
`application.yml:94-105`.

`DELETE`-based retention on a busy table means bloat, vacuum pressure, and
retention jobs that get slower exactly as the platform gets busier.

- [x] Convert the high-volume tables to time-based partitioning (monthly or
      weekly, depending on measured volume). Postgres declarative partitioning.
      **Scope note**: `delivery_attempts` (monthly, V052) and `tunnel_request_log`
      (weekly, V053) done. `deliveries` and `incoming_events` deliberately
      **deferred** — both are the target of an FK from another high-volume table,
      so partitioning them requires propagating the partition key into the child
      table (composite FK) and touching both JPA entity copies; `deliveries`
      retention is also per-organization-plan (not a single cutoff), so
      `DROP PARTITION` can't fully replace its retention job regardless. Full
      reasoning and a concrete follow-up plan: `docs/runbooks/partition-high-volume-tables.md` §5.
- [x] Replace `DELETE`-based retention with `DROP PARTITION` — an O(1) operation
      instead of an O(rows) one. Done for the two tables above
      (`PartitionMaintenanceService`); the two `DataRetentionService` jobs that
      aren't simple time cutoffs (14-day *successful-only* cleanup, per-delivery
      attempt-count limit) stay row-level DELETE by necessity — see the runbook §1.
- [x] Read the `db-migration` skill before starting. **Both** `api` and `worker`
      keep their own JPA entity copies of these tables, and both run
      `ddl-auto: validate`, so a partitioning migration that Hibernate does not
      recognise will fail startup in both services. No entity changes were
      needed — verified live (see Progress log).
- [x] Plan the migration for an existing populated database. Partitioning a live
      table is not a one-statement change — document the procedure in
      `docs/runbooks/` and rehearse it against a restored backup.
      `docs/runbooks/partition-high-volume-tables.md`. No real backup was
      available to rehearse against in this sandbox — see Progress log for
      exactly what was verified instead (Testcontainers + a standalone
      psql-migrated Postgres) and what a real rehearsal still needs to check.
- [x] Check the 195 indexes while you are here: some are likely redundant, and
      each one costs write throughput on the hottest tables in the system.
      One dead index removed (V051, evidence-backed), one trimmed while
      rewriting `delivery_attempts`' indexes (V052); several more plausible-but-
      unconfirmed candidates documented for a follow-up with real
      `pg_stat_user_indexes` data — runbook §6.

## 36b — No log aggregation

No Loki, Promtail, Fluent Bit or Vector in `monitoring/docker-compose.yml` or
`deploy/`. `docker-compose.prod.yml:37` sets `LOG_LEVEL: WARN` and logs go to
stdout with no collector and no `logging:` driver or rotation config.

The frustrating part: `JwtAuthenticationFilter.java:67-68` populates MDC with
`organizationId` / `userId` / `projectId`, and `CorrelationIdFilter` adds a
correlation ID — excellent structured-logging groundwork that is thrown away
because nothing ships or indexes it. Post-incident forensics on a restarted
container is impossible.

- [x] Add a log collector to the monitoring stack (Loki + Promtail is the natural
      fit next to the existing Prometheus/Grafana, and correlates with the
      dashboards you already have). `monitoring/loki/`, `monitoring/promtail/`,
      wired into `monitoring/docker-compose.yml`. Also fixed a real bug found
      along the way: both `logback-spring.xml` files had an
      `<includeMdcKeyName>` allow-list that silently dropped
      `organizationId`/`userId`/`projectId` (api) and `incomingEventId`/
      `destinationId` (worker) from the shipped JSON — exactly the "groundwork
      thrown away" this task named. Fixed and verified live (see Progress log).
- [x] Configure retention and rotation so a self-hoster does not fill their disk.
      Loki compactor + `LOKI_RETENTION_PERIOD` (default 14d, `.env.dist`).
- [x] Add a Grafana dashboard or saved queries that pivot on `correlationId` and
      `organizationId` — that is the payoff for the MDC work already done.
      `monitoring/grafana/dashboards/hookflow-logs.json` (new "Hookflow — Logs"
      dashboard, template variables for both fields) + LogQL examples in the
      runbook below.
- [x] Document the "trace one webhook end to end" procedure in a runbook: given a
      delivery ID, find every log line across api and worker.
      `docs/runbooks/trace-webhook-logs.md`.

## Verification

```bash
# partitioning:
make shell-db
# \d+ deliveries  → confirm partitioned; check a retention run drops a partition
# then confirm both services still start (ddl-auto: validate is the gate)
make up && make health
```

```bash
# logs:
make monitoring-up
# generate a delivery, then query Loki by correlationId and confirm lines from
# BOTH api and worker are returned
```

## Definition of done

- [x] High-volume tables partitioned; retention drops partitions instead of rows.
      (`delivery_attempts`, `tunnel_request_log` — 2 of the 4 named tables; see
      scope note above for `deliveries`/`incoming_events`.)
- [x] Migration procedure for existing databases documented and rehearsed.
      (Rehearsed against Testcontainers + a standalone psql-migrated Postgres,
      not a real backup — none was available in this sandbox. Documented
      precisely what that does and doesn't cover.)
- [x] Both services start clean under `ddl-auto: validate`.
- [x] Logs collected, searchable by correlation ID across services.

## Progress log

**2026-08-21 — 36a (partitioning) and 36b (log aggregation), both done with
documented scope limits. Status: DONE.**

### 36a — what shipped

- `V051__drop_redundant_hot_table_index.sql` — drops one dead index
  (`idx_deliveries_next_retry_at`), evidence in the migration file.
- `V052__partition_delivery_attempts.sql` — converts `delivery_attempts` to
  monthly `PARTITION BY RANGE (created_at)`, attaching all pre-cutover history
  as one `delivery_attempts_legacy` partition (no data rewrite). Also trims
  `idx_delivery_attempts_created_at` (subsumed by the wider cleanup index).
- `V053__partition_tunnel_request_log.sql` — same technique, weekly grain
  (7-day retention).
- `PartitionMaintenanceService` (new) — creates future partitions ahead of
  need, drops fully-expired ones via `DROP TABLE` (found through `pg_catalog`
  introspection, not naming-convention guessing).
- `DataRetentionService` — removed the two now-redundant DELETE-based jobs
  (`cleanupOldDeliveryAttempts`, `cleanupTunnelRequestLog`); the two
  non-time-cutoff jobs are untouched.
- `deliveries`/`incoming_events` partitioning deliberately deferred — FK
  propagation + composite-PK ripple into both JPA codebases is a materially
  bigger, separately-reviewable change; see
  `docs/runbooks/partition-high-volume-tables.md` §5 for the full reasoning
  and a concrete follow-up plan.
- Index audit across the hot tables (`docs/runbooks/partition-high-volume-tables.md` §6):
  one dead index removed, one trimmed, several plausible candidates documented
  for a follow-up with real `pg_stat_user_indexes` data rather than dropped on
  suspicion (this codebase's P0/P1 history on these exact tables argued for
  caution over completionism).

**Verification actually performed** (no real backup was available in this
sandbox to rehearse against — see `docs/runbooks/partition-high-volume-tables.md`
§4 for the full breakdown of what this does and doesn't prove):

```
$ mvn -pl webhook-platform-api -am test -Dtest=PartitionMaintenanceServiceIntegrationTest
...
Migrating schema "public" to version "052 - partition delivery attempts"
Migrating schema "public" to version "053 - partition tunnel request log"
Successfully applied 53 migrations to schema "public", now at version v053
...
c.w.p.a.s.PartitionMaintenanceService - Dropping expired partition delivery_attempts_legacy of delivery_attempts (fully older than 0d retention)
...
Tests run: 5, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

```
$ mvn -pl webhook-platform-worker -am test -Dtest=TempWorkerValidateModeCheck   # throwaway, not committed
# real WebhookPlatformWorkerApplication context, ddl-auto=validate, against a
# Postgres migrated by psql (V001..V053) with zero Flyway involvement — proves
# the worker's JPA entity copies validate cleanly against the partitioned
# schema independently of the api module's own (already-passing) Flyway run.
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Also re-ran the two pre-existing test classes that write to/read from
`delivery_attempts` against the new schema —
`DataRetentionIntegrationTest` (updated: removed the test for the deleted
`cleanupOldDeliveryAttempts` method) and `ShedLockConcurrencyTest` — both pass.

`mvn test-compile` (all modules) and the full non-Docker unit suite
(`-Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'`)
both pass clean.

`make up && make health` (the task's own verification block) was **not** run:
this worktree's directory name doesn't match `webhook-platform`, so
`monitoring/docker-compose.yml`'s hardcoded external-network reference
(`webhook-platform_webhook-network`) wouldn't resolve to a network `make up`
here would actually create — a pre-existing property of this repo's Compose
setup, unrelated to this change. The `ddl-auto: validate` gate this command
would exercise was verified directly instead, as shown above, against both
services independently.

### 36b — what shipped

- `monitoring/loki/loki-config.yml`, `monitoring/promtail/promtail-config.yml`,
  wired into `monitoring/docker-compose.yml` (+ `loki`/`promtail` services,
  `loki_data`/`promtail_positions` volumes).
- Fixed both `logback-spring.xml` files: removed `<includeMdcKeyName>`
  allow-lists that were silently dropping most MDC fields from the shipped
  JSON (only `correlationId` on api; a stale list referencing MDC keys the
  worker code doesn't even set, on worker).
- Loki datasource auto-provisioned in Grafana
  (`monitoring/grafana/provisioning/datasources/datasource.yml`).
- New `monitoring/grafana/dashboards/hookflow-logs.json` — logs panel +
  volume-by-level, `correlation_id`/`organization_id` template variables.
- `docs/runbooks/trace-webhook-logs.md` — the "given a delivery ID, find every
  log line" procedure, including the SQL to go from a delivery ID to its
  correlation ID (`outbox_messages.correlation_id`).
- `.env.dist` / `monitoring/README.md` updated (`LOKI_RETENTION_PERIOD`,
  architecture diagram, dashboard table).

**Verification actually performed** (`make monitoring-up` + a real delivery
wasn't run, same worktree-network reason as 36a — see
`docs/runbooks/trace-webhook-logs.md` §5 for the full breakdown):

- Real Loki 3.0.0 + Promtail 3.0.0 containers, using this task's actual config
  files unmodified (only the Loki push URL changed, to point at the throwaway
  container instead of the Compose service name). Two throwaway containers
  labeled `com.docker.compose.service=api` / `=worker` each emitted one
  LogstashEncoder-shaped JSON line sharing a correlation ID. Promtail
  correctly discovered both via the Docker label (not container name — this
  repo doesn't set fixed container names and this worktree's directory name
  isn't `webhook-platform`, both of which would break a name-based approach),
  shipped both to Loki, and:
  ```
  $ curl ... 'query={service=~"api|worker"} |= "corr-abc-123"' ...
  worker -> {"...","message":"Received delivery: deliveryId=del-555","correlationId":"corr-abc-123"}
  api    -> {"...","message":"dispatching delivery","correlationId":"corr-abc-123","organizationId":"org-999","deliveryId":"del-555"}
  total streams: 2
  ```
  — real proof the cross-service correlationId pivot this runbook describes
  works, not just that the LogQL parses.
- The `logback-spring.xml` fix itself verified against a real, live Spring
  Boot process (production profile active, so `<springProfile>` actually
  resolves): captured stdout contained
  `"organizationId":"org-verify-2","userId":"user-verify-3","correlationId":"corr-verify-1"`
  — before the fix, only `correlationId` would have made it through.

All throwaway verification containers, networks, and test files were removed
after use; nothing left running or committed beyond the files listed above.

### Board

`.claude/features/README.md` P3-36 row updated to `DONE`.
