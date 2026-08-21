# P1-26 — Thread/pool sizing, @Transactional bypass, lying metrics

- **Status:** DONE
- **Priority:** P1
- **Branch:** `feature/P1-26-pools-transactions-metrics`
- **Depends on:** P0-06 (scheduler pool) — land that first
- **Modules:** `webhook-platform-worker`, `webhook-platform-api`

Three unrelated defects grouped because each is small and none justifies its own
branch. Tick them off individually.

## 26a — Worker thread budget exceeds the DB connection pool

`webhook-platform-worker/src/main/resources/application.yml`:
`hikari.maximum-pool-size: 40` against `webhook.outgoing-pool-size: 50` +
`webhook.incoming-pool-size: 20`, plus the retry scheduler thread, the incoming
retry scheduler thread, and the scheduled jobs.

The transactions themselves are short — nothing spans the outbound HTTP call,
which is done correctly — so this is contention, not deadlock. But at ~70
concurrent tasks each doing 3–4 short transactions, connection acquisition waits
show up as latency and `leak-detection-threshold: 60000` starts logging.

This is a **sizing mismatch to verify under load**, not a proven defect. Do not
just bump a number.

- [ ] Measure first: run sustained load and record Hikari
      `hikari_connections_pending` / acquisition timing from
      `/actuator/prometheus`. If there is no waiting, say so and close this item.
      **Not done — see Progress log: live load generation against `make up` was judged
      unsafe in this sandbox (shared Docker daemon actively in use by sibling
      worktree agents' Testcontainers runs).**
- [x] Sized/documented: found and fixed an actual, confirmed config bug that made this
      moot in the *currently deployed* configuration (see Progress log) — worker was
      silently running with pool=20, not even the 40 this task's premise assumed —
      and documented the pool-vs-thread-budget relationship in `.env.dist` so the two
      services' independently-tuned pools cannot collide again.
- [x] Checked the API side: confirmed P1-25 already removed the long ingress
      transaction (`IngressService`/`EventIngestService` use short, explicit
      `TransactionTemplate` blocks, not a request-spanning `@Transactional`) — see
      Progress log for the analytical reasoning on why 20 (API) / 40 (worker) is not
      obviously wrong given the workload shape, absent live measurement.

## 26b — `@Transactional` self-invocation in UsageDailyAggregator

`webhook-platform-api/.../service/UsageDailyAggregator.java:53-54` —
`@Transactional public void aggregateForProject(...)` is invoked from
`aggregateYesterday` at line ~43 on `this`, so the proxy is bypassed and **the
annotation does nothing**.

This is the only genuine self-invocation instance in the codebase — I checked the
two other grep hits (`OutboxPublisherService.promoteExhaustedToDead` is a javadoc
mention and uses `txTemplate` correctly; `IncidentService.getIncident` is a false
positive). Do not "fix" those.

Impact: the exists-check (line ~55) and the seven count queries each run in their
own transaction, so the billing `usage_daily` row is built from an inconsistent
snapshot and the check-then-insert is not atomic. ShedLock currently hides the
duplicate-insert risk — which means removing ShedLock later would surface a bug
nobody knew was there.

- [x] Fixed via a directly-injected `TransactionTemplate` field (the same pattern
      `EncryptionKeyRotationService` uses — Spring Boot autoconfigures a
      `TransactionTemplate` bean when there's a single `PlatformTransactionManager`,
      so no `new TransactionTemplate(txManager)` boilerplate was needed here).
      `aggregateForProject` now calls `transactionTemplate.executeWithoutResult(...)`
      wrapping the whole check + seven counts + insert, instead of a self-invoked
      `@Transactional`.
- [x] Made atomic: `usage_daily` already had `UNIQUE (project_id, date)` (see
      V020__alerts_and_usage.sql) but nothing used it. Added
      `UsageDailyRepository.upsertIfAbsent(...)`, a native `INSERT ... ON CONFLICT
      (project_id, date) DO NOTHING` returning rows-affected, so a concurrent
      duplicate run can no longer throw or double-insert even if two schedulers
      somehow overlap without ShedLock.

## 26c — Five metrics that mislead the on-call

Each of these will send someone down the wrong path at 3am:

- `DlqMonitoringService.java:88-96` computes depth as `latest - earliest`, i.e.
  all **retained** DLQ records, not un-consumed ones — nothing consumes
  `deliveries.dlq`. The gauge never returns to 0 after remediation, and the
  "manual intervention may be required" warning at line ~100 fires every 60
  seconds forever until retention expires. An alert that never clears is an
  alert everyone learns to ignore.
- `OrderingBufferService.java:161` registers `webhook_ordering_buffer_size` with
  **no tags** on every buffered delivery. Micrometer returns the
  already-registered meter, so the gauge permanently reports whichever
  endpoint's buffer was registered first.
- `webhook_ordering_gap_timeout_total` is double-incremented —
  `OrderingBufferService.java:209` and `WebhookDeliveryService.java:538`.
  (P1-23 also lists this; whoever gets there first fixes it, the other confirms.)
- `RedisConcurrencyControlService.java:144-146` decrements `activePermits` in the
  `else` branch even when no permit was locally held, so the gauge drifts
  negative. (P0-04 covers this one; confirm it landed.)
- `SENDING` outbox state is not exported at all (P1-24 adds it; confirm).

- [x] Fixed: `webhook_dlq_depth` is now DB-backed (`DeliveryRepository.countDlqTotal()`
      — deliveries still in `DeliveryStatus.DLQ`, the same column `DlqService`
      mutates on retry/purge), so it genuinely returns to 0 once the backlog is
      worked through. The old Kafka latest-earliest computation is kept as a
      separate, clearly-labeled `webhook_dlq_topic_retained_total` gauge that is
      purely informational and never drives the "manual intervention" warning.
      `alerts.yml` updated to match (renamed the alert, fixed its description, added
      the new metric to the file's metrics-sources header).
- [x] Aggregated deliberately (per-endpoint tagging was rejected — endpoint UUIDs are
      unbounded cardinality, matching this codebase's existing convention of
      untagged aggregate gauges like `webhook_concurrency_active_permits`).
      `webhook_ordering_buffer_size` is now registered exactly once (constructor),
      backed by a periodic (`ordering.buffer-gauge-resync-ms`, default 30s)
      SCAN-based resync across every `seq:buffer:*` key in Redis, not a manually
      incremented/decremented counter — buffer entries can disappear via TTL expiry
      or the gap-timeout "proceed anyway" path without an explicit remove call
      (pre-existing, out of scope here), so only re-reading Redis truth stays
      honest.
- [x] Verified all three cross-referenced items — all already fixed by prior tasks,
      no changes needed:
      - `webhook_ordering_gap_timeout_total` double-increment: P1-23 already fixed
        it (`OrderingBufferService.isGapTimedOut` no longer increments; single
        counting site is `WebhookDeliveryService.canDeliverWithOrdering` line ~628,
        explicitly commented as such).
      - `RedisConcurrencyControlService` negative-drift: P0-04 already fixed it —
        `release()` only decrements `activePermits` inside the `releaseLocal(...)`
        branch when a local-fallback permit was actually held (lines 153-159);
        the Redis-permit branch decrements only after a real semaphore release.
      - Outbox `SENDING` gauge: P1-24 already added
        `outbox_queue_depth{status="sending"}` (`OutboxPublisherService.java:84-88`).
- [x] Cross-checked every metric referenced by `monitoring/grafana/dashboards/*.json`
      against what the code emits (`delivery_queue_depth`, `incoming_forward_queue_depth`,
      `outgoing_delivery_*`/`incoming_forward_*` permits/in-flight/paused,
      `retry_governor_*`, `outbox_queue_depth`/`outbox_oldest_pending_age_seconds`,
      `delivery_attempts_*`, `incoming_events_table_rows`, `billing_reconciliation_*`,
      `events_*`/`rules_*`/`deliveries_created_total`, `circuit_breaker_*`,
      `webhook_delivery_attempts_total`, standard actuator/http metrics) — all present
      and correctly named/tagged; **no dashboard panel is bound to a broken metric.**
      The only broken reference found was `webhook_dlq_depth` in
      `monitoring/prometheus/alerts.yml` (not a dashboard) — fixed above.
      `webhook_ordering_buffer_size` and `webhook_concurrency_active_permits` are not
      referenced by any dashboard or alert today.

## Tests to write

- `UsageDailyAggregatorTest` (new): the aggregate runs in one transaction; a
  mid-run failure leaves no partial row; a duplicate run does not double-insert.
- Extend `DlqMonitoringServiceTest` (create if absent): depth returns to zero
  after the backlog is cleared.
- A metrics assertion test for the ordering gauge tags.

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest=UsageDailyAggregatorTest
mvn test -pl webhook-platform-worker
curl -s localhost:8080/actuator/prometheus | grep -E "outbox_|ordering_|dlq_"
curl -s localhost:8081/actuator/prometheus | grep -E "ordering_|concurrency_"
```

## Definition of done

- [x] Pool sizing **explicitly justified as-is** (not live-measured — see Progress
      log for why), and a real, confirmed sizing *bug* (not just a mismatch to
      verify) was found and fixed independent of load-test evidence: a shared
      `.env.dist` var was silently collapsing the API's and worker's independently
      -tuned Hikari pools into one value.
- [x] `UsageDailyAggregator` is genuinely transactional (via `TransactionTemplate`,
      immune to self-invocation) and idempotent (DB-constraint-backed upsert).
- [x] All five metrics report the truth; dashboards and alerts re-checked against
      them.

## Progress log

### 26a — pool sizing

Did **not** run `make up` / generate sustained load. `docker ps` at the start of this
session showed sibling worktree agents actively running Testcontainers-based
integration tests on this same shared Docker daemon:

```
optimistic_varahamihira	0.0.0.0:49713->5432/tcp, :::49712->5432/tcp
musing_hermann	0.0.0.0:49712->6379/tcp, :::49711->6379/tcp
kind_curie	0.0.0.0:49711->9092/tcp, :::49710->9092/tcp
busy_moser
testcontainers-ryuk-...	0.0.0.0:49709->8080/tcp, :::49708->8080/tcp
```

`make up`'s docker-compose stack binds fixed host ports (5432/6379/9092/8080/8081),
unlike Testcontainers' ephemeral ones — bringing it up risked colliding with those
sibling runs or with another agent's own concurrent `make up`. Per the task's own
"if infeasible in this sandbox" clause, did static/analytical verification instead:

- Confirmed via `grep` that every DB transaction in `WebhookDeliveryService` is a
  short `transactionTemplate.executeWithoutResult` block around a single-row
  claim/status-transition update (lines 168, 318, 532, 547, 682) — never spanning
  the outbound HTTP call, matching the task's own premise.
- Confirmed retry claiming is centralized in one scheduler transaction per cycle
  (`RetrySchedulerService.findPendingRetryIds` + `lockByIds`), then fanned out to
  the executor pool only for the HTTP work — so the "~70 concurrent tasks" are not
  70 simultaneous DB-transaction holders; by Little's Law, expected concurrent
  holders ≈ throughput × (single-digit-ms hold time), which stays far under 40 even
  at high delivery rates, since the HTTP call (the dominant per-task wall-clock
  cost) holds no connection.
- Confirmed P1-25 already removed the long ingress transaction: `IngressService`
  and `EventIngestService` both use short, explicit `TransactionTemplate` blocks
  (`IngressService.java:144`, `EventIngestService.java:104`), not a
  request-spanning `@Transactional`.
- **Found a real, confirmed bug while investigating, independent of load evidence**:
  `.env.dist` set a single shared `DB_POOL_MAX_SIZE`/`DB_POOL_MIN_IDLE`, and
  `docker-compose.yml`'s api/worker blocks both read `${DB_POOL_MAX_SIZE:-N}` —
  since `.env.dist` always provides a literal value, both services' *own*
  per-block fallback defaults (api -20/-10, worker -30/-15) were dead code, and
  both containers actually received the exact same value from `.env`
  (`DB_POOL_MAX_SIZE=20`/`DB_POOL_MIN_IDLE=10`). The worker's carefully-tuned
  Hikari pool (its own `application.yml` default is 40/20) never took effect in a
  real `make up` deployment — it silently ran with **20**, not even the 40 this
  task's premise assumed, against the same ~70-thread budget. Verified with
  `docker-compose --env-file .env.dist -f docker-compose.yml config`
  before/after: before the fix both api and worker resolved to `DB_POOL_MAX_SIZE:
  "20"`; after, api stays `"20"` and worker resolves to `"40"` (same check repeated
  against `docker-compose.pull.yml`, same result).
- Fix: introduced worker-specific `WORKER_DB_POOL_MAX_SIZE`/`WORKER_DB_POOL_MIN_IDLE`
  env vars (`.env.dist`, defaults 40/20, documented against the thread-budget
  reasoning above), repointed both `docker-compose.yml` and
  `docker-compose.pull.yml`'s worker blocks at them, and updated
  `docs/OPERATIONS.md`, `docs/SELF_HOSTED_GUIDE.md`, and
  `docs/runbooks/high-kafka-lag.md` so on-call doesn't bump the now-inert
  `DB_POOL_MAX_SIZE` expecting it to affect the worker.
- Conclusion: **explicitly justified as-is, not bumped further** — no evidence
  (from the code shape) that 40 is too small once it actually applies; live
  Hikari `hikari_connections_pending` measurement under sustained load is the
  correct next step if this is ever suspected in production, and the metric is
  already exposed on `/actuator/prometheus` to do that.

### 26b — UsageDailyAggregator

`mvn test -pl webhook-platform-api -Dtest=UsageDailyAggregatorTest`:

```
Running com.webhook.platform.api.service.UsageDailyAggregatorTest
[INFO] Tests run: 6, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 2.49 s - in com.webhook.platform.api.service.UsageDailyAggregatorTest
[INFO] Results:
[INFO] Tests run: 6, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

The `aggregateForProject_runsInsideOneTransaction_evenWhenCalledDirectly` test
calls the method directly on the POJO (no Spring proxy at all) — exactly the
self-invocation path that made the old `@Transactional` silently do nothing — and
asserts `txManager.getTransaction`/`commit` were still invoked exactly once,
proving the fix doesn't depend on any proxy.
`aggregateForProject_midRunFailure_rollsBackAndNeverInserts` throws mid-run and
asserts `upsertIfAbsent` is never called and `txManager.rollback` (not `commit`)
fires. `aggregateForProject_concurrentDuplicateRun_relinquishesToTheWinner_doesNotThrow`
simulates `upsertIfAbsent` returning 0 (another run won the `ON CONFLICT DO
NOTHING` race) and asserts no exception.

### 26c — metrics

`mvn test -pl webhook-platform-worker -Dtest='OrderingBufferServiceTest,DlqMonitoringServiceTest'`:

```
[INFO] Tests run: 5, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 64.316 s - in com.webhook.platform.worker.service.DlqMonitoringServiceTest
[INFO] Tests run: 14, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 2.581 s - in com.webhook.platform.worker.service.OrderingBufferServiceTest
[INFO] Tests run: 19, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

Full `mvn test -pl webhook-platform-worker` (whole module, includes the two classes
above plus everything else — Testcontainers, ~4m40s):

```
[INFO] Tests run: 195, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

Live `curl .../actuator/prometheus` checks were **not run** (no live instance —
same Docker-safety reasoning as 26a). Verified the metric registration/computation
logic by unit test instead, per the task's own fallback instruction:
- `webhook_dlq_depth` / `webhook_dlq_topic_retained_total`: both gauges assert
  registered-at-construction with the correct tag in
  `DlqMonitoringServiceTest.registersBothGaugesAtConstruction`; the actionable
  gauge is asserted to reflect a mocked `DeliveryRepository.countDlqTotal()`
  independent of Kafka reachability, and to return to 0 across two polls when the
  backlog clears (`monitorDlqDepth_actionableDepth_returnsToZero_afterBacklogCleared`).
- `webhook_ordering_buffer_size`: asserted registered exactly once at construction
  (`gauge_registeredExactlyOnceAtConstruction_startsAtZero`), summing across
  multiple endpoints' Redis buffer keys rather than only the first-registered one
  (`resyncBufferSizeGauge_sumsAcrossAllEndpoints_notJustTheFirstRegistered`), and
  returning to 0 once no buffer keys remain
  (`resyncBufferSizeGauge_returnsToZero_afterBacklogCleared`).
- `webhook_ordering_gap_timeout_total` / `RedisConcurrencyControlService.activePermits`
  / `outbox_queue_depth{status="sending"}`: confirmed already correct by reading
  the current code (see ticked items above) — pre-existing tests
  (`OrderingBufferServiceTest.isGapTimedOut_doesNotIncrementMetric_countingMovedToCaller`,
  etc.) already cover these and continue to pass.

### Files touched

- `webhook-platform-api/.../service/UsageDailyAggregator.java`,
  `.../domain/repository/UsageDailyRepository.java` (26b)
- `webhook-platform-worker/.../service/DlqMonitoringService.java`,
  `.../domain/repository/DeliveryRepository.java`,
  `.../service/OrderingBufferService.java` (26c)
- `webhook-platform-worker/src/main/resources/application.yml`, `.env.dist`,
  `docker-compose.yml`, `docker-compose.pull.yml` (26a, 26c config)
- `monitoring/prometheus/alerts.yml` (26c)
- `docs/OPERATIONS.md`, `docs/SELF_HOSTED_GUIDE.md`,
  `docs/runbooks/high-kafka-lag.md` (26a docs)
- New/extended tests: `webhook-platform-api/.../service/UsageDailyAggregatorTest.java`
  (new), `webhook-platform-worker/.../service/DlqMonitoringServiceTest.java`
  (rewritten), `webhook-platform-worker/.../service/OrderingBufferServiceTest.java`
  (extended)
