# Runbook: Partitioning the High-Volume Tables (P3-36a)

> Covers: what got partitioned and why, the exact procedure for rolling this out
> against an existing populated production database, partition maintenance
> operations, rollback, and what's deliberately deferred.

---

## 0. Summary

| Table | Partitioned? | Grain | Retention mechanism after this change |
|---|---|---|---|
| `delivery_attempts` | Yes (V052) | Monthly | `DROP TABLE` on expired partitions (`PartitionMaintenanceService`) |
| `tunnel_request_log` | Yes (V053) | Weekly | `DROP TABLE` on expired partitions (`PartitionMaintenanceService`) |
| `deliveries` | **Deferred** — see §5 | — | Unchanged: per-plan `DELETE` (`RetentionCleanupScheduler`) |
| `incoming_events` | **Deferred** — see §5 | — | Unchanged: age-based `DELETE` (`DataRetentionService.cleanupOldIncomingEvents`) |

`delivery_attempts` and `tunnel_request_log` were chosen for this pass because
neither has an inbound foreign key from another table. Postgres requires every
unique/primary-key index on a partitioned table to include the partition key
column, which is a one-table, self-contained change for these two. `deliveries`
and `incoming_events` are each the target of an FK from another high-volume
table (`delivery_attempts.delivery_id`, `incoming_forward_attempts.incoming_event_id`),
so partitioning them would force the partition key onto those child tables too
(composite FK) and touch both JPA entity copies (`api` and `worker`) — see §5 for
why that was deliberately not attempted in this pass.

---

## 1. What actually changed

`delivery_attempts` and `tunnel_request_log` were converted from ordinary heap
tables to declarative `PARTITION BY RANGE (created_at)` tables (V052, V053).
Existing rows were **not rewritten**. Instead:

1. The original table was renamed out of the way (`<table>_legacy`) — instant,
   metadata-only.
2. A new partitioned table was created under the original name.
3. `<table>_legacy` was attached as the partition covering everything strictly
   before the start of the current month (`delivery_attempts`) / current ISO
   week (`tunnel_request_log`) — all pre-cutover history stays exactly where it
   physically is on disk.
4. A few forward partitions were created (current period + 2 ahead), plus a
   `DEFAULT` partition as a safety net.

Application code is unaffected: both tables still have a single `id` column
that Hibernate treats as `@Id`, and `ddl-auto: validate` only checks that
mapped columns exist with compatible types — it does not inspect
primary-key/constraint shape. No entity changes were needed in either `api` or
`worker`. See the migration files' comments (`V052__partition_delivery_attempts.sql`,
`V053__partition_tunnel_request_log.sql`) for the full statement-by-statement
rationale, including why the primary key had to widen to `(id, created_at)`.

`PartitionMaintenanceService` (`webhook-platform-api/.../service/PartitionMaintenanceService.java`)
runs daily (`partition-maintenance.cron`, default `0 45 1 * * *`):
- Creates future partitions ahead of need (`ensureFutureMonthlyPartitions` /
  `ensureFutureWeeklyPartitions`), idempotently (`CREATE TABLE IF NOT EXISTS`).
- Drops partitions once *every* row they can possibly contain is past
  `data-retention.delivery-attempts-retention-days` / `tunnel-request-log-retention-days`
  — found by introspecting `pg_catalog` (not by naming convention alone), via
  `DROP TABLE <partition>`. This is O(1): it unlinks the partition's files
  instead of scanning and deleting rows.
- `DataRetentionService.cleanupOldDeliveryAttempts()` and `.cleanupTunnelRequestLog()`
  (the two DELETE-based jobs this replaces) were removed. Two other
  `DataRetentionService` jobs stay unchanged because they are not simple time
  cutoffs and can't be expressed as partition drops:
  - `cleanupOldSuccessfulAttempts` — 14-day cutoff, but **only** for 2xx
    attempts; a partition can hold a mix of 2xx and error attempts, so
    dropping a whole partition would also discard error attempts still inside
    the (longer) 90-day window.
  - `enforcePerDeliveryAttemptLimits` — "keep the last N attempts per
    delivery" isn't time-based at all.
  Both now run against a much smaller live partition instead of the whole
  accumulated table, which is still a real efficiency win even though the code
  is unchanged.

---

## 2. Rolling this out against an existing populated database

The migration SQL itself (V052/V053) is written to be correct regardless of
table size — it never copies existing rows — but two of its steps take an
**ACCESS EXCLUSIVE** lock for as long as they need to build an index, and on a
genuinely large `delivery_attempts` table (which stores full request/response
bodies — this is usually the biggest table in the schema) that can be
minutes, not milliseconds. Do not run the migration as-is during peak traffic
on a large production database; pre-stage the expensive parts first.

### 2.1 Pre-stage (hours to days ahead, zero application impact)

Run these manually against production **before** the deploy that ships
V052/V053. They read/lock the table but don't block writers, and the
migration will simply detect the work is already done — Flyway checksums
the migration file's *SQL text*, not the state of the database, so pre-staging
doesn't invalidate anything.

```sql
-- delivery_attempts: build the composite unique index CONCURRENTLY (does not
-- block reads/writes; can take a while on a large table, but never holds a
-- long lock).
CREATE UNIQUE INDEX CONCURRENTLY delivery_attempts_pk_staged
    ON delivery_attempts (id, created_at);

CREATE UNIQUE INDEX CONCURRENTLY delivery_attempts_unique_attempt_staged
    ON delivery_attempts (delivery_id, attempt_number, created_at);

-- tunnel_request_log: same idea.
CREATE UNIQUE INDEX CONCURRENTLY tunnel_request_log_pk_staged
    ON tunnel_request_log (id, created_at);
```

Then, still ahead of the deploy, swap these staged indexes in as the real
constraints (this part **is** a fast metadata-only operation — no index
rebuild — because the index already exists and is valid):

```sql
ALTER TABLE delivery_attempts DROP CONSTRAINT delivery_attempts_pkey;
ALTER TABLE delivery_attempts ADD CONSTRAINT delivery_attempts_pkey
    PRIMARY KEY USING INDEX delivery_attempts_pk_staged;

DROP INDEX idx_delivery_attempts_unique_attempt;
ALTER INDEX delivery_attempts_unique_attempt_staged
    RENAME TO idx_delivery_attempts_unique_attempt;

ALTER TABLE tunnel_request_log DROP CONSTRAINT tunnel_request_log_pkey;
ALTER TABLE tunnel_request_log ADD CONSTRAINT tunnel_request_log_pkey
    PRIMARY KEY USING INDEX tunnel_request_log_pk_staged;
```

Also pre-validate the range-bound CHECK constraint the migration uses to skip
re-scanning on `ATTACH PARTITION` (`VALIDATE CONSTRAINT` takes `SHARE UPDATE
EXCLUSIVE`, not blocking):

```sql
ALTER TABLE delivery_attempts ADD CONSTRAINT delivery_attempts_legacy_created_at_check
    CHECK (created_at < date_trunc('month', now())) NOT VALID;
ALTER TABLE delivery_attempts VALIDATE CONSTRAINT delivery_attempts_legacy_created_at_check;
```

(Use the actual boundary you intend the migration to use — i.e. run this close
to the deploy, same day, so `date_trunc('month', now())` matches what V052
computes when it runs.)

If everything above is pre-staged, V052/V053 running as part of the normal
deploy degrade to metadata-only operations (rename table, rename indexes,
`ATTACH PARTITION` against an already-matching, already-validated
constraint+index) — seconds, not minutes, regardless of table size.

### 2.2 The deploy itself

1. Take a fresh backup (`make backup-db` / `deploy/scripts/db-backup.sh`) —
   standard pre-migration hygiene, not partitioning-specific.
2. Deploy as normal. Flyway runs V052/V053 as part of `api` startup.
3. Confirm both services start clean (this is the `ddl-auto: validate` gate —
   see §4).
4. `make shell-db` → `\d+ delivery_attempts` and `\d+ tunnel_request_log` to
   confirm the partitioned structure (see §4 for exact output captured during
   this task's own verification).

### 2.3 Rollback

Both migrations are additive/renaming, not destructive — no row was deleted.
To roll back before the next deploy touches these tables further:

```sql
-- Reverse V052: detach and rename back. This is the same "cheap metadata
-- operation" as the forward migration, not a data rewrite.
ALTER TABLE delivery_attempts DETACH PARTITION delivery_attempts_legacy;
DROP TABLE delivery_attempts;   -- the empty partitioned parent + any forward partitions
ALTER TABLE delivery_attempts_legacy RENAME TO delivery_attempts;
ALTER TABLE delivery_attempts RENAME CONSTRAINT delivery_attempts_legacy_pkey TO delivery_attempts_pkey;
-- ...and rename the indexes back (see V052 for the exact names it renamed away from).
```

Any row that landed in a forward partition (i.e. was inserted *after* the
migration ran) is lost by the `DROP TABLE delivery_attempts` step above unless
you first `INSERT INTO delivery_attempts_legacy SELECT * FROM
delivery_attempts_yYYYY_mMM` for each forward partition. In practice: don't
roll back once the deploy has been live long enough to accept new writes —
fix forward instead.

---

## 3. Partition maintenance operations

- **Force a partition-maintenance run**: it's ShedLock-guarded and scheduled;
  to trigger it out of band, call `PartitionMaintenanceService.runMaintenance()`
  (e.g. via a JMX/actuator-exposed bean invocation, or just wait for the next
  cron tick — `partition-maintenance.cron`).
- **A partition failed to get created in time** (writes landing in
  `delivery_attempts_default` / `tunnel_request_log_default`): the
  `partition_default_rows{table=...}` gauge is nonzero and the service logs a
  `WARN`. Fix: manually create the missing partition (see V052's `DO $$` block
  for the exact `CREATE TABLE ... PARTITION OF ... FOR VALUES FROM (...) TO
  (...)` shape), then move the misrouted rows out of the default partition and
  into it:
  ```sql
  -- Postgres won't let you UPDATE the partition key in place across
  -- partitions implicitly for DEFAULT-partition rows in the general case;
  -- easiest is to re-insert + delete inside a transaction, or just leave
  -- them — DEFAULT partition rows are still fully queryable via the parent.
  ```
- **Increase the lookahead window** (e.g. before a known low-maintenance
  window like a holiday freeze): bump
  `PARTITION_MAINTENANCE_DELIVERY_ATTEMPTS_LOOKAHEAD_MONTHS` /
  `PARTITION_MAINTENANCE_TUNNEL_LOG_LOOKAHEAD_WEEKS`.
- **Disable maintenance entirely** (e.g. mid-incident): `PARTITION_MAINTENANCE_ENABLED=false`.
  Partitions already created keep working; only future creation/dropping pauses.

---

## 4. Verification performed for this task

A full populated-database rehearsal against a *restored production backup*
was not available in this sandbox (no such backup exists here). What **was**
verified, against real Postgres (Docker/Testcontainers, not mocked):

1. **`PartitionMaintenanceServiceIntegrationTest`**
   (`webhook-platform-api/src/test/java/com/webhook/platform/api/PartitionMaintenanceServiceIntegrationTest.java`) —
   boots the real API Spring context (Testcontainers Postgres 16), which runs
   the real Flyway migrations including V052/V053, then asserts against the
   live database:
   - the migration produces the expected `_legacy`, `_default`, and dated
     partitions for both tables;
   - a row with an old `created_at` physically lands in `delivery_attempts_legacy`,
     a current one in the current-month partition, and a far-future one in
     `delivery_attempts_default` — proving partition routing actually works,
     not just that the DDL parsed;
   - `dropExpiredPartitions("delivery_attempts", 0)` drops the real
     `delivery_attempts_legacy` partition and only that partition — this is
     the task's requested "a retention run dropping a partition" check;
   - `ensureFutureMonthlyPartitions` is idempotent (re-running doesn't error
     or duplicate).
2. **`ddl-auto: validate` for both services against the post-migration
   schema**: all 53 migration files (V001–V053) were applied via `psql`
   directly to a throwaway Postgres 16 container (bypassing Flyway, to
   decouple this check from the `api` module), then the real
   `WebhookPlatformWorkerApplication` Spring context was booted against that
   database with `spring.jpa.hibernate.ddl-auto=validate` (the production
   setting) — full context, real Kafka/Redis via Testcontainers, nothing
   mocked. It started clean. Combined with (1) — where the `api` context
   itself already runs V052/V053 under its own `ddl-auto: validate` — this
   confirms **both** services validate cleanly against the partitioned schema.
3. `ShedLockConcurrencyTest` and `DataRetentionIntegrationTest` (existing test
   classes that write to / read from `delivery_attempts`) were re-run against
   the new schema and pass unchanged.

What a rehearsal against a real backup would additionally need to check that
this sandbox couldn't: actual wall-clock duration of the `ADD CONSTRAINT ...
PRIMARY KEY USING INDEX` swap and `VALIDATE CONSTRAINT` at production data
volume (informs how far ahead of the deploy §2.1 needs to run), and whether
autovacuum keeps up on the newly-small current-period partitions versus the
old monolithic table (informs whether `autovacuum_vacuum_scale_factor` needs
per-partition tuning — Postgres supports `ALTER TABLE <partition> SET
(autovacuum_vacuum_scale_factor = ...)` per partition if so).

### Captured output

```
$ mvn -pl webhook-platform-api -am test -Dtest=PartitionMaintenanceServiceIntegrationTest
...
2026-08-21 17:30:44 INFO  o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "052 - partition delivery attempts"
2026-08-21 17:30:44 INFO  o.f.core.internal.command.DbMigrate - Migrating schema "public" to version "053 - partition tunnel request log"
2026-08-21 17:30:44 INFO  o.f.core.internal.command.DbMigrate - Successfully applied 53 migrations to schema "public", now at version v053
...
2026-08-21 17:30:55 INFO  c.w.p.a.s.PartitionMaintenanceService - Dropping expired partition delivery_attempts_legacy of delivery_attempts (fully older than 0d retention)
...
Tests run: 5, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

```
$ mvn -pl webhook-platform-worker -am test -Dtest=TempWorkerValidateModeCheck   # throwaway, not committed
# worker's real Spring context, ddl-auto=validate, against a Postgres migrated
# by psql with V001..V053 applied directly (no Flyway involved on the worker side)
...
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

---

## 5. Deferred: `deliveries` and `incoming_events`

Both are named in the original task alongside `delivery_attempts` and
`tunnel_request_log`. They were **not** partitioned in this pass. Reasoning:

- `deliveries.id` is referenced by `delivery_attempts.delivery_id` (`ON DELETE
  CASCADE`) and `alert_incidents.delivery_id` (`ON DELETE SET NULL`).
  `incoming_events.id` is referenced by `incoming_forward_attempts.incoming_event_id`
  (`ON DELETE CASCADE`). Partitioning either table requires widening its
  primary key to include the partition key (same as `delivery_attempts` and
  `tunnel_request_log` in this change) — but here that means the FK **from**
  the dependent table breaks too: Postgres requires an FK target to be exactly
  the columns of a unique constraint, so `delivery_attempts.delivery_id
  REFERENCES deliveries(id)` stops being valid the moment `deliveries`' PK
  becomes `(id, created_at)`. The correct fix is to propagate the partition
  key into the child table (add `delivery_created_at` to `delivery_attempts`,
  change the FK to `(delivery_id, delivery_created_at) REFERENCES
  deliveries(id, created_at)`) and update the JPA entity + repository in
  **both** `api` and `worker` (the two-entity rule) — a materially bigger,
  cross-module change than the two tables done here, on the exact tables this
  codebase's own bug history shows are the easiest place to introduce a
  subtle, hard-to-catch correctness regression.
- `deliveries` retention isn't a single global cutoff to begin with:
  `RetentionCleanupScheduler` deletes based on each organization's **plan**
  (`plans.max_retention_days`, currently 7/30/90/365/unlimited across the five
  seeded plans — see `V036__billing_plans.sql`). A single time partition can
  contain rows from organizations on different plans with different retention
  windows, so `DROP PARTITION` can't cleanly replace that job regardless of
  the FK issue above — the per-plan `DELETE` has to stay either way.
  `incoming_events`, by contrast, *does* have a single global cutoff
  (`data-retention.incoming-events-retention-days`), so it's a cleaner
  candidate for a future pass once the FK propagation into
  `incoming_forward_attempts` is done.

**Follow-up plan** (not started): add `event_created_at` /
`incoming_event_received_at` columns to `delivery_attempts` and
`incoming_forward_attempts` respectively, propagate on write, widen the parent
PKs and the child FKs to match, update both JPA entity copies plus every
native/JPQL query and repository method keyed by the old single-column
relationship, and only then apply the same rename/attach/partition technique
from V052/V053. Budget this as its own task with its own dedicated review —
don't fold it into a "just partition everything" pass.

---

## 6. Index audit (195 indexes across 48 tables)

Full methodology: for the hot tables named in this task (`deliveries`,
`delivery_attempts`, `incoming_events`, `incoming_forward_attempts`,
`outbox_messages`, `events`, `tunnel_request_log`), every `CREATE INDEX` across
all 50 pre-existing migrations was enumerated and cross-checked against actual
query usage (`grep` across both `api` and `worker` repositories for the
indexed columns) rather than dropped on suspicion.

**Removed** (`V051__drop_redundant_hot_table_index.sql`):
- `idx_deliveries_next_retry_at (next_retry_at) WHERE next_retry_at IS NOT NULL`
  — strictly dominated by `idx_deliveries_retry_query (status, next_retry_at)
  WHERE next_retry_at IS NOT NULL`, added in the same original migration. Every
  read path that filters on `next_retry_at` (`RetrySchedulerService` /
  `DeliveryRepository` in the worker) always filters on `status` first; the one
  query that sorts by `next_retry_at` without a `status` predicate is driven by
  an `id IN (...)` primary-key list, not this index. No query plan can ever
  prefer the narrower index over the composite one. See the migration file for
  the full evidence trail.

**Trimmed while already rewriting the table's indexes**
(`V052__partition_delivery_attempts.sql`):
- `idx_delivery_attempts_created_at (created_at)` — not recreated on the new
  partitioned parent. It's a strict left-prefix of
  `idx_delivery_attempts_cleanup (created_at, http_status_code)` (no narrowing
  `WHERE` clause on the narrower one), so any `created_at`-range query the
  dropped index could serve, the wider one serves too.

**Reviewed, kept — plausible but not confidently provable without production
traffic data** (documented here rather than acted on blind):
- `idx_deliveries_status` vs. `idx_deliveries_retry_query (status,
  next_retry_at) WHERE next_retry_at IS NOT NULL` — the composite is a
  *partial* index, so it cannot serve an unrestricted `WHERE status = ?` that
  needs rows regardless of `next_retry_at` nullability. Keeping both is very
  likely correct, but confirm with `pg_stat_user_indexes.idx_scan` on
  `idx_deliveries_status` before ever removing it.
- `idx_deliveries_endpoint_seq (endpoint_id, sequence_number) WHERE status IN
  ('PENDING','PROCESSING')` vs. `idx_deliveries_endpoint_pending_seq
  (endpoint_id, sequence_number, created_at) WHERE status = 'PENDING' AND
  ordering_enabled = true` — overlapping but not identical predicates
  (`PROCESSING` rows and non-ordering `PENDING` rows are each covered by only
  one of the two). Given this codebase's FIFO-ordering bug history,
  don't touch either without a dedicated look at `OrderingBufferService`'s
  query patterns.
- `idx_events_project_id (project_id)` vs. the wider `idx_events_project_id_id
  (project_id, id)` (added later, V022, for a narrow `EXISTS` check) — the
  wider index can technically serve a plain `project_id = ?` filter too, but a
  narrower single-column index is normally *cheaper* per index tuple for a
  pure equality lookup with no need for the trailing column, so removing the
  original isn't a clear win the way the `delivery_attempts`/`deliveries`
  removals above are. Left alone.

For a broader pass across the remaining ~140 non-hot-table indexes: query
`pg_stat_user_indexes` in production (`idx_scan`, `idx_tup_read`) after a
representative traffic window and treat `idx_scan = 0` over that window as the
starting candidate list, not a decision — some of those indexes back
low-frequency-but-critical paths (admin lookups, uniqueness enforcement) that
a scan count alone won't distinguish from genuinely dead weight.
