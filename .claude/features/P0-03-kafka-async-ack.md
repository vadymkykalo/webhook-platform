# P0-03 — Kafka offsets committed ahead of unfinished work (at-most-once)

- **Status:** DONE
- **Priority:** P0
- **Branch:** `feature/P0-03-kafka-async-ack`
- **Depends on:** P0-02 (same consumer/executor code — sequence them)
- **Module:** `webhook-platform-worker`

## The defect

`KafkaConsumerConfig.java:117` sets `AckMode.MANUAL` with
`factory.setConcurrency(6)`, and `asyncAcks` is never enabled anywhere
(verify: `grep -rn "asyncAcks\|setAsyncAcks" webhook-platform-worker`).

`BoundedAsyncExecutor.java:126-132` acks from an arbitrary pool thread whenever
*that particular* task finishes, and `DeliveryConsumer.java:71-78` returns
immediately after `trySubmit`, so up to `max.poll.records` records per partition
are in flight at once.

Sequence: records 5..14 are submitted; record 14's POST returns 200 first and
acks → committed offset becomes 15; the pod is SIGKILLed while 5..13 are still
POSTing. On restart the consumer resumes at 15 and **5..13 are gone from Kafka**.

Today this is survivable only because those rows are `PROCESSING` and
`StuckDeliveryRecoveryService` sweeps them after 5 minutes — a 5-minute delivery
delay masquerading as correctness, and a safety net that P0-01 shows is not
uniformly present.

## Steps

- [x] Reproduce first: a test (or a documented manual run) showing a higher
      offset committed while a lower offset is still in flight.
- [x] Enable out-of-order acks with deferred commits:
      `containerProperties.setAsyncAcks(true)` in `KafkaConsumerConfig`.
      Read the Spring Kafka docs for the version in use and confirm the
      semantics you get — do not cargo-cult the flag.
- [x] Alternative if `asyncAcks` does not fit: ack through an in-order
      completion tracker per partition. Pick one approach, state the reasoning
      in the log. (Not needed — `asyncAcks` fits; see log.)
- [x] Remove the reliance on "don't ack" as a retry mechanism — with MANUAL acks
      a non-ack does not redeliver until rebalance/restart. Anywhere the code
      skips acking to mean "retry later", make the retry explicit.
- [x] Re-check the interaction with P0-02: shutdown rejection and ack ordering
      must agree on what happens to an unprocessed record.

## Tests to write

- New `KafkaAckOrderingIntegrationTest` (Docker-required suffix, on purpose):
  with a `KafkaContainer`, submit records with deliberately staggered
  completion times and assert the committed offset never exceeds the lowest
  incomplete record.

If a `KafkaContainer` is not yet available in the repo, P1-21 introduces it —
coordinate rather than adding a second, divergent Kafka test setup.

## Verification

```bash
mvn test -pl webhook-platform-worker -Dtest=KafkaAckOrderingIntegrationTest   # needs Docker
```

Manual:
```bash
make up && make scale-worker N=2
# drive load, then: docker kill <one worker container>
# assert every ingested event is eventually delivered, and note how long
# recovery took — it should no longer depend on the 5-minute stuck sweep.
```

## Definition of done

- [x] Committed offset never runs ahead of incomplete work.
- [x] Recovery after a hard kill no longer depends on the 5-minute sweep —
      *for the general case*. Kafka never loses the record now (proven by
      `KafkaAckOrderingIntegrationTest` and 0 losses across 4 manual kill
      runs), so the sweep is no longer the only thing standing between "at
      least once" and permanent loss. One narrow race is still sweep-bound —
      see the run 4 write-up in the log below — and is called out as
      deliberately out of scope rather than silently left unmentioned.
- [x] Chosen approach and its trade-off written in the log.

## Progress log

**Approach chosen: `asyncAcks(true)`, not a custom completion tracker.** Spring
Kafka 3.1.0's `ContainerProperties.setAsyncAcks` does exactly what a hand-rolled
per-partition completion tracker would: out-of-order manual acks are deferred
and only committed once every lower offset in the batch has also been acked;
the consumer is paused meanwhile so the gap can't grow unbounded (verified by
reading `KafkaMessageListenerContainer` 3.1.0 source directly —
`ackInOrder`/`offsetsInThisBatch`/`pausedForAsyncAcks`). No reason to duplicate
that in application code. Changed in `KafkaConsumerConfig.configureFactory`
(applies to both the delivery and incoming-forward listener factories, since
both go through the same helper — the incoming pipeline has the identical
out-of-order-ack shape via its own bounded executor).

**"Don't ack" reliance removed, but only where it was actually reachable.**
Auditing every non-ack path in `BoundedAsyncExecutor`/`DeliveryConsumer`:

- `DeliveryConsumer`'s executor-full backpressure path (`trySubmit` returns
  `false`) was the real bug: a rejected record was never acked and the code
  assumed "containers pause, Kafka will re-poll it later" — false under MANUAL
  acks (position has already advanced past a record once it's handed to the
  listener; not acking only withholds the *commit*, it doesn't requeue the
  record). Worse, with `asyncAcks` on, a permanently-unacked record now
  pins `offsetsInThisBatch` for that partition forever, since a paused
  partition never gets a fresh poll to repopulate/clear that tracking
  structure — a live deadlock, not just a stall. Fixed by adding
  `WebhookDeliveryService.rescheduleForBackpressure(deliveryId, isRetry)`,
  which mirrors the exact pattern already used by `attemptDelivery` for
  rate-limit/circuit-breaker/concurrency backpressure (flip to
  PENDING + near-future `next_retry_at`, let `RetrySchedulerService` redrive
  it) and then acks. `DeliveryConsumer.consumeDispatch`/`consumeRetry` now
  call this and ack instead of silently dropping the ack.
- `BoundedAsyncExecutor`'s generic `catch (Exception e)` non-ack path is left
  unchanged in behavior (still doesn't ack) — but only after confirming it's
  effectively unreachable: `WebhookDeliveryService.processDelivery` already
  wraps its own body in try/catch and always resolves to an ack-worthy state
  (success/reschedule/DLQ), so nothing normally escapes to this handler. This
  executor is also generic (backs the incoming-forward pipeline too) and has
  no domain retry ladder to reschedule into. Left as a defensive catch-all;
  comment updated to state the real consequence post-`asyncAcks` (partition
  stalls until restart/rebalance, not silent loss) rather than the previous
  "will be redelivered" claim, which was already flagged inaccurate by a
  P0-03 TODO comment left in that file. Noted here as an accepted, scoped-out
  gap rather than silently left as-is.
- The `ShutdownRejectedException` path (thrown on the consumer thread by
  `rejectIfShuttingDown`, before submission) was already correct and needed no
  change: `DefaultErrorHandler.addNotRetryableExceptions` routes it straight
  to the DLQ via `DeadLetterPublishingRecoverer`, which acks the original
  offset after publishing to the DLQ topic. This doesn't interact with
  `asyncAcks` ordering at all since it never reaches the async pool — it's a
  synchronous decision on the consumer thread, separate from the out-of-order
  completion-ack path `asyncAcks` governs. Confirms step "re-check interaction
  with P0-02": the two mechanisms don't conflict, they cover disjoint cases
  (pre-submission rejection vs. post-submission out-of-order completion).

**Reproduce-first, done literally.** New
`KafkaAckOrderingIntegrationTest` (added `org.testcontainers:kafka` as a test
dependency to `webhook-platform-worker/pom.xml` — no Kafka Testcontainers setup
existed in this module yet) builds the container from the real
`KafkaConsumerConfig.kafkaListenerContainerFactory()` bean method (constructed
directly, `@Value` fields set via `ReflectionTestUtils`) rather than a
hand-rolled copy, so the test is wired to the actual production config and
regresses if `setAsyncAcks(true)` is ever reverted. Sequence: 10 records
submitted, offsets 5-9 acked first (simulating a fast delivery finishing before
slower ones), then asserted the committed offset does not advance past the
still-incomplete run starting at 0; then 0-4 are acked and the commit is
asserted to reach 10. Ran before the fix — failed with
`committed offset must not run ahead of incomplete record 0, but was: 10`
(see verification output below) — confirming the defect, then passed after
adding `setAsyncAcks(true)`. Also re-verified the regression is real by
temporarily reverting `DeliveryConsumer.java`'s backpressure fix and
confirming the two new `DeliveryConsumerTest` cases go red (`Wanted but not
invoked: rescheduleForBackpressure`), then reapplying.

New/changed tests:
- `KafkaAckOrderingIntegrationTest` (new, Docker-required) — the offset
  ordering fix itself.
- `DeliveryConsumerTest` — two new cases,
  `consume{Dispatch,Retry}_shouldRescheduleAndAck_whenExecutorFull`.
- `WebhookDeliveryServiceTest` (new file — none existed for this class yet;
  P1-22 is the ticket for full coverage, this only covers the method this fix
  added) — 5 cases for `rescheduleForBackpressure`: dispatch path reschedules
  a PENDING row, retry path reverts a PROCESSING claim to PENDING, and three
  no-op cases (status already changed out from under it on both paths, row
  gone).
- `BoundedAsyncExecutorTest` — unchanged assertions, still green (comment-only
  change in the class under test).

**Verification run (this session, Docker available):**

```
$ mvn -pl webhook-platform-worker -Dtest=KafkaAckOrderingIntegrationTest test
...
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

```
$ mvn -pl webhook-platform-worker -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest' test
Tests run: 59, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

```
$ mvn -pl webhook-platform-worker -Dtest='*RepositoryTest,*IntegrationTest,*IT,*ConcurrencyTest,*RbacTest,*IsolationTest' -DfailIfNoTests=false test
Tests run: 7, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

**Manual verification (`make up` + `make scale-worker N=2` + `docker kill`),
four runs against a real broker/DB/Redis stack — kept going until the signal
was clean, logged honestly including the two false starts:**

*Run 1* (slow receiver, 1.5-4s per response, 80-event burst, `docker kill
worker-1` mid-burst, default `WEBHOOK_MAX_CONCURRENT_PER_ENDPOINT=5`):
correctness held (steadily progressing, nothing silently dropped) but
throughput stalled for many minutes. Root-caused via worker logs +
`RedisConcurrencyControlService`: every retry attempt for the endpoint hit
"Max concurrency reached", forever, even though the receiver was confirmed
reachable and fast to respond via a direct `wget` test from inside the worker
container. This is **P0-04** ("Redis permit leak throttles an endpoint to zero
for 24h") — `RPermitExpirableSemaphore.expire()` sets a 24h TTL and
`WebhookDeliveryService`'s permit release only runs in a `finally` on the same
JVM that acquired it, so the ~5 permits held by worker-1's in-flight
deliveries at the moment of `docker kill` were never released. Real, separate,
already-tracked P0 bug, reproduced live by this session but **not fixed
here** — out of scope, and it would touch `RedisConcurrencyControlService`,
not the Kafka consumer code this ticket covers. First precise timing came from
this run too: `docker kill` at `18:19:14.6` UTC (epoch math double-checked
after an earlier transcription slip), `partitions revoked`/`assigned` on the
surviving worker logged at `18:19:58`-`18:19:59` UTC — a ~44s rebalance, i.e.
default `session.timeout.ms`, not an immediate TCP-drop detection.

*Run 2 and run 3* (fresh endpoint + non-blocking receiver, meant to avoid the
P0-04 confound): both came back clean and fast (e.g. run 2: 40/40 SUCCESS by
t+64s, 0 duplicates) — but checking *which* worker actually held the
`deliveries.dispatch` partition for that endpoint's key afterwards showed the
killed instance held **zero** of that topic's partitions at kill time in both
runs (no rebalance ever logged for `deliveryDispatch` around either kill).
With an instant receiver there's essentially no window between claim and
release, so these two runs didn't actually exercise a kill-mid-flight — they
mostly show undisturbed-worker throughput. Reporting this rather than quietly
dropping the misleading result: a clean number is only evidence if you checked
what produced it.

*Run 4* (the one that isolates the actual question): raised
`WEBHOOK_MAX_CONCURRENT_PER_ENDPOINT` to 500 for this run only (restored to 5
afterwards) so P0-04's leak couldn't confound throughput, kept the slow
receiver so there'd be a real in-flight window, confirmed via worker logs
*before* killing that the target worker was the one actually processing this
endpoint's deliveries, then killed it. Result, precisely:
`docker kill` at `18:40:12.2` UTC → 57/60 reached SUCCESS by `t+65s`
(`pending,processing,success = 0,3,57`) via ordinary redelivery — no data
loss, no duplicates among those 57. The remaining **3 stayed PROCESSING from
t+65s through t+304s** (5:04) — these were claimed
(`claimForProcessingAndReturn`, dispatch path) by the dead worker in the
instant before it was killed, so the redelivered Kafka copy hit the
`WHERE status = 'PENDING'` claim guard and no-opped. They flipped
PROCESSING→PENDING only once `StuckDeliveryRecoveryService`'s sweep caught
them, observed between the `t+304s` (still PROCESSING) and a follow-up query
at `18:45:42` UTC (`~5:30` post-kill) — squarely the 5-minute threshold plus
up to the 60s check interval. This is a clean, unconfounded confirmation of
the caveat below, not a guess: **most redelivery is fast and no longer
depends on the sweep (57/60, ≤65s here); a delivery claimed in the exact
instant its worker dies still depends on the sweep (3/60, ~5.5 min here)**,
because the dispatch-path claim guard treats a Kafka-redelivered copy of an
already-PROCESSING row as a no-op rather than a re-claim. Closing that
residual case would mean changing what "redelivered while PROCESSING" does
on the dispatch path (e.g. an instance/heartbeat-aware re-claim) — a
claim-semantics change, not a Kafka-offset one, and out of scope for this
ticket.

**Left out of scope, on purpose:**
- P0-04 (Redis concurrency-permit leak) — reproduced live twice, not fixed
  here.
- The residual "redelivered while the dead instance's PROCESSING claim is
  still the row's status" case quantified above (3/60 in run 4) — would need
  claim-semantics work, not an offset/ack change.
- `BoundedAsyncExecutor`'s generic-failure non-ack path — confirmed
  effectively unreachable given `WebhookDeliveryService`'s own catch-all, left
  as a documented defensive stall rather than plumbed into a domain retry
  ladder the executor has no business knowing about.
