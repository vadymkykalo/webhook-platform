# 0003 — FIFO ordering is enforced by sequence numbers and an ordering buffer, not by Kafka partitions

**Status:** Accepted

## Context

Some subscriptions need per-endpoint FIFO: event N must reach the endpoint before event
N+1. The obvious lever is Kafka's own ordering guarantee — key by endpoint, one partition,
done.

It does not hold here, for three independent reasons:

1. Delivery is not the consumer's last act. A failed attempt goes onto a retry ladder
   (`RetrySchedulerService`) and is republished later, out of its original partition
   position. Kafka's ordering says nothing about a record that is re-sent minutes later.
2. Deliveries are dispatched to a bounded async executor (`BoundedAsyncExecutor`), so two
   records from the same partition can be in flight concurrently.
3. The retry topic is a different topic from the primary one.

Kafka ordering would therefore guarantee ordering only for the subset of deliveries that
succeed on the first attempt — which is precisely the case where ordering is least at
risk.

## Decision

Ordering is enforced in the application, against durable state:

- `SequenceGeneratorService` (api) stamps a monotonic per-endpoint sequence number, using
  a Redis `INCR`. It is generated **after** the ingest transaction commits
  (`EventIngestService#assignSequenceNumbersPostCommit`) so a rollback cannot burn a
  number no delivery carries, and it reseeds from `MAX(sequence_number)` in `deliveries`
  when it finds the Redis key gone — a Redis flush or LRU eviction would otherwise restart
  at 1 while the worker's cursor sits far higher, killing ordering for that endpoint
  permanently.
- `OrderingBufferService` (worker) holds the last-delivered sequence per endpoint and
  buffers any delivery that arrives ahead of its predecessor, in a Redis sorted set with
  `ordering_cursors` (Postgres, `V049`) as the durable fallback and a Lua CAS for the
  cursor advance.
- A delivery that completes releases its successors immediately
  (`triggerBufferedDeliveries`); a `ordering.buffer-reschedule-delay-seconds` poll is the
  fallback for when the trigger fired before the successor reached the buffer.
- A gap that never fills times out after `ordering.gap-timeout-seconds` and the delivery
  proceeds unordered, counted by `webhook_ordering_gap_timeout_total`.

## Consequences

- Ordering survives retries, concurrency and restarts — the cases that actually matter.
- It is **best-effort, not absolute**: the gap timeout deliberately trades strict order
  for liveness, because a permanently stuck predecessor would otherwise block an endpoint
  forever. The metric exists so that trade is visible rather than silent.
- Ordering correctness now depends on Redis *and* Postgres agreeing. Both reseed paths
  above exist because that agreement can be broken by ordinary operations.
- There is a narrow window after commit and before the post-commit sequence backfill in
  which a delivery has `ordering_enabled` but no sequence number. The worker treats that
  as unordered rather than blocking. Accepted, and documented at both call sites.
- How fast an out-of-order burst drains is governed by `RetryGovernor`'s poll cadence, not
  by the buffer's own reschedule delay.

## Alternatives rejected

- **Key by endpoint, single partition, rely on Kafka.** Fails for retries and concurrency,
  as above, and caps per-endpoint throughput at one partition.
- **Serialize per endpoint with a distributed lock held across the HTTP call.** A slow or
  hanging destination would hold the lock for the full timeout and stall the endpoint.
- **Buffer in memory in the worker.** Lost on restart and wrong across replicas.
