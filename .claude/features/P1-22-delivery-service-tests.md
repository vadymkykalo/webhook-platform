# P1-22 — Tests for WebhookDeliveryService

- **Status:** DONE
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

- [x] **Decompose first.** 715 lines with 18 dependencies is not testable as-is,
      and a test suite bolted onto that shape will be brittle and unloved. Pull
      out the pure functions (`parseRetryDelays`, `backoffWithJitter`,
      `isRetryable`, `calculateNextRetry`) and the response/error handling. Keep
      the refactor behaviour-preserving and in its own commit so it can be
      reviewed separately from the tests.
      **Scope note:** pulled the four pure functions into a standalone
      `RetryPolicy` utility (commit `refactor:` below), behaviour-preserving —
      all 78 pre-existing worker unit tests passed unchanged immediately after.
      Did **not** additionally extract `handleResponse`/`handleError` into their
      own class: they're still private methods on `WebhookDeliveryService`, but
      are now fully covered by mocked-collaborator tests in
      `WebhookDeliveryServiceTest` (see next step), which was the actual blocker
      to testability. Left the further extraction as a follow-up rather than
      widening this task's diff further.
- [x] Test the pure functions first — they are trivial and currently uncovered:
      retry-delay parsing including malformed config, jitter bounds, which status
      codes are retryable, next-retry calculation at each attempt index including
      the clamp at the last tier.
      → `RetryPolicyTest` (35 tests).
- [x] Then the stateful paths, with mocked collaborators: 2xx → `SUCCESS`;
      4xx non-retryable → `FAILED` without retry; 5xx → retry scheduled on the
      right tier; timeout → retry; attempts exhausted → DLQ; concurrency
      rejection → reschedule (see P0-04); SSRF rejection → failed, permit
      released.
      → 7 new tests added to `WebhookDeliveryServiceTest` (18 total in that
      class now, up from 11 pre-existing P0-01..P0-07 regression tests).
- [x] `OrderingBufferService`: buffering, cursor advance, gap timeout.
      → `OrderingBufferServiceTest` (17 tests). **Not included:** the
      cursor-regression case from P1-23 — P1-23 is still `TODO` on the board
      (not in flight), per this task's own coordination note ("if P1-23 is in
      flight, the tests belong with the fix"); nothing to coordinate with yet.
      Left for whoever picks up P1-23.
- [x] `CircuitBreakerService`: open/half-open/closed transitions, thresholds,
      recovery. It has never been tested at all despite gating every delivery.
      → `CircuitBreakerServiceTest` (11 tests): closed/open `isCallPermitted`,
      fail-open on Redis unavailability, failure-rate trip, slow-call-rate trip,
      below-threshold no-trip, and `reset()`.
- [x] `StuckDeliveryRecoveryService` / `StuckForwardRecoveryService`: rows are
      recovered exactly when they should be, and untouched when they should not.
      → `StuckDeliveryRecoveryServiceTest` (5 tests) +
      `StuckForwardRecoveryServiceTest` (4 tests): lock acquired/not-acquired,
      threshold math, interrupted-lock handling, defensive not-held-by-thread
      guard.
- [x] The two consumers and `IncomingForwardRetryScheduler`.
      → `IncomingForwardConsumerTest` (2 tests, new — `DeliveryConsumer` already
      had `DeliveryConsumerTest` from P0-03) + `IncomingForwardRetrySchedulerTest`
      (4 tests: claim/dispatch, Kafka-send failure reschedule, governor cooldown
      skip). `DlqMonitoringService` also added (not explicitly named in this
      bullet but listed in the table above) → `DlqMonitoringServiceTest`
      (3 tests).

## Verification

```bash
mvn test -pl webhook-platform-worker
mvn test -pl webhook-platform-worker -Dtest=WebhookDeliveryServiceTest
```

- [x] With P1-28's coverage tooling in place, record worker-module line coverage
      before and after. State the number rather than "improved coverage".
      **P1-28 (JaCoCo) has not landed yet** — measured by temporarily adding the
      jacoco-maven-plugin to `webhook-platform-worker/pom.xml`, running the unit
      suite, reading `target/site/jacoco/jacoco.csv`, then reverting the pom
      change (`git checkout --`, not committed — that's P1-28's job). See
      Progress log for the numbers.

## Definition of done

- [x] `WebhookDeliveryService` decomposed (separate commit) and tested.
- [x] Every class in the table above has tests.
- [x] Before/after coverage numbers for the worker module in the log.

## Progress log

### Decomposition (separate commit, before any new tests)

Extracted `parseRetryDelays`, `isRetryable`, `calculateNextRetry`, `backoffWithJitter`
out of `WebhookDeliveryService` into a new package-private `RetryPolicy` utility
(`webhook-platform-worker/.../service/RetryPolicy.java`), verbatim logic, call sites
updated to `RetryPolicy.xxx(...)`. Ran the full pre-existing worker unit suite
immediately after, before writing a single new test, to prove it's behaviour-preserving:

```
$ mvn -pl webhook-platform-worker test -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 - SchedulingPoolSizeTest
Tests run: 5, Failures: 0, Errors: 0, Skipped: 0 - DeliveryConsumerTest
Tests run: 6, Failures: 0, Errors: 0, Skipped: 0 - PayloadTransformServiceTest
Tests run: 12, Failures: 0, Errors: 0, Skipped: 0 - MtlsWebClientFactoryTest
Tests run: 8, Failures: 0, Errors: 0, Skipped: 0 - BoundedAsyncExecutorTest
Tests run: 3, Failures: 0, Errors: 0, Skipped: 0 - RedisConcurrencyControlServiceTest
Tests run: 5, Failures: 0, Errors: 0, Skipped: 0 - StaleDeliveryEscalationServiceTest
Tests run: 9, Failures: 0, Errors: 0, Skipped: 0 - IncomingForwardServiceTest
Tests run: 9, Failures: 0, Errors: 0, Skipped: 0 - RetrySchedulerServiceTest
Tests run: 11, Failures: 0, Errors: 0, Skipped: 0 - WebhookDeliveryServiceTest
Tests run: 9, Failures: 0, Errors: 0, Skipped: 0 - RetryGovernorTest
(78 tests total, 0 failures, 0 errors)
```

Committed as `refactor: extract RetryPolicy pure functions out of WebhookDeliveryService (P1-22)`.

### New test classes added

```
webhook-platform-worker/src/test/java/com/webhook/platform/worker/service/RetryPolicyTest.java              (35 tests)
webhook-platform-worker/src/test/java/com/webhook/platform/worker/service/OrderingBufferServiceTest.java     (17 tests)
webhook-platform-worker/src/test/java/com/webhook/platform/worker/service/CircuitBreakerServiceTest.java     (11 tests)
webhook-platform-worker/src/test/java/com/webhook/platform/worker/service/StuckDeliveryRecoveryServiceTest.java (5 tests)
webhook-platform-worker/src/test/java/com/webhook/platform/worker/service/StuckForwardRecoveryServiceTest.java  (4 tests)
webhook-platform-worker/src/test/java/com/webhook/platform/worker/service/IncomingForwardRetrySchedulerTest.java (4 tests)
webhook-platform-worker/src/test/java/com/webhook/platform/worker/service/DlqMonitoringServiceTest.java      (3 tests)
webhook-platform-worker/src/test/java/com/webhook/platform/worker/consumer/IncomingForwardConsumerTest.java  (2 tests)
```

Plus 7 new tests appended to the existing
`webhook-platform-worker/src/test/java/com/webhook/platform/worker/service/WebhookDeliveryServiceTest.java`
(11 pre-existing P0-01..P0-07 regression tests → 18 total): 2xx success, 4xx
non-retryable, 5xx retry-at-first-tier, HTTP timeout retry, 5xx-at-max-attempts DLQ,
concurrency-rejected reschedule (no permit to release), SSRF-blocked-URL failed +
permit released.

### Full worker-module unit run (new + all pre-existing)

```
$ mvn -pl webhook-platform-worker test -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'
166 tests total, Failures: 0, Errors: 0
```

### Verification block (run verbatim, Docker available)

```
$ mvn test -pl webhook-platform-worker
...
[INFO] Tests run: 179, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  03:27 min
```
(179 = 166 unit + 13 Docker/Testcontainers: DeliveryRepositoryTest(6),
DeliveryEndToEndIntegrationTest(6), KafkaAckOrderingIntegrationTest(1). The
Hibernate "drop table ... Unsuccessful" ERROR lines in the raw log are
Testcontainers-container-already-torn-down noise during `@PreDestroy` schema
cleanup at JVM shutdown, not test failures — confirmed by the `BUILD SUCCESS` /
`Tests run: 179, Failures: 0, Errors: 0` summary immediately after.)

```
$ mvn test -pl webhook-platform-worker -Dtest=WebhookDeliveryServiceTest
[INFO] Tests run: 18, Failures: 0, Errors: 0, Skipped: 0 - WebhookDeliveryServiceTest
[INFO] BUILD SUCCESS
```

### Regression proof (red → green), as required by the working protocol

**Proof 1 — RetryPolicy.isRetryable:** temporarily changed
`return statusCode == 408 || statusCode == 429 || (statusCode >= 500 && statusCode < 600);`
to drop the `5xx` clause. Re-ran `RetryPolicyTest` + `WebhookDeliveryServiceTest`:

```
Tests run: 35, Failures: 5, Errors: 0 - RetryPolicyTest
  isRetryable_trueForTimeoutRateLimitAnd5xx{int}[3..7]: expected <true> but was <false>
Tests run: 18, Failures: 2, Errors: 0 - WebhookDeliveryServiceTest
  attemptDelivery_5xxResponse_schedulesRetryAtFirstTier: expected <PENDING> but was <FAILED>
  attemptDelivery_5xxAtMaxAttempts_movesToDlq_publishesDlqEvent: (DLQ path also broke)
```
Reverted the change (`git diff --stat` on `RetryPolicy.java` back to empty), re-ran:
`RetryPolicyTest: Tests run: 35, Failures: 0` / `WebhookDeliveryServiceTest: Tests run: 18, Failures: 0`.

**Proof 2 — concurrency-permit release:** temporarily emptied the `finally` block in
`attemptDelivery` that calls `concurrencyControlService.release(endpoint.getId())`
(reproducing the P0-04-shaped leak for any pre-HTTP throw). Re-ran
`WebhookDeliveryServiceTest`:

```
Tests run: 18, Failures: 4, Errors: 0
  attemptDelivery_ssrfBlockedUrl_marksFailed_releasesPermit_noHttpCall: WantedButNotInvoked
  attemptDelivery_2xxResponse_marksSuccess_noRetryScheduled: WantedButNotInvoked
  attemptDelivery_decryptSecretThrows_releasesPermitEveryTime_soEndpointNeverBlocks:
    expected <true> but was <false>  (pre-existing P0-04 regression test also caught it)
  attemptDelivery_httpTimeout_schedulesRetry: WantedButNotInvoked
```
Reverted the change (`git diff --stat` back to empty), re-ran: `Tests run: 18, Failures: 0`.

### Coverage: before / after (P1-28's JaCoCo tooling doesn't exist yet)

Measured by temporarily adding `jacoco-maven-plugin` to
`webhook-platform-worker/pom.xml` (never committed — reverted with
`git checkout -- webhook-platform-worker/pom.xml` immediately after each
measurement), running the unit suite, and reading `target/site/jacoco/jacoco.csv`.
"Before" = worker module at commit `f34d971` (develop HEAD this task branched from,
i.e. right after P1-21 merged), measured in a disposable `git worktree` at that
commit so the main working tree was never touched. "After" = current tree.

| Scope | Before | After |
|---|---|---|
| **Whole worker module (line coverage)** | 1199/2428 = **49.4%** | 1592/2430 = **65.5%** |
| `WebhookDeliveryService` | 296/471 = 62.8% | 327/451 = 72.5% |
| `RetryPolicy` (new class) | — | 22/22 = 100.0% |
| `OrderingBufferService` | 1/81 = 1.2% | 77/81 = 95.1% |
| `CircuitBreakerService` | 1/89 = 1.1% | 85/89 = 95.5% |
| `StuckDeliveryRecoveryService` | 0/23 = 0.0% | 23/23 = 100.0% |
| `StuckForwardRecoveryService` | 0/19 = 0.0% | 19/19 = 100.0% |
| `DeliveryConsumer` | 35/42 = 83.3% (already had tests) | 35/42 = 83.3% |
| `IncomingForwardConsumer` | 0/26 = 0.0% | 22/26 = 84.6% |
| `IncomingForwardRetryScheduler` | 0/126 = 0.0% | 84/126 = 66.7% |
| `DlqMonitoringService` | 0/55 = 0.0% | 24/55 = 43.6% |

(`WebhookDeliveryService`'s line count dropped 471→451 purely from the decomposition
moving ~20 lines of pure-function logic out into `RetryPolicy`, not from deleting
coverage.)

### What was deliberately left out

- `handleResponse`/`handleError` were **not** additionally extracted into their own
  class — see the scope note on the "Decompose first" step above. They're tested via
  mocked-collaborator tests on `WebhookDeliveryService` itself instead.
- The **P1-23 cursor-regression case** for `OrderingBufferService` was not written —
  P1-23 is still `TODO`/not in flight, and the task's own instruction is to coordinate
  with that fix when it lands, not pre-empt it.
- `IncomingForwardRetryScheduler`'s `pollAndReschedule` self-rescheduling loop
  (the `@PostConstruct`-started `ScheduledExecutorService` wrapper) is not directly
  tested — only the package-private `pollPendingRetries(long)` it calls, which holds
  all the actual claim/dispatch/result logic. Same approach `RetrySchedulerServiceTest`
  already used for the outgoing-delivery equivalent.
- `DlqMonitoringService` is tested with a real (but unreachable) `KafkaAdmin` rather
  than mocks, since it constructs its own internal `AdminClient` via a static factory
  with no seam to inject a mock — this exercises the bounded-timeout behaviour for
  real rather than asserting on Mockito expectations, but doesn't cover the
  happy-path offset-arithmetic branch (would need a real reachable Kafka/Testcontainers,
  out of scope for a unit test).
