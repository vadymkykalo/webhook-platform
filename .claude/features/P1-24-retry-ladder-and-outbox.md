# P1-24 — Retry ladder vs 48h cap, outbox ordering, SENDING recovery

- **Status:** TODO
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

- [ ] These two were clearly configured independently. Decide which is right:
      shorten the ladder to fit 48h, or raise the cap to cover the ladder. This
      is a **product decision** — state it, and make the README and
      `docs/OPERATIONS.md:41` match whatever you choose.
- [ ] Add a startup validation that the configured ladder fits inside the
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

- [ ] Add `ORDER BY created_at` to the outer query.

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

- [ ] Move `recoverStuckSendingMessages` into the 30-second retry cycle.
- [ ] Export a `SENDING` gauge and add an alert rule for it (coordinate with
      P1-20, which is wiring Alertmanager).

## 24d — Retry topics carry no delay of their own

Worth documenting rather than changing: `deliveries.retry.1m…24h` impose no delay
(`DeliveryConsumer.java:80-96` consumes them all immediately). The tier chosen at
`RetrySchedulerService.java:287-296` is purely a label; the actual delay comes
from `next_retry_at`. This is probably by design, but anyone assuming the topic
name enforces the delay will be wrong.

- [ ] Document it in the `backend-tests` skill or a comment on `KafkaTopics`, so
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

- [ ] Ladder and cap agree; validated at startup; docs match.
- [ ] Outbox batches ordered.
- [ ] `SENDING` recovered promptly and observable via a gauge + alert.
- [ ] Retry-topic semantics documented.

## Progress log
