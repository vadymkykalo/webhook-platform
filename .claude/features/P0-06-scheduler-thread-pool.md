# P0-06 — One scheduler thread stalls platform-wide dispatch

- **Status:** TODO
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

- [ ] Reproduce first (cheap and convincing): add a temporary `@Scheduled` that
      sleeps 60s, then observe `outbox_publish_latency` / dispatch stopping.
      Remove the probe afterwards.
- [ ] Set `spring.task.scheduling.pool.size` to at least 8 in **both**
      `application.yml` files, exposed as an env var in line with the repo's
      env-driven config convention (see `.env.dist`).
- [ ] Consider a dedicated scheduler for `OutboxPublisherService` so no future
      cron can starve dispatch regardless of pool size. Say in the log whether
      you did this and why.
- [ ] Add a timeout to the `AdminClient` call at `DlqMonitoringService.java:70-73`
      — an unbounded `.get()` on a scheduler thread is the same class of bug.
- [ ] Re-check ShedLock coverage now that jobs can genuinely run concurrently:
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

- [ ] Scheduler pool > 1 in both modules, env-configurable.
- [ ] A long-running cron no longer stalls outbox dispatch (shown by metrics).
- [ ] ShedLock decision recorded for each of the seven unguarded jobs.

## Progress log
