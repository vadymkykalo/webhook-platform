# P0-38 — Never-attempted deliveries routed to the 24h retry tier

- **Status:** IN PROGRESS
- **Priority:** P0 — backpressure-rescheduled deliveries silently misclassified as "almost given up"
- **Branch:** `feature/P0-38-retry-topic-zero-attempts`
- **Depends on:** nothing
- **Module:** `webhook-platform-worker`

## The defect

Found while running the manual verification for [[P0-02]] (`.claude/features/P0-02-shutdown-message-loss.md`),
not part of the original audit.

`RetrySchedulerService.getRetryTopic(int attemptCount)`:

```java
private String getRetryTopic(int attemptCount) {
    return switch (attemptCount) {
        case 1 -> KafkaTopics.DELIVERIES_RETRY_1M;
        case 2 -> KafkaTopics.DELIVERIES_RETRY_5M;
        case 3 -> KafkaTopics.DELIVERIES_RETRY_15M;
        case 4 -> KafkaTopics.DELIVERIES_RETRY_1H;
        case 5 -> KafkaTopics.DELIVERIES_RETRY_6H;
        default -> KafkaTopics.DELIVERIES_RETRY_24H;
    };
}
```

`default` catches both "exhausted the ladder" (`attemptCount >= 6`, the
intended case) **and** `attemptCount == 0`, which is a real, reachable
state: `WebhookDeliveryService.doProcessDelivery` calls
`rescheduleDelivery(delivery.getId(), Instant.now().plusSeconds(delaySec))`
(`WebhookDeliveryService.java:263`, via `backoffWithJitter`) when
`concurrencyControlService.tryAcquire(endpoint.getId())` fails — this
reschedule happens **before** `attempt_count` is incremented
(`WebhookDeliveryService.java:279`, which only runs once the HTTP call is
actually about to be made). The same is true of the project-level
rate-limiter check just above it. A delivery that has never had a single
HTTP attempt, delayed only by per-endpoint concurrency backpressure for a
few seconds, gets published to `deliveries.retry.24h` by
`RetrySchedulerService` on its very next poll.

Confirmed live during the P0-02 manual load test (single endpoint, burst of
800 events): worker logs showed `Scheduled retry for delivery ... to topic
deliveries.retry.24h` for deliveries whose `attempt_count` in Postgres was
still `0`.

Because all retry topics share one `@KafkaListener` (`DeliveryConsumer.
consumeRetry`) and the actual delay already happened via `next_retry_at`
before publish, this does not currently delay delivery further — but it
does defeat the entire point of having per-tier retry topics: DLQ triage,
per-tier metrics/alerting, and any future tier-specific handling all read
`deliveries.retry.24h` as "an endpoint has been failing for a long time".
Flooding it with deliveries that haven't even had their first attempt is a
correctness bug in that signal, not a cosmetic one.

## Steps

- [ ] Reproduce first: extend `RetrySchedulerServiceTest`
      (`getRetryTopic_shouldSelectCorrectTopicByAttemptCount` already exists
      but never covers `attemptCount == 0`, and its assertions
      — `contains("1m") || contains("retry")` — pass for *any* topic name
      since every retry topic contains "retry"; strengthen to an exact
      `assertEquals` while adding the 0 case) to assert a delivery with
      `attemptCount = 0` is published to `deliveries.retry.1m`. Confirm it
      fails against the current code (lands on `deliveries.retry.24h`).
- [ ] Fix `getRetryTopic` so `attemptCount <= 1` maps to the 1m tier —
      `attemptCount == 0` means "about to make the first attempt", which is
      the same urgency as `attemptCount == 1` ("first attempt just failed").
      Leave `default` covering only the genuine ladder-exhausted case
      (`>= 6`).
- [ ] Check `WebhookDeliveryService.calculateNextRetry` for the same class of
      off-by-one: `Math.min(attemptCount - 1, delays.length - 1)` would be
      `-1` (array index out of bounds) if ever called with `attemptCount ==
      0`. Confirmed by reading the code that today it never is (the only
      caller, `scheduleRetry`, always runs after the attempt-count
      increment) — note this in the log rather than adding a guard for a
      state that cannot currently occur.

## Tests to write

- `RetrySchedulerServiceTest.java`: extend the existing topic-selection test
  (or add a new one) covering `attemptCount == 0` with an exact topic-name
  assertion, not a substring check that both the old and new topic name
  would satisfy.

## Verification

```bash
mvn test -pl webhook-platform-worker -Dtest=RetrySchedulerServiceTest
```

## Definition of done

- [ ] A delivery rescheduled before its first attempt (concurrency/rate
      limit backpressure) is published to `deliveries.retry.1m`, not `.24h`.
- [ ] `mvn test` green for `webhook-platform-worker`.

## Progress log
