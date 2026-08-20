# P1-22 — Tests for WebhookDeliveryService

- **Status:** TODO
- **Priority:** P1
- **Branch:** `feature/P1-22-delivery-service-tests`
- **Depends on:** P1-21 helps but is not required
- **Module:** `webhook-platform-worker`

## The gap

`WebhookDeliveryService` is **715 lines with 18 injected collaborators and zero
tests** — the single riskiest file in the repository. It owns `attemptDelivery`,
`handleResponse`, `handleError`, `isRetryable`, `scheduleRetry`,
`publishDlqEvent`, `calculateNextRetry`, `parseRetryDelays`, `backoffWithJitter`.

This is the product. Everything else is a control plane around it.

Also untested (this task covers them too):

| Class | LOC |
|-------|-----|
| `OrderingBufferService` | 237 |
| `CircuitBreakerService` | 198 (appears only as a `@Mock` in two other tests) |
| `StuckDeliveryRecoveryService` | 56 |
| `StuckForwardRecoveryService` | 57 |
| `DeliveryConsumer` / `IncomingForwardConsumer` | 120 / 78 |
| `IncomingForwardRetryScheduler` | 249 |
| `DlqMonitoringService` | 109 |

## Steps

- [ ] **Decompose first.** 715 lines with 18 dependencies is not testable as-is,
      and a test suite bolted onto that shape will be brittle and unloved. Pull
      out the pure functions (`parseRetryDelays`, `backoffWithJitter`,
      `isRetryable`, `calculateNextRetry`) and the response/error handling. Keep
      the refactor behaviour-preserving and in its own commit so it can be
      reviewed separately from the tests.
- [ ] Test the pure functions first — they are trivial and currently uncovered:
      retry-delay parsing including malformed config, jitter bounds, which status
      codes are retryable, next-retry calculation at each attempt index including
      the clamp at the last tier.
- [ ] Then the stateful paths, with mocked collaborators: 2xx → `SUCCESS`;
      4xx non-retryable → `FAILED` without retry; 5xx → retry scheduled on the
      right tier; timeout → retry; attempts exhausted → DLQ; concurrency
      rejection → reschedule (see P0-04); SSRF rejection → failed, permit
      released.
- [ ] `OrderingBufferService`: buffering, cursor advance, gap timeout, and the
      cursor-regression case from P1-23. Coordinate — if P1-23 is in flight, the
      tests belong with the fix.
- [ ] `CircuitBreakerService`: open/half-open/closed transitions, thresholds,
      recovery. It has never been tested at all despite gating every delivery.
- [ ] `StuckDeliveryRecoveryService` / `StuckForwardRecoveryService`: rows are
      recovered exactly when they should be, and untouched when they should not.
- [ ] The two consumers and `IncomingForwardRetryScheduler`.

## Verification

```bash
mvn test -pl webhook-platform-worker
mvn test -pl webhook-platform-worker -Dtest=WebhookDeliveryServiceTest
```

- [ ] With P1-28's coverage tooling in place, record worker-module line coverage
      before and after. State the number rather than "improved coverage".

## Definition of done

- [ ] `WebhookDeliveryService` decomposed (separate commit) and tested.
- [ ] Every class in the table above has tests.
- [ ] Before/after coverage numbers for the worker module in the log.

## Progress log
