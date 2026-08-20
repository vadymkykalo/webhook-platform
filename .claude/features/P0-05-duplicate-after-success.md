# P0-05 — A successful 2xx delivery gets re-sent as a duplicate

- **Status:** DONE
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

- [x] Reproduce first: make `markAsSuccess` slow enough to trip the timeout after
      a 200 response, and assert the row ends up `PENDING` with a scheduled
      retry. **See the duplicate get scheduled.**
- [x] Return the response status from the mono and perform **all** persistence
      after `block()`, on the worker thread — not inside `.map`/`.timeout`.
- [x] Make the state transitions conditional so a late writer cannot clobber a
      terminal state: `markAsSuccess` / `scheduleRetry` / `markAsFailed` should
      carry `WHERE status = 'PROCESSING'` (or equivalent optimistic guard —
      `Delivery` already has `@Version`, use it consistently).
- [x] Confirm no remaining blocking call runs on a netty event-loop thread in
      this path. A cheap check: assert the thread name in a test, or enable
      BlockHound in a focused test if that is proportionate.
- [x] Re-check `triggerBufferedDeliveries` (~579): a Kafka send failure must not
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

- [x] A terminal `SUCCESS` cannot be overwritten by a late error path.
- [x] No DB/Redis/Kafka work remains on the netty event loop in this path.
- [x] Tests fail against old code, pass against new.

## Progress log

**Root cause confirmed** at the cited lines (still accurate at the branch
commit): `attemptDelivery`'s `.exchangeToMono(...).map(...)` called
`handleResponse` — and therefore `markAsSuccess`/`scheduleRetry` DB writes,
`orderingBufferService` Redis calls and `kafkaTemplate.send` — *inside* the
`.map`, which runs on the reactor-netty event-loop thread and is itself
wrapped by `.timeout(...)`. `scheduleRetry` then set `fresh.setStatus(PENDING)`
unconditionally, with no check of the row's current status.

**Fix (`WebhookDeliveryService.java`):**
- `attemptDelivery`: the reactive chain now only ever produces a
  `ResponseOutcome(status, responseBody, responseHeaders)` record — no
  DB/Redis/Kafka calls inside `.map`/`.timeout`. `handleResponse` is invoked
  after `.block()` returns, synchronously on the calling (worker) thread, so a
  slow `markAsSuccess` can no longer race the HTTP timeout.
- `markAsSuccess` / `scheduleRetry` / `markAsFailed`: added a status guard —
  each re-reads the row and, if it's no longer `PROCESSING` (i.e. another path
  already reached a terminal state), skips the write instead of clobbering it.
  Implemented as an application-level check (matching the existing
  `rescheduleForBackpressure` precedent in this same file), not a raw native
  `WHERE status = 'PROCESSING'` query, to keep the diff minimal and stay
  consistent with the surrounding code style.
- `markAsSuccess` / `scheduleRetry`'s DLQ branch / `markAsFailed`: the
  ordering-buffer release (`orderingBufferService.markDelivered` /
  `removeFromBuffer`) and `triggerBufferedDeliveries` (Kafka send) now run
  **after** the DB transaction commits, wrapped in their own try/catch (mirrors
  the existing `publishDlqEvent` "DB is source of truth, Kafka is a
  notification" pattern) — a Kafka/Redis failure there can no longer roll back
  an already-committed terminal-state write.

**Left out of scope:** nothing found beyond the task's own steps. No related
defects noticed while working this file.

**Tests added** (`WebhookDeliveryServiceTest`):
- `attemptDelivery_200ResponseFollowedBySlowSuccessBookkeeping_neverEndsPending`
  — real local `HttpServer` returns 200 immediately, `deliveryRepository.save()`
  is stubbed to sleep 1.5s when writing `SUCCESS` against a 1s
  `timeoutSeconds`. Also asserts the `SUCCESS` save doesn't run on a
  `reactor-http-nio` thread (the cheap thread-name check called out in the
  task).
- `scheduleRetry_rowAlreadySuccess_isNoOp` — `findById` returns `PROCESSING`
  then `SUCCESS` on successive calls (simulating `markAsSuccess` winning the
  race); asserts `scheduleRetry` never saves `PENDING`.
- `markAsSuccess_kafkaSendFailureAfterCommit_doesNotRollBackToPending` —
  ordering-enabled delivery, `kafkaTemplate.send` throws; asserts `SUCCESS` is
  still saved and `PENDING` never is.

**Reproduced against unfixed code** (`WebhookDeliveryService.java` stashed,
tests kept) — all three new tests fail red:

```
[ERROR] Tests run: 9, Failures: 3, Errors: 0, Skipped: 0
[ERROR]   WebhookDeliveryServiceTest.attemptDelivery_200ResponseFollowedBySlowSuccessBookkeeping_neverEndsPending:392
  a delivery that already received a 2xx response must never be re-scheduled as a
  duplicate PENDING retry, even when success bookkeeping is slow enough to trip
  the HTTP timeout ==> expected: <false> but was: <true>
[ERROR]   WebhookDeliveryServiceTest.markAsSuccess_kafkaSendFailureAfterCommit_doesNotRollBackToPending:507
  Argument(s) are different! Wanted: deliveryRepository.save(<custom argument matcher>)
  ... save(status=PENDING) observed via scheduleRetry after the Kafka send threw
[ERROR]   WebhookDeliveryServiceTest.scheduleRetry_rowAlreadySuccess_isNoOp:452
  deliveryRepository.save(<custom argument matcher>) — Never wanted here, but invoked:
  scheduleRetry saved status=PENDING over a row that was already SUCCESS
```

Restored the fix — same 9 tests green:

```
mvn test -pl webhook-platform-worker -Dtest=WebhookDeliveryServiceTest
[INFO] Tests run: 9, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS

mvn test -pl webhook-platform-worker
[INFO] Tests run: 73, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS

mvn test -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'   (whole repo)
[INFO] Reactor Summary: Common/API/Worker/CLI all SUCCESS, Tests run: 66 (worker) — BUILD SUCCESS

mvn test -pl webhook-platform-worker -Dtest='*RepositoryTest,*IntegrationTest,*IT,*ConcurrencyTest,*RbacTest,*IsolationTest' -DfailIfNoTests=false
[INFO] Tests run: 7, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

Ran the same full-repo integration filter across all modules too; it stopped
on 3 pre-existing failures in `webhook-platform-api`'s
`AuthContextIntegrationTest` (`apiKey_auditLog_forbidden`,
`apiKey_auditLogExport_forbidden`, `jwt_auditLog` — all expecting 403/200 but
getting 400). Confirmed these are **unrelated to this change**: they reproduce
identically with `WebhookDeliveryService.java`/its test fully reverted to
`develop`. Not touched — out of scope for P0-05.

**Manual verification** (`make up && make wait-healthy`, real containers,
rebuilt worker image with the fix): registered a user/org, created a project,
an endpoint pointed at a throwaway Python HTTP server on the compose network
that sleeps 2.5s before responding 200 (`timeoutSeconds` on the subscription
set to 3, i.e. the receiver uses ~83% of the budget), and sent one event.
Receiver log:

```
[receiver] request #1 received, sleeping 2.5s
[receiver] request #1 responded 200 (total so far: 1)
```

Worker log: `Delivery a47c1f39-... succeeded after 1 attempts` — no
`scheduleRetry`/PENDING line for that delivery. `GET
/api/v1/deliveries/a47c1f39-...`:

```json
{"id":"a47c1f39-aa2f-4f40-89d5-8ac124de22f5","status":"SUCCESS",
 "attemptCount":1,"maxAttempts":5,"nextRetryAt":null,
 "succeededAt":"2026-08-20T19:48:19.933780Z","failedAt":null}
```

Exactly one POST received, delivery shows `SUCCESS`, `attemptCount: 1`,
`nextRetryAt: null` — matches the manual scenario in this file's
`## Verification` section. Cleaned up the throwaway receiver container
afterward.
