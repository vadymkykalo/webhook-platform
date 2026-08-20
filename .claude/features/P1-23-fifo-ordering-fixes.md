# P1-23 — Fix FIFO ordering: cursor regression, gap check, sequence durability

- **Status:** TODO
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

- [ ] Make the Redis update a Lua CAS / `GREATEST` against both stores, or make
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

- [ ] Query for the oldest pending delivery across the whole range
      `(lastDelivered, sequence)`, not a single sequence.
- [ ] Measure the gap timeout from when the successor was **first buffered**, not
      from `created_at`. This likely needs a new timestamp — say what you added.
- [ ] Fix the double-count: `webhook_ordering_gap_timeout_total` is incremented
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

- [ ] Persist a high-water mark, or seed the Redis counter from
      `MAX(sequence_number)` on cache miss.
- [ ] Generate the sequence **outside/after** the committed transaction so a
      rollback cannot burn one. Watch the interaction with idempotency replay.
- [ ] Add a startup or periodic reconciliation between the counter and
      `ordering_cursors`, with a loud metric when they disagree.
- [ ] Note the related non-ordering bug for P1-26: `quotaCounterService.increment()`
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

- [ ] Cursor cannot regress; sequence survives Redis loss.
- [ ] Gap check covers the range and times from the right instant.
- [ ] Gap-timeout metric counted once.
- [ ] Redis-flush drill passes.

## Progress log
