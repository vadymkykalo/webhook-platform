# P1-24 — Retry ladder vs 48h cap, outbox ordering, SENDING recovery

- **Status:** DONE
- **Priority:** P1
- **Branch:** `feature/P1-24-retry-ladder-and-outbox`
- **Depends on:** P0-01 (adjacent code)
- **Modules:** `webhook-platform-worker`, `webhook-platform-api`

## 24a — The 48h cap fires before the retry schedule finishes

Defaults: `retryDelays = "60,300,900,3600,21600,86400"`, `maxAttempts = 7`
(`EventIngestService.createDelivery`), with 0.5×–1.5× jitter
(`WebhookDeliveryService.java:446-454`). Index clamping reuses 86400 for attempt
7, giving a worst case around **83 hours** and an expected span around 55.

But `StaleDeliveryEscalationService` escalates **any** `PENDING` delivery older
than `delivery.escalation.hard-cap-hours = 48` straight to DLQ, ignoring
`attemptCount` / `maxAttempts`.

So when an endpoint is down for two days, attempts 6 and 7 — the 24-hour tiers
the README advertises — never happen. The row is DLQ'd at 48h with `failed_at`
set and no final attempt recorded.

- [x] These two were clearly configured independently. Decide which is right:
      shorten the ladder to fit 48h, or raise the cap to cover the ladder. This
      is a **product decision** — state it, and make the README and
      `docs/OPERATIONS.md:41` match whatever you choose.
- [x] Add a startup validation that the configured ladder fits inside the
      configured cap, so they cannot drift apart again.

## 24b — Outbox claim loses ordering

`OutboxMessageRepository.findPendingBatchForUpdate`: the inner query orders by
`rn_proj, rn_key`, but the outer
`SELECT * FROM outbox_messages WHERE id IN (…) FOR UPDATE SKIP LOCKED` has **no
`ORDER BY`**, so the list handed to `publishBatchAsync`
(`OutboxPublisherService.java:212`) is in plan order. With `maxPerKey = 10`, up
to ten messages for one endpoint can be published to the same partition out of
order.

The producer is fine (`enable.idempotence=true`, `acks=all`) and the ordering
buffer repairs the result, so the impact is extra buffering and latency — but the
buffering path is exactly what P1-23 shows is fragile.

- [x] Add `ORDER BY created_at` to the outer query.

## 24c — Stuck SENDING rows wait up to an hour

`OutboxPublisherService.java:255-267`: after
`batch-send-timeout-seconds` (30s) any still-in-flight message stays `SENDING`,
and recovery lives in `cleanupOldMessages`, scheduled at
`cleanup-interval-ms = 3600000` with `sending-recovery-seconds = 300`.

A 60-second broker hiccup leaves messages `SENDING`, eligible for recovery after
5 minutes but not actually touched for up to ~59 more — undelivered webhooks with
no alert, because the `outbox_queue_depth` gauges only track PENDING/FAILED/DEAD
and `SENDING` is not exported at all. Combined with P0-06's single scheduler
thread, the hourly job can be delayed further still.

- [x] Move `recoverStuckSendingMessages` into the 30-second retry cycle.
- [x] Export a `SENDING` gauge and add an alert rule for it (coordinate with
      P1-20, which is wiring Alertmanager).

## 24d — Retry topics carry no delay of their own

Worth documenting rather than changing: `deliveries.retry.1m…24h` impose no delay
(`DeliveryConsumer.java:80-96` consumes them all immediately). The tier chosen at
`RetrySchedulerService.java:287-296` is purely a label; the actual delay comes
from `next_retry_at`. This is probably by design, but anyone assuming the topic
name enforces the delay will be wrong.

- [x] Document it in the `backend-tests` skill or a comment on `KafkaTopics`, so
      the next reader does not "fix" the scheduler to match the topic names.

## Tests to write

- Extend `RetrySchedulerServiceTest`: the full ladder maps to the right tiers and
  the total span fits the cap; startup validation rejects an inconsistent pair.
- Extend `StaleDeliveryEscalationServiceTest`: a delivery with attempts remaining
  is not escalated prematurely.
- Extend `OutboxPublisherServiceTest`: batches come out ordered; a `SENDING` row
  is recovered within the retry cycle, not an hour later.

## Verification

```bash
mvn test -pl webhook-platform-worker -Dtest='RetrySchedulerServiceTest,StaleDeliveryEscalationServiceTest'
mvn test -pl webhook-platform-api -Dtest=OutboxPublisherServiceTest
```

## Definition of done

- [x] Ladder and cap agree; validated at startup; docs match.
- [x] Outbox batches ordered.
- [x] `SENDING` recovered promptly and observable via a gauge + alert.
- [x] Retry-topic semantics documented.

## Progress log

**24a — product decision: raise the cap, not shorten the ladder.**

The default ladder (`60,300,900,3600,21600,86400`, 7 attempts) is what the README
advertises as a "6-tier retry" feature (1m/5m/15m/1h/6h/24h) — shortening it
changes user-visible, already-shipped behavior. The 48h hard-cap was never
advertised anywhere (no README/OPERATIONS/runbook text referenced it before this
change); it exists purely as an internal safety net against unbounded PENDING
backlog growth. Raising it is a config-only change with no behavior change for
any delivery that's actually retrying — only for the (rare, endpoint-down-for-days)
case that used to get force-DLQ'd early. Decision: raised
`delivery.escalation.hard-cap-hours` default from 48 → **96** (worst-case ladder
span is ~83h with full jitter; 96h leaves ~13h margin for scheduling jitter).

Changed:
- `webhook-platform-worker/src/main/resources/application.yml` — `delivery.escalation.hard-cap-hours` default 48→96; added `retry.ladder.default-delays-seconds` / `retry.ladder.default-max-attempts` (mirrors the API-side Subscription/Delivery defaults, used only for the startup check below).
- `.env.dist` — `DELIVERY_ESCALATION_HARD_CAP_HOURS` 48→96 with rationale comment; added `RETRY_LADDER_DEFAULT_DELAYS_SECONDS`/`RETRY_LADDER_DEFAULT_MAX_ATTEMPTS`.
- `StaleDeliveryEscalationService` — `@Value` default 48→96, javadoc updated.
- `README.md` — "6-tier retry" bullet now states the expected/worst-case span and the 96h cap.
- `docs/OPERATIONS.md` — the task's `:41` citation had drifted (that line is now unrelated Helm text, post-audit-commit churn from other merged tasks); added a new "Retry ladder vs. DLQ hard-cap (P1-24a)" subsection instead, in the section that already documents the retry topics.
- `deploy/prometheus/alerts.yml` — fixed a **pre-existing, related inconsistency** found while touching this area: `OldestPendingDeliveryCritical` fired at 24h claiming "hard-cap escalation should have moved this to DLQ" — wrong even before this change (cap was 48h, not 24h). Retargeted to 97h (96h cap + escalation-poll margin) with an updated description; also clarified `DeliveryPendingBacklogCritical`'s description to name the actual env var/default. Added a new `hookflow.outbox` alert group (see 24c). Rule count 14→15, `monitoring/README.md` updated to match.
- Startup validation: `RetryPolicy.worstCaseSpanSeconds` / `RetryPolicy.validateLadderFitsCap` (new pure methods, worker module) compute the ladder's worst-case span (full jitter, 1.5x per tier, clamped at the last tier for attempts beyond the ladder length) and throw `IllegalStateException` if it exceeds the cap. Wired into `RetrySchedulerService`'s constructor (fails at bean creation, not just on a later `@PostConstruct`/`@Scheduled` tick) via three new `@Value`-injected params: `retry.ladder.default-delays-seconds`, `retry.ladder.default-max-attempts`, `delivery.escalation.hard-cap-hours`.

**24b** — Added `ORDER BY created_at ASC` to the outer `SELECT ... FOR UPDATE SKIP
LOCKED` in both `findPendingBatchForUpdate` **and** `findFailedMessagesForRetry`
(same structural defect, same `publishBatchAsync` consumer via
`retryFailedMessages` — task only cited the first, fixed both for consistency).

**24c** — Moved `recoverStuckSendingMessages` out of the hourly
`cleanupOldMessages` job into the top of `retryFailedMessages` (the 30s
`outbox.publisher.retry-interval-ms` cycle) — extracted into a small private
method, called once, not duplicated in both places. Added an
`outbox_queue_depth{status="sending"}` gauge (mirroring the existing
pending/failed/dead gauges) and a new `OutboxSendingStuck` warning alert
(`deploy/prometheus/alerts.yml`, `hookflow.outbox` group) that fires if the
SENDING gauge stays non-zero for >10m.

**24d** — Documented on `KafkaTopics` (comment above the six retry topic
constants) rather than the `backend-tests` skill (task said either) — DeliveryConsumer
consumes all six retry topics immediately; `next_retry_at` is the only real delay
mechanism; the topic chosen is a routing/observability label picked by
`RetrySchedulerService#getRetryTopic` from `attemptCount`.

**Tests** (per the task's naming/routing — none of these end in
`IntegrationTest`/`IT`/`RepositoryTest`/`ConcurrencyTest`/`RbacTest`/`IsolationTest`,
so all run in the no-Docker unit job):
- `RetryPolicyTest` — added `worstCaseSpanSeconds`/`validateLadderFitsCap` coverage (known worst-case value 298890s for the default ladder, clamp behavior, throws/doesn't-throw at the boundary).
- `RetrySchedulerServiceTest` — extended constructor/setUp for the 3 new params; added `getRetryTopic_fullLadder_totalSpanFitsInsideProductionHardCap` (ties the production defaults together), `constructor_ladderWorstCaseExceedsHardCap_throwsAtStartup` (reproduces the original 48h-vs-ladder defect and proves the validator catches it), `constructor_ladderFitsInsideHardCap_doesNotThrow`. Had to mark the `transactionTemplate.execute(...)` stub in `setUp()` as `lenient()` — the three new tests construct the service without calling `scheduleRetries()`, which was tripping Mockito's strict-stubs `UnnecessaryStubbingException`.
- `StaleDeliveryEscalationServiceTest` — hard-cap constructor arg 48→96; added `runEscalation_deliveryWithAttemptsRemaining_notEscalatedPrematurely` (captures the cutoff Instant handed to `findStaleDeliveryIds` and asserts a 70h-old delivery — still within the ~83h ladder span — is not past it; this is the regression test for the original defect: at the old 48h cap this assertion would fail).
- `OutboxPublisherServiceTest` — added `findPendingBatchForUpdate_outerQuery_ordersByCreatedAt` (reflection over the `@Query` annotation text — asserts the *outer* query, isolated from the inner subquery's own `ORDER BY`, contains `ORDER BY created_at`; covers both native queries), `publishPendingMessages_sendsMessagesInRepositoryReturnOrder` (end-to-end: repo returns 3 messages in order, asserts Kafka `send()` is called with matching keys in that same order), `retryFailedMessages_recoversStuckSendingMessages_onThe30sCycle`, `retryFailedMessages_recoveredSendingMessages_areLoggedAndCountedAtZeroCost`, `cleanupOldMessages_noLongerRecoversStuckSendingMessages` (pins the "moved not duplicated" decision). Also had to add a missing `ArgumentCaptor` import that the new tests needed.

**Verification (verbatim commands, real output):**

```
$ mvn test -pl webhook-platform-worker -Dtest='RetrySchedulerServiceTest,StaleDeliveryEscalationServiceTest'
...
[INFO] Running com.webhook.platform.worker.service.StaleDeliveryEscalationServiceTest
[INFO] Tests run: 6, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 5.814 s - in com.webhook.platform.worker.service.StaleDeliveryEscalationServiceTest
[INFO] Running com.webhook.platform.worker.service.RetrySchedulerServiceTest
[INFO] Tests run: 12, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 30.464 s - in com.webhook.platform.worker.service.RetrySchedulerServiceTest
[INFO]
[INFO] Results:
[INFO]
[INFO] Tests run: 18, Failures: 0, Errors: 0, Skipped: 0
[INFO]
[INFO] BUILD SUCCESS
[INFO] Total time:  45.666 s
```

```
$ mvn test -pl webhook-platform-api -Dtest=OutboxPublisherServiceTest
...
[INFO] Running com.webhook.platform.api.service.OutboxPublisherServiceTest
00:18:47.993 [main] INFO  ...OutboxPublisherService -- Publishing 1 pending outbox messages
00:18:48.063 [main] INFO  ...OutboxPublisherService -- Publishing 3 pending outbox messages
00:18:48.163 [main] INFO  ...OutboxPublisherService -- Publishing 1 pending outbox messages
00:18:48.165 [main] ERROR ...OutboxPublisherService -- Failed to publish outbox message ...: Broker unavailable
00:18:48.183 [main] WARN  ...OutboxPublisherService -- Recovered 3 stuck SENDING outbox messages back to PENDING
00:18:48.218 [main] INFO  ...OutboxPublisherService -- Publishing 1 pending outbox messages
00:18:48.227 [main] ERROR ...OutboxPublisherService -- Failed to prepare outbox message ...: Parse error
00:18:48.267 [main] INFO  ...OutboxPublisherService -- Publishing 1 pending outbox messages
00:18:49.271 [main] WARN  ...OutboxPublisherService -- Batch Kafka send did not fully complete within 1s: null — in-flight messages remain SENDING and will be recovered by cleanup
[INFO] Tests run: 11, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 8.484 s - in com.webhook.platform.api.service.OutboxPublisherServiceTest
[INFO]
[INFO] Results:
[INFO]
[INFO] Tests run: 11, Failures: 0, Errors: 0, Skipped: 0
[INFO]
[INFO] BUILD SUCCESS
[INFO] Total time:  21.863 s
```

Also ran `mvn test-compile` for both `webhook-platform-worker` and `webhook-platform-api`
(exit 0 both) to confirm no other callers of `RetrySchedulerService`'s constructor
exist outside the one test class that was updated.

**Left out / notes for the future:** the per-subscription `retryDelays`/`maxAttempts`
columns (`Subscription`, `Delivery` entities, API side) are still hardcoded literals
in half a dozen service classes (`EventIngestService`, `SubscriptionService`,
`EventService`, `ReplayService`, `DeliveryNodeExecutor`) rather than driven from the
same env-var defaults added here — the new `retry.ladder.default-*` properties exist
only in the worker module, purely to make the startup validation possible, and are
documented as "mirror, keep in sync" rather than the single source of truth. Making
the API-side defaults actually configurable (and shared with the worker) would be a
reasonable follow-up but is a bigger refactor than this task's scope.
