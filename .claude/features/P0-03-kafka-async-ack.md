# P0-03 — Kafka offsets committed ahead of unfinished work (at-most-once)

- **Status:** IN PROGRESS
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

- [ ] Reproduce first: a test (or a documented manual run) showing a higher
      offset committed while a lower offset is still in flight.
- [ ] Enable out-of-order acks with deferred commits:
      `containerProperties.setAsyncAcks(true)` in `KafkaConsumerConfig`.
      Read the Spring Kafka docs for the version in use and confirm the
      semantics you get — do not cargo-cult the flag.
- [ ] Alternative if `asyncAcks` does not fit: ack through an in-order
      completion tracker per partition. Pick one approach, state the reasoning
      in the log.
- [ ] Remove the reliance on "don't ack" as a retry mechanism — with MANUAL acks
      a non-ack does not redeliver until rebalance/restart. Anywhere the code
      skips acking to mean "retry later", make the retry explicit.
- [ ] Re-check the interaction with P0-02: shutdown rejection and ack ordering
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

- [ ] Committed offset never runs ahead of incomplete work.
- [ ] Recovery after a hard kill no longer depends on the 5-minute sweep.
- [ ] Chosen approach and its trade-off written in the log.

## Progress log
