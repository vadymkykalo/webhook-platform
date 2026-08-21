# P1-26 — Thread/pool sizing, @Transactional bypass, lying metrics

- **Status:** IN PROGRESS
- **Priority:** P1
- **Branch:** `feature/P1-26-pools-transactions-metrics`
- **Depends on:** P0-06 (scheduler pool) — land that first
- **Modules:** `webhook-platform-worker`, `webhook-platform-api`

Three unrelated defects grouped because each is small and none justifies its own
branch. Tick them off individually.

## 26a — Worker thread budget exceeds the DB connection pool

`webhook-platform-worker/src/main/resources/application.yml`:
`hikari.maximum-pool-size: 40` against `webhook.outgoing-pool-size: 50` +
`webhook.incoming-pool-size: 20`, plus the retry scheduler thread, the incoming
retry scheduler thread, and the scheduled jobs.

The transactions themselves are short — nothing spans the outbound HTTP call,
which is done correctly — so this is contention, not deadlock. But at ~70
concurrent tasks each doing 3–4 short transactions, connection acquisition waits
show up as latency and `leak-detection-threshold: 60000` starts logging.

This is a **sizing mismatch to verify under load**, not a proven defect. Do not
just bump a number.

- [ ] Measure first: run sustained load and record Hikari
      `hikari_connections_pending` / acquisition timing from
      `/actuator/prometheus`. If there is no waiting, say so and close this item.
- [ ] If there is waiting, size the pool against the real concurrent-transaction
      count, not the thread count, and document the relationship in `.env.dist`
      so the two cannot drift apart again.
- [ ] Check the API side too (pool = 30) against its own concurrency, especially
      after P1-25 removes the long ingress transaction.

## 26b — `@Transactional` self-invocation in UsageDailyAggregator

`webhook-platform-api/.../service/UsageDailyAggregator.java:53-54` —
`@Transactional public void aggregateForProject(...)` is invoked from
`aggregateYesterday` at line ~43 on `this`, so the proxy is bypassed and **the
annotation does nothing**.

This is the only genuine self-invocation instance in the codebase — I checked the
two other grep hits (`OutboxPublisherService.promoteExhaustedToDead` is a javadoc
mention and uses `txTemplate` correctly; `IncidentService.getIncident` is a false
positive). Do not "fix" those.

Impact: the exists-check (line ~55) and the seven count queries each run in their
own transaction, so the billing `usage_daily` row is built from an inconsistent
snapshot and the check-then-insert is not atomic. ShedLock currently hides the
duplicate-insert risk — which means removing ShedLock later would surface a bug
nobody knew was there.

- [ ] Fix it the way the rest of this codebase already does — inject and use a
      `TransactionTemplate`, as `OutboxPublisherService` and `EventIngestService`
      do — rather than self-injection or `AopContext`.
- [ ] Make the check-then-insert atomic (unique constraint + upsert), so
      correctness does not depend on ShedLock.

## 26c — Five metrics that mislead the on-call

Each of these will send someone down the wrong path at 3am:

- `DlqMonitoringService.java:88-96` computes depth as `latest - earliest`, i.e.
  all **retained** DLQ records, not un-consumed ones — nothing consumes
  `deliveries.dlq`. The gauge never returns to 0 after remediation, and the
  "manual intervention may be required" warning at line ~100 fires every 60
  seconds forever until retention expires. An alert that never clears is an
  alert everyone learns to ignore.
- `OrderingBufferService.java:161` registers `webhook_ordering_buffer_size` with
  **no tags** on every buffered delivery. Micrometer returns the
  already-registered meter, so the gauge permanently reports whichever
  endpoint's buffer was registered first.
- `webhook_ordering_gap_timeout_total` is double-incremented —
  `OrderingBufferService.java:209` and `WebhookDeliveryService.java:538`.
  (P1-23 also lists this; whoever gets there first fixes it, the other confirms.)
- `RedisConcurrencyControlService.java:144-146` decrements `activePermits` in the
  `else` branch even when no permit was locally held, so the gauge drifts
  negative. (P0-04 covers this one; confirm it landed.)
- `SENDING` outbox state is not exported at all (P1-24 adds it; confirm).

- [ ] Fix the DLQ depth calculation to reflect actionable backlog, and make the
      warning clear when it does.
- [ ] Tag the ordering-buffer gauge by endpoint, or aggregate it deliberately —
      an untagged per-endpoint gauge is worse than none.
- [ ] Verify the three cross-referenced items above actually landed.
- [ ] Cross-check every gauge in the Grafana dashboards against what the code
      now emits — a dashboard panel bound to a broken metric is how these
      survived this long.

## Tests to write

- `UsageDailyAggregatorTest` (new): the aggregate runs in one transaction; a
  mid-run failure leaves no partial row; a duplicate run does not double-insert.
- Extend `DlqMonitoringServiceTest` (create if absent): depth returns to zero
  after the backlog is cleared.
- A metrics assertion test for the ordering gauge tags.

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest=UsageDailyAggregatorTest
mvn test -pl webhook-platform-worker
curl -s localhost:8080/actuator/prometheus | grep -E "outbox_|ordering_|dlq_"
curl -s localhost:8081/actuator/prometheus | grep -E "ordering_|concurrency_"
```

## Definition of done

- [ ] Pool sizing measured under load; changed or explicitly justified as-is.
- [ ] `UsageDailyAggregator` is genuinely transactional and idempotent.
- [ ] All five metrics report the truth; dashboards re-checked against them.

## Progress log
