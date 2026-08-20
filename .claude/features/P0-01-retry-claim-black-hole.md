# P0-01 — Retry claim leaves deliveries in an unrecoverable state

- **Status:** TODO
- **Priority:** P0 — silent webhook loss in production today
- **Branch:** `feature/P0-01-retry-claim-black-hole`
- **Depends on:** nothing
- **Module:** `webhook-platform-worker`

## The defect

`RetrySchedulerService` claims a batch of deliveries by **nulling
`next_retry_at`** while leaving `status = 'PENDING'`, then commits, then does
Kafka I/O in a later phase:

`webhook-platform-worker/.../service/RetrySchedulerService.java:134-139`
```java
// Nullify nextRetryAt to prevent re-pick by another scheduler instance
for (Delivery d : locked) {
    d.setNextRetryAt(null);
    d.setUpdatedAt(Instant.now());
}
deliveryRepository.saveAll(locked);
```

Neither recovery mechanism can see the resulting row:

- `DeliveryRepository.java` — `findPendingRetryIds` requires
  `d.next_retry_at IS NOT NULL AND d.next_retry_at <= :now`.
- `DeliveryRepository.java:18-21` — `resetStuckDeliveries` only matches
  `WHERE status = 'PROCESSING'`.

So `PENDING` + `next_retry_at IS NULL` is a black hole. If the worker is
SIGKILLed (rolling deploy, OOM, node eviction) between the phase-1 commit and
the phase-3 save, that webhook is **never delivered**. It is only flipped to
`DLQ` 48 hours later by `StaleDeliveryEscalationService`, with no attempt
recorded and no error message — so it looks like the customer's endpoint failed.

Note the incoming-forward twin does this correctly:
`IncomingForwardRetryScheduler.java:127` sets `PROCESSING`, which
`StuckForwardRecoveryService` recovers. **The outgoing path is the asymmetric
one** — mirror the forward scheduler rather than inventing a third pattern.

Freshly ingested deliveries are also `PENDING` with `next_retry_at = NULL`
(`EventIngestService.createDelivery` never sets it) and depend entirely on their
one outbox Kafka message. Your recovery query must not sweep those up as stuck —
gate on `updated_at` age.

## Steps

- [ ] Reproduce first. Write a repository-level test that inserts a delivery,
      runs the claim phase, kills the flow before the publish phase, and asserts
      the row is invisible to both `findPendingRetryIds` and
      `resetStuckDeliveries`. **See it fail to be found — that is the bug.**
- [ ] Change the claim to set `status = PROCESSING` (matching
      `IncomingForwardRetryScheduler.java:127`) instead of nulling
      `next_retry_at`. Confirm `resetStuckDeliveries` then recovers it.
- [ ] Audit every other reader of `next_retry_at` for an assumption that a
      claimed row still has `status = PENDING`:
      `grep -rn "next_retry_at\|NextRetryAt" webhook-platform-worker webhook-platform-api`
- [ ] Add a belt-and-braces recovery query for any legacy rows already stranded:
      `PENDING AND next_retry_at IS NULL AND updated_at < :threshold`. Pick a
      threshold safely larger than the dispatch window so freshly ingested
      deliveries are never swept.
- [ ] Decide and document what happens to rows already stuck in production
      before this fix ships (one-off backfill migration, or let the new recovery
      query pick them up — say which in the log).

## Tests to write

- `webhook-platform-worker/src/test/java/.../service/RetrySchedulerServiceTest.java`
  (exists — extend it): claim transitions status to `PROCESSING`; a claimed row
  is visible to `resetStuckDeliveries` after the threshold.
- `webhook-platform-worker/src/test/java/.../domain/repository/DeliveryRepositoryTest.java`
  (exists — extend it): a `PENDING` row with `next_retry_at IS NULL` older than
  the threshold **is** returned by the new recovery query, and a freshly created
  one is **not**.

## Verification

```bash
mvn test -pl webhook-platform-worker -Dtest=RetrySchedulerServiceTest
mvn test -pl webhook-platform-worker -Dtest=DeliveryRepositoryTest    # needs Docker
```

Then revert the production fix (keep the tests) and confirm the new tests fail.
Restore the fix. Paste both outputs into the log.

Manual end-to-end check:
```bash
make up && make wait-healthy
# create an endpoint that returns 500 so the delivery enters retry
# then, during the retry window:
docker kill webhook-worker && make up
make shell-db
# expect ZERO rows:
#   SELECT count(*) FROM deliveries
#   WHERE status='PENDING' AND next_retry_at IS NULL AND updated_at < now() - interval '5 minutes';
```

## Definition of done

- [ ] Claimed retries are recoverable by an existing sweep after a hard kill.
- [ ] New tests fail against the old code and pass against the new.
- [ ] The stranded-rows question above is answered in the log.
- [ ] `mvn test` (both suites) green for `webhook-platform-worker`.

## Progress log

_(agent: append what you changed, real command output, and anything left undone)_
