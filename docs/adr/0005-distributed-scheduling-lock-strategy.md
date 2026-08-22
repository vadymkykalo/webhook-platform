# 0005 — Three scheduling strategies: ShedLock, Redisson lock, and unlocked-because-idempotent

**Status:** Accepted

## Context

There are 35 `@Scheduled` methods across `api` and `worker`. Both run multi-replica, so
every one of them runs on every instance unless something prevents it. Three different
mechanisms are in use, and until this ADR nothing recorded which to reach for:

- **ShedLock** (24 methods, all in `api`): `@SchedulerLock` backed by a Postgres table via
  `ShedLockConfig`. `api` already owns the schema, so the lock table costs nothing extra.
- **Redisson `RLock`** (2 methods, both in `worker`): `StuckDeliveryRecoveryService` and
  `StuckForwardRecoveryService` hand-roll `tryLock(0, 30, SECONDS)` with a `finally`
  unlock. The `worker` module has no ShedLock dependency and no `LockProvider` bean; it
  does have Redisson, which it needs anyway for rate limiting, concurrency control and the
  ordering buffer.
- **No lock at all** (9 methods): concurrent execution is harmless.

A reader who does not know which category a new job falls into will copy whichever
neighbour they happen to open, and the failure mode of guessing wrong is a job that
double-runs in production and nowhere else.

## Decision

The rule is the *effect*, not the module:

1. **The job is not idempotent, or does bounded work that must not be duplicated** —
   draining a queue, deleting by cutoff, sending a notification. It needs a lock.
   - In `api`: `@SchedulerLock`, always with an explicit `lockAtMostFor` longer than the
     job's worst case and a `lockAtLeastFor` that outlives clock skew.
   - In `worker`: Redisson `RLock` with `tryLock(0, …)`, i.e. skip rather than queue.
2. **The job's own SQL already makes concurrent runs disjoint** — no lock. Two shapes
   qualify, and only these two:
   - a single idempotent set-based statement, where a second replica updates zero rows:
     `UPDATE … WHERE status = X AND ts < cutoff`,
     `TunnelService.cleanupStaleSessions`, `DeviceAuthService.cleanupExpiredCodes`;
   - a claim query using `FOR UPDATE SKIP LOCKED`, where replicas are handed disjoint
     row sets by Postgres itself. `StaleDeliveryEscalationService` is this case, and it
     matters: after selecting, it publishes a DLQ notification per row, so without
     `SKIP LOCKED` every replica would emit a duplicate alert for the same delivery.

   A read-then-mutate-then-write job **without** `SKIP LOCKED` is category 1, not
   category 2, however idempotent the write looks — the side effects after the write
   are not.
3. **The job only refreshes instance-local state or a per-instance metric** — no lock,
   and a lock would be actively wrong, because each replica needs its own refresh. This
   covers `RuleEngineService.refreshAll`, `OrderingBufferService.resyncBufferSizeGauge`,
   `QueueDepthMetricsExporter` and `DlqMonitoringService`.

`worker` does not gain a ShedLock dependency. Two hand-rolled locks is below the threshold
where a shared abstraction pays for itself, and adding ShedLock there would mean the worker
holding a JDBC `LockProvider` purely for scheduling.

## Consequences

- Reviewing a new `@Scheduled` method means asking which of the three cases it is. That
  question now has a written answer instead of a precedent to copy.
- An unlocked category-2 job that later grows a second statement, or any side effect
  outside the database, silently becomes a category-1 job. This is the one way the rule
  degrades, and it is not enforced by anything.
- The `api`/`worker` split of mechanisms is an artefact of dependencies, not of design. If
  `worker` ever needs a third lock, revisit and unify on ShedLock.

## Alternatives rejected

- **Lock everything, unconditionally.** Would break category 3 outright — a per-instance
  cache refresh guarded by a cluster-wide lock refreshes exactly one replica.
- **A single leader-elected scheduler instance.** Simpler to reason about, but couples
  unrelated jobs' availability together and makes the leader a capacity bottleneck for
  the outbox poller, which is on the delivery hot path.
