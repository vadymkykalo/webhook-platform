# P0-06 — One scheduler thread stalls platform-wide dispatch

- **Status:** DONE
- **Priority:** P0 — one-line fix, platform-wide impact
- **Branch:** `feature/P0-06-scheduler-thread-pool`
- **Depends on:** nothing
- **Modules:** `webhook-platform-api`, `webhook-platform-worker`

## The defect

Verified: neither module sets `spring.task.scheduling.pool.size`, and there is
no custom `TaskScheduler` bean anywhere:

```bash
grep -rn "scheduling" webhook-platform-api/src/main/resources/application.yml \
                      webhook-platform-worker/src/main/resources/application.yml
grep -rn "TaskScheduler\|ThreadPoolTaskScheduler" --include="*.java" \
     webhook-platform-api webhook-platform-worker
```
Both return nothing → Spring Boot's default scheduler pool size of **1**.

In the API that single thread is shared by
`OutboxPublisherService.publishPendingMessages` (every 1s, and it blocks up to
`outbox.publisher.batch-send-timeout-seconds = 30`),
`retryFailedMessages`, `cleanupOldMessages`, `WorkflowTriggerOutboxService.poll`
(2s), four billing crons, six data-retention crons,
`MaterializedViewRefreshService` (`REFRESH MATERIALIZED VIEW`, every 5 min), and
audit retention.

A 90-second materialized-view refresh on a large table means 90 seconds during
which **no event is published to Kafka for any tenant on the platform**.
ShedLock does not help — the bottleneck is the thread, not the lock.

Same shape in the worker: `DlqMonitoringService.java:70-73` blocks on
`AdminClient…get()` with no timeout, delaying `StuckDeliveryRecoveryService`.

## Steps

- [x] Reproduce first (cheap and convincing): add a temporary `@Scheduled` that
      sleeps 60s, then observe `outbox_publish_latency` / dispatch stopping.
      Remove the probe afterwards.
- [x] Set `spring.task.scheduling.pool.size` to at least 8 in **both**
      `application.yml` files, exposed as an env var in line with the repo's
      env-driven config convention (see `.env.dist`).
- [x] Consider a dedicated scheduler for `OutboxPublisherService` so no future
      cron can starve dispatch regardless of pool size. Say in the log whether
      you did this and why.
- [x] Add a timeout to the `AdminClient` call at `DlqMonitoringService.java:70-73`
      — an unbounded `.get()` on a scheduler thread is the same class of bug.
- [x] Re-check ShedLock coverage now that jobs can genuinely run concurrently:
      these are currently unguarded — `StaleDeliveryEscalationService.java:75`,
      `DlqMonitoringService.java:54`, `QueueDepthMetricsExporter.java:63`,
      `AuditLogRetentionJob.java:27`, `DeviceAuthService.java:125`,
      `DataRetentionService.java:205`, `TunnelService.java:170`. Most are
      read-mostly or `SKIP LOCKED`-guarded, but decide deliberately per job and
      record the decision. **This is the risk this task introduces — do not skip it.**

## Tests to write

- Extend `ShedLockConcurrencyTest` (exists, api module) to cover any job you add
  a lock to.
- A small context test asserting the configured scheduler pool size is > 1 in
  both modules — cheap, and it stops the regression coming back silently.

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest=ShedLockConcurrencyTest   # needs Docker
mvn test -pl webhook-platform-api -pl webhook-platform-worker
```

Manual:
```bash
make up && make wait-healthy
# drive steady ingestion; trigger the materialized-view refresh manually
# assert outbox dispatch latency does not flatline during the refresh
curl -s localhost:8080/actuator/prometheus | grep outbox_
```

## Definition of done

- [x] Scheduler pool > 1 in both modules, env-configurable.
- [x] A long-running cron no longer stalls outbox dispatch (shown by metrics).
- [x] ShedLock decision recorded for each of the seven unguarded jobs.

## Progress log

**Fix:**
- Added `spring.task.scheduling.pool.size: ${SCHEDULING_POOL_SIZE:8}` to both
  `webhook-platform-api/src/main/resources/application.yml` and
  `webhook-platform-worker/src/main/resources/application.yml`. Wired
  `SCHEDULING_POOL_SIZE` (default `8`) through `.env.dist` and both services in
  `docker-compose.yml`, matching the repo's env-var convention.
- `DlqMonitoringService`: all three unbounded `AdminClient` `.get()` calls
  (`describeTopics`, two `listOffsets`) now use `.get(timeoutSeconds, SECONDS)`,
  configurable via `dlq.monitoring.admin-client-timeout-seconds` (default 10s,
  env `DLQ_MONITORING_ADMIN_CLIENT_TIMEOUT_SECONDS`). The existing outer
  `catch (Exception e)` already covers the checked `TimeoutException`.

**Dedicated scheduler for OutboxPublisherService — decided NOT to add one.**
Reasoning: (1) raising the shared pool from 1→8 already gives dispatch seven
other free threads even if one cron misbehaves — the actual defect (a single
90s+ MV refresh occupying the *only* thread) is gone regardless of which job
happens to be slow; (2) `OutboxPublisherService`'s own lock already carries the
tightest bound among the cron-like jobs (`lockAtMostFor = PT30S`), so a stuck
run self-heals fast; (3) giving one job a private `TaskScheduler` means either
bypassing `@Scheduled`/`@SchedulerLock` (ShedLock's Spring integration is AOP
around `@Scheduled`-annotated methods, so manual scheduling would mean
reimplementing the distributed-lock call by hand — a real risk in a
multi-replica API deployment) or reaching for `SchedulingConfigurer`, which is
materially more surface area and testing burden than an 8-thread shared pool
buys back for a job already this well-bounded. Revisit if a future job without
a tight `lockAtMostFor` gets added to the shared pool.

**ShedLock decisions for the seven listed jobs** (worker jobs are naturally
safe across the two running worker replicas too, not just within one JVM):

| Job | Trigger | Decision | Why |
|---|---|---|---|
| `StaleDeliveryEscalationService.java:75` | `fixedDelay` | No lock | `fixedDelay` can never overlap itself (Spring reschedules from completion, regardless of pool size); `findStaleDeliveryIds` uses `FOR UPDATE SKIP LOCKED`, so concurrent runs across worker replicas can't double-process the same row. |
| `DlqMonitoringService.java:54` | `fixedDelay` | No lock | Read-only Kafka AdminClient calls into a per-instance `AtomicLong` gauge; nothing written to shared state. Added the AdminClient timeout instead (the actual bug here). |
| `QueueDepthMetricsExporter.java:63` | `fixedDelay` | No lock | Pure `COUNT(*)` reads into per-instance gauges — no shared state to corrupt. |
| `AuditLogRetentionJob.java:27` | **`cron`** | **Added `@SchedulerLock`** | Unlike the others this is a cron, not `fixedDelay` — with a wider pool and multiple API replicas it can genuinely fire concurrently. `deleteByCreatedAtBefore` is idempotent either way, but every *other* retention job in `DataRetentionService`/`RetentionCleanupScheduler` is already locked for the same reason (avoid redundant duplicate DELETE work across replicas); leaving this one bare was already an inconsistency independent of P0-06. |
| `DeviceAuthService.java:125` | `fixedDelay` | No lock | `expireOldCodes` is a single idempotent bulk `UPDATE ... WHERE status='PENDING' AND expires_at < :now` — concurrent runs just both match a shrinking/disjoint row set. |
| `DataRetentionService.java:205` (`refreshTableSizeMetrics`) | `fixedDelay` | No lock | Pure read (`estimatedRowCount`) into per-instance gauges. |
| `TunnelService.java:170` | `fixedDelay` | No lock | Same shape as `DeviceAuthService` — idempotent bulk `UPDATE ... WHERE status='ACTIVE' AND last_heartbeat < :threshold`. |

**Related but out-of-scope discovery:** while wiring up the `AuditLogRetentionJob`
ShedLock test, `auditLogRetentionJob.purgeOldAuditLogs()` threw
`InvalidDataAccessApiUsageException: For queries with named parameters you need
to provide names for method parameters` — `AuditLogRepository.deleteByCreatedAtBefore`
had a `@Query("... :cutoff ...")` with no `@Param("cutoff")` on the method
parameter, and the project isn't compiled with `-parameters`. **This meant the
audit-log retention cron has been silently failing on every single run** (not
an edge case — 100% failure rate), so audit logs were never actually purged.
Fixed this one line since it directly blocked the test this task requires me to
write, in the exact file I already touched for the lock. A follow-up scan (see
next paragraph) found the same pattern elsewhere; those are **not** fixed here.

Asked a subagent to scan both modules for the same pattern (`@Query` with a
named `:param` where the method parameter has no matching `@Param`). Found 3
more real instances (105 total `@Query` methods with named parameters
checked): `DeviceAuthCodeRepository.expireOldCodes` (worker for the
`DeviceAuthService.java:125` job above — but `@Modifying` bulk UPDATE, so still
no lock needed even once fixed), `TunnelSessionRepository.expireStale` (same
shape as `TunnelService.java:170` above), and
`TunnelRequestLogRepository.deleteByCreatedAtBefore`,
`WorkflowRepository.findEnabledWebhookWorkflows` (unrelated to this task's job
list). Net effect: `DeviceAuthService.cleanupExpiredCodes` and
`TunnelService.cleanupStaleSessions` are *also* currently silent no-ops in
production — expired device-auth codes and stale tunnel sessions are never
actually cleaned up. **Left unfixed — this deserves its own task** (it's a
correctness bug with no relation to scheduler pool sizing; the worker module's
20+ `@Query` methods were all clean, so this is api-module-specific). Worth a
`-parameters` javac flag audit too, since that would fix the whole class of
bug at once instead of one `@Param` at a time.

**Reproduce-first probe** (temporary, removed after confirming): a throwaway
`ReproduceSchedulerStallProbeTest` used a bare `ThreadPoolTaskScheduler` with
`setPoolSize(1)` (Spring Boot's undocumented default), one `fixedDelay(200ms)`
"dispatch" tick counter and one one-shot 3s "slow job" — the same shape as
`OutboxPublisherService`'s poll racing `MaterializedViewRefreshService`'s
refresh. Over a 3.3s window:

```
[PROBE] dispatch ticks observed with pool size 1: 3 (expected ~16 with no stall;
the slow job monopolizes the single thread)
```

3 ticks instead of ~16 — the single thread is monopolized by the slow job for
its whole duration, exactly the described bug. Probe deleted after confirming.

**Tests added:**
- `SchedulingPoolSizeTest` (api and worker, `.../config/`) — resolves the real
  `spring.task.scheduling.pool.size` value out of each module's own
  `application.yml` (via `YamlPropertySourceLoader`, not a hardcoded
  duplicate), feeds it into a Spring Boot `ApplicationContextRunner` running
  only `TaskSchedulingAutoConfiguration`, and asserts the resulting
  `ThreadPoolTaskScheduler`'s **core** pool size (`getPoolSize()` reports *live*
  threads, which is 0 until a task actually runs — had to switch to
  `getScheduledThreadPoolExecutor().getCorePoolSize()`) is `> 1`. No Docker, no
  DB, ~0.4s. Confirmed red by temporarily deleting the `application.yml` block
  (`spring.task.scheduling.pool.size must be set in application.yml`), then
  green after restoring it.
- `ShedLockConcurrencyTest.testAuditLogRetentionPurgesOnlyOldEntries` — the one
  job this task added a lock to. Inserts one audit-log row past the 90-day
  default retention and one recent row, calls `purgeOldAuditLogs()` through the
  ShedLock-wrapped Spring proxy, asserts only the old row is gone. Didn't
  attempt a genuine concurrent-overlap race test — the job is a single fast
  `DELETE` with nothing observable mid-flight, and `deleteByCreatedAtBefore` is
  idempotent regardless of whether the lock actually excluded a second caller,
  so a race test would mostly exercise ShedLock's own test suite rather than
  this codebase.

**Verification output:**

```
mvn test -pl webhook-platform-api -Dtest=ShedLockConcurrencyTest
Tests run: 2, Failures: 0, Errors: 0, Skipped: 0   (testPerDeliveryLimitEnforcement + the new audit-log test)

mvn test -pl webhook-platform-api -Dtest=SchedulingPoolSizeTest
mvn test -pl webhook-platform-worker -Dtest=SchedulingPoolSizeTest
Tests run: 1, Failures: 0, Errors: 0 (both modules)

mvn test -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'   (whole repo)
Reactor Summary: Common/API(67)/Worker(67 total incl. new test)/CLI all SUCCESS — BUILD SUCCESS

mvn test -Dtest='*RepositoryTest,*IntegrationTest,*IT,*ConcurrencyTest,*RbacTest,*IsolationTest' -DfailIfNoTests=false
webhook-platform-api: Tests run: 147, Failures: 3 — all 3 are the pre-existing
AuthContextIntegrationTest audit-log-endpoint failures already confirmed
unrelated to this branch during P0-05 (reproduce identically on unmodified
develop); the new ShedLockConcurrencyTest test is among the 147 and passed.
mvn test -pl webhook-platform-worker -Dtest='*RepositoryTest,*IntegrationTest,*IT,*ConcurrencyTest,*RbacTest,*IsolationTest' -DfailIfNoTests=false
Tests run: 7, Failures: 0, Errors: 0 — BUILD SUCCESS
```

**Manual verification** (`make up`, rebuilt images with the fix):
`docker exec webhook-platform-api-1 env` confirms `SCHEDULING_POOL_SIZE=8`
reaches the container. `/actuator/prometheus` (JWT-authed — it's behind
`.requestMatchers("/actuator/**").authenticated()`):

```
executor_pool_size_threads{name="taskScheduler",} 8.0
```

— the live app's scheduler bean really has 8 threads, not 1. Sent an event,
confirmed dispatch: `outbox_publish_latency_seconds_count 1.0`,
`outbox_queue_depth{status="pending"} 0.0`. Manually ran
`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_delivery_stats` directly against the
DB (toy data volume, so it completes in well under a second — a genuine 90s
refresh isn't reproducible without a large table, so this checks the
mechanism, not the original timing), then immediately sent another event:
`POST /api/v1/events` returned `201` in `0.027s`, and
`outbox_publish_latency_seconds_count` went `1.0 → 2.0` with
`outbox_queue_depth` staying at `0` throughout — dispatch kept working
immediately after and during the refresh window, not 90s behind it.

**Left out of scope:** the `@Param` bug in `DeviceAuthCodeRepository`,
`TunnelSessionRepository`, `TunnelRequestLogRepository`, and
`WorkflowRepository` (see above) — flagged for a follow-up task, not fixed.
