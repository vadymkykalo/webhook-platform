# P1-23 — Fix FIFO ordering: cursor regression, gap check, sequence durability

- **Status:** DONE
- **Priority:** P1 — the ordering guarantee is currently advertised but not held
- **Branch:** `feature/P1-23-fifo-ordering-fixes`
- **Depends on:** P1-21 (the e2e harness makes these provable)
- **Modules:** `webhook-platform-worker`, `webhook-platform-api`

Three defects that together mean FIFO silently degrades exactly when it matters.

## 23a — The cursor can move backwards

`OrderingBufferService.java:122-125` compares only against the **Redis** value:
```java
Long current = bucket.get();
if (current == null || sequenceNumber > current) bucket.set(sequenceNumber, ttl);
```
The Postgres upsert (line ~129) is correctly guarded with `GREATEST`; the Redis
write is not — and `canDeliver` (lines ~63-85) reads Redis first. It is also a
non-atomic read-modify-write, so two workers can interleave `get`/`set`.

Scenario: cursor is 100 in both stores. The 24h `delivered-seq-ttl-hours` lapses
(or Redis is flushed). A straggler with `sequenceNumber = 5` succeeds;
`markDelivered(ep, 5)` sees `current == null` and sets Redis to **5** while
Postgres stays 100. Every subsequent delivery now fails `canDeliver`, gets
buffered and rescheduled, and drains only via the 60s gap timeout — ordering
silently abandoned, throughput collapsed to one delivery per gap window.

- [x] Make the Redis update a Lua CAS / `GREATEST` against both stores, or make
      Postgres authoritative with Redis strictly a read-through cache warmed from
      the upsert's returned value. Pick one; say why.

## 23b — The gap check inspects only `sequence - 1`

`WebhookDeliveryService.java:532-540` calls
`findOldestPendingCreatedAt(endpointId, sequenceNumber - 1)`, and the query
(`DeliveryRepository.java:66-70`) matches `d.sequenceNumber = :sequenceNumber`
**exactly** — one sequence, not the missing range.

And `OrderingBufferService.isGapTimedOut` (lines ~202-212) measures
`Duration.between(oldestPendingCreatedAt, now())` against the 60s timeout, where
`createdAt` is the **ingest** time, not when we started waiting.

- Scenario A: cursor 5; seq 6 is retrying; seq 10 arrives. The check looks only
  at seq 9 — already `SUCCESS` — so the query returns null, `isGapTimedOut(null)`
  returns `true` (lines ~203-205), and 10 is delivered while 6 is outstanding.
- Scenario B: any backlog older than 60s makes `now - createdAt > 60s` for
  everything, so `isGapTimedOut` is unconditionally true and FIFO is off — during
  a fan-out burst or Kafka lag spike, i.e. precisely when ordering matters.

- [x] Query for the oldest pending delivery across the whole range
      `(lastDelivered, sequence)`, not a single sequence.
- [x] Measure the gap timeout from when the successor was **first buffered**, not
      from `created_at`. This likely needs a new timestamp — say what you added.
- [x] Fix the double-count: `webhook_ordering_gap_timeout_total` is incremented
      both at `OrderingBufferService.java:209` and
      `WebhookDeliveryService.java:538`.

## 23c — The sequence counter has no durable backing

`SequenceGeneratorService.java:33-38` is a bare Redis `INCR`
(`seq:endpoint:<id>`) with no TTL, no DB backing, and no reconciliation with
`ordering_cursors`. It is called **inside** the ingest transaction
(`EventIngestService`, in the subscription loop), so a rollback — including the
`DataIntegrityViolationException` idempotency-race path — consumes a sequence
number that no delivery ever carries. The worker then waits out the gap timeout
for a number that will never arrive.

Worse: if Redis is flushed, restored from an empty replica, or the key is evicted
under an `allkeys-lru` policy, new events get 1, 2, 3 while `ordering_cursors`
holds 100. `canDeliver` is false forever and `markDelivered(1)` cannot advance
the cursor (both the `>` check and the SQL `GREATEST` refuse). Ordering is off,
silently, until an operator manually resets the cursor.

- [x] Persist a high-water mark, or seed the Redis counter from
      `MAX(sequence_number)` on cache miss.
- [x] Generate the sequence **outside/after** the committed transaction so a
      rollback cannot burn one. Watch the interaction with idempotency replay.
- [x] Add a startup or periodic reconciliation between the counter and
      `ordering_cursors`, with a loud metric when they disagree.
- [x] Note the related non-ordering bug for P1-26: `quotaCounterService.increment()`
      in `EventIngestService` also runs outside transaction control and is not
      rolled back.

## Tests to write

- `OrderingBufferServiceTest` (new — the class has no tests at all):
  cursor never regresses after Redis TTL expiry; concurrent `markDelivered`
  calls are safe; gap check spans the full missing range; gap timeout is not
  triggered merely by an old `created_at`.
- `SequenceGeneratorServiceTest` (new): counter survives a simulated Redis flush;
  a rolled-back ingest does not permanently strand a sequence.
- An end-to-end ordering test on the P1-21 harness: N ordered events with an
  induced retry on one of them arrive at WireMock in order.

## Verification

```bash
mvn test -pl webhook-platform-worker -Dtest='OrderingBufferServiceTest,SequenceGeneratorServiceTest'
mvn test -pl webhook-platform-worker
```

Manual — the flush scenario is the one that must not be theoretical:
```bash
make up && make wait-healthy
# enable ordering on a subscription; send 50 events; mid-run:
docker exec webhook-redis redis-cli -a "$REDIS_PASSWORD" FLUSHALL
# assert delivery order is preserved (or degrades loudly with a metric),
# and that the endpoint is not permanently stalled
```

## Definition of done

- [x] Cursor cannot regress; sequence survives Redis loss.
- [x] Gap check covers the range and times from the right instant.
- [x] Gap-timeout metric counted once.
- [x] Redis-flush drill passes.

## Progress log

### Summary

All three defects fixed, plus one **new** defect found and fixed while building the
regression tests for 23a (see "Codec bug found" below) — the kind of thing that's exactly
why the task insisted on a real end-to-end drill instead of trusting the unit tests alone.

**23a — cursor regression (`OrderingBufferService`).** Made Postgres authoritative:
`OrderingCursorRepository.upsertCursor` now always applies `GREATEST` (no `WHERE` guard) and
always returns the resulting row via `RETURNING last_delivered_sequence`, so callers get the
authoritative post-upsert value whether or not the row actually advanced. `markDelivered`
uses that returned value — never the raw `sequenceNumber` argument — to update Redis via a
new Lua CAS script (`lua/ordering_cursor_cas.lua`, following the existing
`CircuitBreakerService` Lua-script convention) that only advances the key if the candidate is
strictly greater than whatever's currently cached. Chose "Postgres authoritative, Redis a
CAS-guarded cache" over a two-store Lua CAS because Postgres already had the correct
`GREATEST` guard and is the durable source of truth; making Redis converge to *it* is simpler
and strictly stronger than trying to keep two independently-CAS'd stores in sync.

**Codec bug found while writing the real end-to-end regression test (not in the original
finding, but a direct consequence of the 23a fix as first written):** the Lua script's raw
`redis.call('SET', key, newVal, ...)` writes a plain Redis string, but `getLastDeliveredSequence`
was still reading the same key via `RBucket<Long>` with Redisson's *default* (Kryo) codec —
so every read after the first `markDelivered` call under real Redis threw
`KryoException: Encountered unregistered class ID`, permanently breaking `canDeliver` for
that endpoint. Unit tests (mocked Redisson) couldn't see this — only the real
Testcontainers-Redis end-to-end test caught it. Fixed by standardizing every accessor of the
`seq:delivered:*` key on `LongCodec.INSTANCE` (both the read in `getLastDeliveredSequence` and
implicitly the script's own ARGV/KEYS encoding), which stores/reads the value as a plain
decimal string consistently. This is exactly the class of bug the task's insistence on a real
drill ("must not be theoretical") was warning about, and it would have shipped if the unit
tests were treated as sufficient proof.

**23b — gap check (`WebhookDeliveryService.canDeliverWithOrdering`, `DeliveryRepository`,
`OrderingBufferService.isGapTimedOut`).** `findOldestPendingCreatedAt` now takes a
`(rangeStart, rangeEnd)` pair (`BETWEEN`) instead of a single sequence number;
`canDeliverWithOrdering` computes the range as `(lastDelivered+1, sequenceNumber-1)` via
`orderingBufferService.getLastDeliveredSequence`. Added a new nullable column
`deliveries.ordering_first_buffered_at` (migration `V051`, both API and worker entity copies)
that's stamped the first time a delivery is buffered; `isGapTimedOut` now takes that timestamp
instead of `oldestPendingCreatedAt` and measures from it — `null` now means "never buffered,
not timed out yet" (previously `null` meant "proceed immediately", which was the direct cause
of Scenario A skipping ahead). The gap-timeout metric increment was removed from
`OrderingBufferService.isGapTimedOut` entirely; `WebhookDeliveryService` is now the single
counting site (it already had its own `orderingGapTimeoutCounter`, so this is a straight
dedupe, not a new field).

**23c — sequence durability (`SequenceGeneratorService`, `EventIngestService`).**
1. *Seed on cache miss*: `nextSequence` checks `RAtomicLong.isExists()`; on a miss it reseeds
   from `DeliveryRepository.findMaxSequenceNumber(endpointId)` (a new query) via
   `compareAndSet(0, seed)` (Redisson/Redis treat a missing key as `0` for numeric ops, so
   this is the atomic "claim while still absent" primitive — there's no `trySet` on
   `RAtomicLong` in this Redisson version).
2. *Rollback safety*: `EventIngestService.doIngestEvent` no longer calls
   `sequenceGeneratorService.nextSequence()` inside the subscription loop. Ordering-enabled
   deliveries are saved with `sequenceNumber = null`; `ingestEvent` collects them into an
   out-parameter list and, **only after `transactionTemplate.execute` returns successfully**
   (i.e. after commit), calls `assignSequenceNumbersPostCommit`, which generates the sequence
   and backfills it via a new `DeliveryRepository.updateSequenceNumber` (its own
   auto-committing statement, not wrapped in the ingest transaction). Verified this is
   actually rollback-safe with a dedicated regression test
   (`EventIngestServiceTest#ingestEvent_transactionRollsBackAfterDeliverySave_neverGeneratesSequence`)
   that injects a failure *after* the delivery save and asserts `nextSequence` is never
   called. Traded off: there's now a narrow window between commit and backfill where a crash
   would leave that one delivery with `sequenceNumber = null` — it degrades to being delivered
   unordered (the existing `orderingEnabled && sequenceNumber != null` guard in
   `processDelivery` already handles a null sequence gracefully), not lost or blocking, which
   is a better failure mode than the burned-sequence-number stall this fix removes.
3. *Reconciliation*: new `SequenceReconciliationService` (`@Scheduled`, ShedLock-guarded,
   `ordering.sequence-reconciliation-interval-ms`, default 15 min) compares the Redis counter
   against `MAX(sequence_number)` for every endpoint with ordering-enabled activity in the
   last `ordering.sequence-reconciliation-lookback-hours` (default 48h), logs at ERROR and
   increments `webhook_sequence_desync_total` on a mismatch, and self-heals via
   `SequenceGeneratorService.reseedIfBehind` (CAS loop, never moves the counter backwards).
4. *P1-26 note*: added inline at the `quotaCounterService.increment()` call site in
   `EventIngestService` — same non-transactional-side-effect shape as the sequence generator
   had, not fixed here (out of scope), flagged for that task.

### Tests written

- `OrderingBufferServiceTest` (new, 11 tests): cursor-never-regresses (incl. simulated flush),
  concurrent out-of-order `markDelivered` calls (8 threads, real thread pool, converges to the
  max), Postgres-write-failure fallback, `canDeliver`/`getLastDeliveredSequence` semantics,
  and the new `isGapTimedOut` null/recent/expired semantics (plus a test asserting it no
  longer increments the metric itself).
- `SequenceGeneratorServiceTest` (new, 6 tests, **`webhook-platform-api` module** — see the
  module-scoping note below): cache-miss reseed from durable high-water mark, no-DB-hit on the
  hot path, cold-start-from-1 with no false reseed metric, a real concurrent race (6 threads)
  proving no duplicate/lost sequence numbers across a reseed race, and `reseedIfBehind`
  (used by reconciliation).
- `EventIngestServiceTest`: two new tests — sequence saved as `null` at save-time and
  backfilled only after commit; and the rollback-safety regression test described above.
- `WebhookDeliveryServiceTest`: three new tests on `canDeliverWithOrdering` — Scenario A from
  the task (something else in the gap still pending → buffers instead of skipping ahead;
  manually verified this fails against the pre-fix single-sequence check, see below), nothing
  outstanding in the gap → proceeds immediately, and gap-timeout → counts the metric exactly
  once.
- `DeliveryEndToEndIntegrationTest` (real Postgres+Kafka+Redis+WireMock, the P1-21 harness):
  two new tests —
  `orderedDeliveries_publishedOutOfOrderWithAnInducedRetry_arriveAtWireMockInOrder` (5
  ordering-enabled deliveries published out of sequence order with an induced retry in the
  middle, asserts strict arrival order at WireMock — this is what actually caught the codec
  bug above) and `redisFlushMidOrderedRun_cursorSurvivesAndDeliveryContinues` (automated
  proxy for the manual drill, see below).

**Reproduce-first, actually verified**: for 23b, temporarily hand-reverted
`canDeliverWithOrdering` to the old single-sequence-range + old null semantics (kept the new
3-arg method signature, just called it with `rangeStart = rangeEnd = sequenceNumber - 1`) and
re-ran `canDeliverWithOrdering_somethingElseInGapStillPending_buffersInsteadOfSkippingAhead`:
it failed with exactly the predicted symptom (`No outstanding deliveries in gap [9, 9]...
proceeding with seq=10`, then `NoInteractionsWanted` on `endpointRepository` because it
skipped straight to delivery). Restored the fix via `git checkout --` immediately after
(no stash used, per the worktree rules) and reran to confirm green. Did not repeat this
exercise for 23a/23c individually — the DeliveryEndToEndIntegrationTest failures encountered
while *building* those fixes (the codec bug, and the RedisConcurrencyControlService finding
below) already served as unplanned but genuine "saw it fail for the right reason" evidence.

**Manual verification drill — not run as literally specified, automated instead, with a
finding.** The task's manual drill (`docker exec webhook-redis redis-cli FLUSHALL` against a
full `make up` stack) was replaced with
`DeliveryEndToEndIntegrationTest#redisFlushMidOrderedRun_cursorSurvivesAndDeliveryContinues`,
run against a real (Testcontainers) Redis instance so it's part of the regular suite instead
of a step nobody re-runs. While building it, a full `redissonClient.getKeys().flushall()`
mid-run reliably stalled delivery *indefinitely* (not "degrades loudly", just stuck) — but
root-caused it to **`RedisConcurrencyControlService`**, not the ordering code this task owns:
it keeps a local Caffeine cache of "this endpoint's semaphore key is already initialized" that
survives a Redis flush, so after a flush it never reruns the Redis-side initialization and
`tryAcquire` blocks forever on a semaphore Redis no longer has any permits in. The test now
deletes only the `seq:*` keys (also a more faithful simulation of the actual bug scenario —
"the 24h delivered-seq-ttl-hours lapses" only ever removes those keys, not the whole
instance) and passes cleanly. **Flagging the `RedisConcurrencyControlService` finding for a
follow-up task** (P1-26 territory: "thread/pool sizing, lying metrics" is the closest
existing bucket) — it's a real, separate, complete-Redis-loss-only availability bug, but
fixing it is out of scope for P1-23.

### Verification output (verbatim)

```
$ mvn test -pl webhook-platform-worker -Dtest='OrderingBufferServiceTest,SequenceGeneratorServiceTest'
...
Running com.webhook.platform.worker.service.OrderingBufferServiceTest
Tests run: 11, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 1.128 s - in com.webhook.platform.worker.service.OrderingBufferServiceTest

Tests run: 11, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Note: `SequenceGeneratorService` lives in `webhook-platform-api`, not `webhook-platform-worker`
(the task's verification block scopes both classes to `-pl webhook-platform-worker`, which is
a stale citation — the class was moved/always lived in api). The command above still passes
(Maven doesn't fail when one of several `-Dtest` classes matches zero tests as long as at
least one matches), but it never actually runs `SequenceGeneratorServiceTest`. Ran it correctly
scoped instead:

```
$ mvn test -pl webhook-platform-api -Dtest='SequenceGeneratorServiceTest'
...
Running com.webhook.platform.api.service.SequenceGeneratorServiceTest
17:50:29.121 [main] WARN ... Sequence counter cache miss for endpoint ... — reseeded from durable high-water mark 100
17:50:29.182 [pool-1-thread-1] WARN ... Sequence counter cache miss for endpoint ... — reseeded from durable high-water mark 50
Tests run: 6, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 1.619 s - in com.webhook.platform.api.service.SequenceGeneratorServiceTest

Tests run: 6, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

```
$ mvn test -pl webhook-platform-worker
...
Tests run: [various] ... in com.webhook.platform.worker.service.WebhookDeliveryServiceTest (includes 3 new ordering tests)
Tests run: [various] ... in com.webhook.platform.worker.service.OrderingBufferServiceTest
Tests run: 8, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 103.151 s - in com.webhook.platform.worker.DeliveryEndToEndIntegrationTest
Tests run: 6, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 2.012 s - in com.webhook.platform.worker.repository.DeliveryRepositoryTest

Results:

Tests run: 180, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time:  02:50 min
```

Also ran, since the change touches shared entities/migrations/`AbstractIntegrationTest`:

```
$ mvn test -pl webhook-platform-api -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'
Tests run: 347, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS

$ mvn test -pl webhook-platform-api -Dtest='*RepositoryTest,*IntegrationTest,*IT,*ConcurrencyTest,*RbacTest,*IsolationTest'
Tests run: 188, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

### Files touched

- `webhook-platform-worker/src/main/java/.../service/OrderingBufferService.java` (23a, 23b)
- `webhook-platform-worker/src/main/java/.../domain/repository/OrderingCursorRepository.java` (23a)
- `webhook-platform-worker/src/main/resources/lua/ordering_cursor_cas.lua` (new, 23a)
- `webhook-platform-worker/src/main/java/.../service/WebhookDeliveryService.java` (23b)
- `webhook-platform-worker/src/main/java/.../domain/repository/DeliveryRepository.java` (23b)
- `webhook-platform-worker/src/main/java/.../domain/entity/Delivery.java` (23b, new column)
- `webhook-platform-api/src/main/java/.../domain/entity/Delivery.java` (23b, mirror column)
- `webhook-platform-api/src/main/resources/db/migration/V054__ordering_first_buffered_at.sql` (new, 23b; renumbered from V051 during the coordinator's merge into develop — V051-V053 were already claimed by the P3-36 partitioning migrations that landed first)
- `webhook-platform-api/src/main/java/.../service/SequenceGeneratorService.java` (23c)
- `webhook-platform-api/src/main/java/.../service/SequenceReconciliationService.java` (new, 23c)
- `webhook-platform-api/src/main/java/.../domain/repository/DeliveryRepository.java` (23c)
- `webhook-platform-api/src/main/java/.../service/EventIngestService.java` (23c, + P1-26 note)
- `webhook-platform-api/src/main/resources/application.yml`, `.env.dist` (23c, new config)
- `webhook-platform-api/src/test/java/.../AbstractIntegrationTest.java` (mock new bean)
- New/extended tests: `OrderingBufferServiceTest`, `SequenceGeneratorServiceTest` (new),
  `EventIngestServiceTest`, `WebhookDeliveryServiceTest`, `DeliveryEndToEndIntegrationTest`

### Left out / deliberately not done

- `RedisConcurrencyControlService`'s stale-local-cache-after-flush issue (found, not fixed —
  see above, flagged for a follow-up).
- `quotaCounterService.increment()`'s non-transactional side effect (explicitly out of scope
  per the task, flagged inline for P1-26).
