# P0-05 — A successful 2xx delivery gets re-sent as a duplicate

- **Status:** TODO
- **Priority:** P0
- **Branch:** `feature/P0-05-duplicate-after-success`
- **Depends on:** nothing
- **Module:** `webhook-platform-worker`

## The defect

`WebhookDeliveryService.java:311-331` runs `handleResponse` (line ~320)
**inside** the reactive `.map(...)`, i.e. on the reactor-netty event-loop
thread, and therefore **inside** the `.timeout(...)` at line ~326.
`handleResponse` opens DB transactions (`markAsSuccess`, ~497-517), calls Redis
(`orderingBufferService.markDelivered`, ~513) and sends to Kafka
(`triggerBufferedDeliveries`, ~514/579) — all before the mono completes.

Anything thrown by that bookkeeping is caught at line ~328 → `handleError`
(~362-369) → `scheduleRetry` (~383) → `fresh.setStatus(PENDING)` at ~409
**with no check of the current status**.

Two ways this bites:

- **A.** Endpoint returns 200 at t=29.4s with `timeoutSeconds = 30`;
  `markAsSuccess` takes 0.8s; `.timeout` fires; `block()` throws
  `TimeoutException`; `scheduleRetry` re-reads the row (now `SUCCESS`), sees
  `attemptCount < maxAttempts`, and overwrites it back to `PENDING`. The
  customer receives the same webhook twice **and the `SUCCESS` record is
  destroyed**, so the dashboard lies about what happened.
- **B.** `kafkaTemplate.send` at ~579 throws synchronously (producer buffer
  exhausted) → the `markAsSuccess` transaction rolls back → same duplicate path.

Secondary but real: doing JDBC + Redis + Kafka on a shared netty event loop
stalls I/O for every other in-flight delivery on that loop.

## Steps

- [ ] Reproduce first: make `markAsSuccess` slow enough to trip the timeout after
      a 200 response, and assert the row ends up `PENDING` with a scheduled
      retry. **See the duplicate get scheduled.**
- [ ] Return the response status from the mono and perform **all** persistence
      after `block()`, on the worker thread — not inside `.map`/`.timeout`.
- [ ] Make the state transitions conditional so a late writer cannot clobber a
      terminal state: `markAsSuccess` / `scheduleRetry` / `markAsFailed` should
      carry `WHERE status = 'PROCESSING'` (or equivalent optimistic guard —
      `Delivery` already has `@Version`, use it consistently).
- [ ] Confirm no remaining blocking call runs on a netty event-loop thread in
      this path. A cheap check: assert the thread name in a test, or enable
      BlockHound in a focused test if that is proportionate.
- [ ] Re-check `triggerBufferedDeliveries` (~579): a Kafka send failure must not
      roll back an already-successful delivery record.

## Tests to write

- New `WebhookDeliveryServiceTest` (or extend the class P1-22 creates):
  - a 200 response followed by slow bookkeeping still ends `SUCCESS`, never `PENDING`;
  - `scheduleRetry` on a row already `SUCCESS` is a no-op;
  - a Kafka send failure after a 2xx does not flip the delivery to `PENDING`.

## Verification

```bash
mvn test -pl webhook-platform-worker -Dtest=WebhookDeliveryServiceTest
mvn test -pl webhook-platform-worker
```

Manual:
```bash
make up && make wait-healthy
# point an endpoint at a receiver that sleeps just under the configured timeout
# and counts requests; send one event; assert exactly one POST is received and
# the delivery shows SUCCESS in the dashboard.
```

## Definition of done

- [ ] A terminal `SUCCESS` cannot be overwritten by a late error path.
- [ ] No DB/Redis/Kafka work remains on the netty event loop in this path.
- [ ] Tests fail against old code, pass against new.

## Progress log
