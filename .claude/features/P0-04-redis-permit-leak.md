# P0-04 — Redis permit leak throttles an endpoint to zero for 24 hours

- **Status:** DONE
- **Priority:** P0
- **Branch:** `feature/P0-04-redis-permit-leak`
- **Depends on:** nothing
- **Module:** `webhook-platform-worker`

## The defect

Two bugs compound.

**1. Permits are acquired with no lease time.**
`RedisConcurrencyControlService.java:83`
```java
String permitId = semaphore.tryAcquire(100, TimeUnit.MILLISECONDS);
```
This is the `RPermitExpirableSemaphore` overload that takes *wait* time, not
*lease* time. The permit never auto-expires — it comes back only on an explicit
`release(permitId)`. `acquiredPermits` is an in-JVM map, so a crashed pod's
permits are unrecoverable until the whole key TTL (24h, line 89) lapses. Worse,
that TTL is refreshed only on a **successful** acquire, so an exhausted
semaphore stays exhausted.

**2. The acquire sits outside the `try/finally` that releases it.**
`WebhookDeliveryService.java:249` acquires; the `try { ... } finally { release }`
only opens at line ~310. In between: `decryptSecret` (line ~271, which throws
`RuntimeException` by design) and the mTLS client lookup (`MtlsWebClientFactory`
throws too). The author knew — the SSRF branch at line 265 releases manually —
but covered only that one path.

Failure: one endpoint with an unparsable mTLS key or a secret encrypted under a
rotated-away key burns a permit per attempt. After
`webhook.max-concurrent-per-endpoint` (default **5**) attempts the semaphore is
empty, and **every** delivery to that endpoint is rejected with "Max concurrency
reached" for the next 24 hours — including after the operator fixes the cert.

## Steps

- [x] Reproduce first: force `decryptSecret` to throw, run
      `max-concurrent-per-endpoint + 1` attempts, assert the endpoint is then
      permanently blocked. **See it block.**
- [x] Pass a `leaseTime` to `tryAcquire` — request timeout plus a margin — so
      orphaned permits self-heal without operator action.
- [x] Move everything from the acquire (line ~249) through to the existing
      `finally` inside the guarded region, so no path can escape without
      releasing. Remove the now-redundant manual release in the SSRF branch.
- [x] Audit every other early `return` between acquire and `finally`
      (`sed -n '246,335p' webhook-platform-worker/.../WebhookDeliveryService.java`)
      and confirm none skips the release.
- [x] Fix the `activePermits` gauge drift: `RedisConcurrencyControlService.java:144-146`
      decrements in the `else` branch even when no permit was locally held, so
      the metric goes negative. (Related: P1-26 covers the other lying metrics —
      just this one here, since it is in the file you are already changing.)

## Tests to write

- [x] New `RedisConcurrencyControlServiceTest`: a permit acquired and never
  explicitly released becomes available again after the lease expires.
- [x] Extend a `WebhookDeliveryService` test (P1-22 creates the class; if it does not
  exist yet, create a focused one here): when `decryptSecret` throws, the permit
  is released — assert by making N+1 consecutive failing attempts and then a
  successful one.

## Verification

```bash
mvn test -pl webhook-platform-worker -Dtest=RedisConcurrencyControlServiceTest
mvn test -pl webhook-platform-worker
```

Manual — this is the real-world trigger:
```bash
make up && make wait-healthy
# configure an endpoint with mTLS enabled and a deliberately corrupt client key
# send 6+ events to it, then fix the key
# assert deliveries resume immediately, not 24 hours later
```

## Definition of done

- [x] A crashed/throwing path can no longer permanently exhaust an endpoint's permits.
- [x] Fixing a bad cert restores delivery immediately.
- [x] `activePermits` gauge cannot go negative.
- [x] Tests fail against old code, pass against new.

## Progress log

**2026-08-20** — Implemented and verified.

Root cause confirmed by reading the code at the current commit (line numbers had
drifted from `a433518`, re-located both):

- `RedisConcurrencyControlService.tryAcquire` (was line 83, now ~83) called
  `semaphore.tryAcquire(100, TimeUnit.MILLISECONDS)` — the *wait-time-only*
  overload, so a permit never auto-expired.
- `WebhookDeliveryService.attemptDelivery` acquired the permit, then ran
  `decryptSecret` and the mTLS client lookup *before* the `try/finally` that
  released it (only the SSRF branch released manually, on its own early return).

### Changes

- `RedisConcurrencyControlService.java`: added a `webhook.concurrency.permit-lease-seconds`
  config (default 90s — the 60s max per-delivery HTTP timeout from `clampTimeout`
  plus margin for decrypt/mTLS/transform work before the HTTP call), threaded it
  into the 3-arg `tryAcquire(waitTime, leaseTime, unit)` overload. Fixed the
  `activePermits` gauge drift: `releaseLocal` now returns whether it actually held
  a local permit, and `release()` only decrements/counts when either the Redis-path
  permit or the local-fallback permit actually existed — a `release()` call with
  nothing to release (duplicate call, or no acquire at all) no longer drags the
  gauge negative.
- `WebhookDeliveryService.java`: restructured `attemptDelivery` so the single
  `try { ... } catch (SSRF) {...} catch (Exception) {...} finally { release }`
  now wraps everything from right after the concurrency acquire through the HTTP
  call — SSRF validation, attempt-count increment, `decryptSecret`, transform,
  signature, and the mTLS client lookup are all inside it. Removed the redundant
  manual `release()` in the old SSRF branch (now just one of the catch clauses,
  same as every other pre-HTTP failure). Audited every `return` between the
  acquire and the end of the method — the only remaining early returns are before
  the acquire succeeds (project rate limit / circuit breaker / rate limit /
  concurrency-reject), which correctly hold no permit.
- `.env.dist` / `application.yml`: documented `WEBHOOK_CONCURRENCY_PERMIT_LEASE_SECONDS` (default 90).

### Tests

- `RedisConcurrencyControlServiceTest` (new, Docker-free per the `backend-tests`
  routing rule — a mocked `RedissonClient` forces the local-fallback path
  deterministically instead of depending on Redisson's own already-trusted lease
  implementation): asserts the 3-arg `tryAcquire` overload is called with the
  configured lease, and that `release()` without a prior acquire — and a full
  acquire/release cycle — never drive the `activePermits` gauge negative.
- `WebhookDeliveryServiceTest.attemptDelivery_decryptSecretThrows_releasesPermitEveryTime_soEndpointNeverBlocks`
  (new): wires a *real* `RedisConcurrencyControlService` (with a mocked
  `RedissonClient` that throws, forcing the local-fallback path — no Docker) into
  `WebhookDeliveryService`, makes `encryptionKeyRegistry.decryptWithFallback`
  always throw, runs `maxConcurrentPerEndpoint + 1` (6) attempts through
  `processDelivery`, then asserts a further `tryAcquire` still succeeds.

**Reproduce-first / red-green proof (done exactly as instructed — temporarily
reverted just the buggy lines while keeping the new constructor signature so the
tests would still compile, ran the suite, then restored the fix):**

```
$ mvn test -pl webhook-platform-worker -Dtest=RedisConcurrencyControlServiceTest,WebhookDeliveryServiceTest
...
[ERROR] Tests run: 9, Failures: 3, Errors: 0, Skipped: 0
[ERROR]   RedisConcurrencyControlServiceTest.release_withoutAnyAcquire_doesNotDriveTheGaugeNegative:73
    expected: <0.0> but was: <-1.0>
[ERROR]   RedisConcurrencyControlServiceTest.tryAcquire_passesLeaseTime_soAnOrphanedPermitSelfHeals:59
    Argument(s) are different! Wanted: semaphore.tryAcquire(<any long>, 90L, SECONDS);
    Actual invocations: semaphore.tryAcquire(100L, MILLISECONDS);
[ERROR]   WebhookDeliveryServiceTest.attemptDelivery_decryptSecretThrows_releasesPermitEveryTime_soEndpointNeverBlocks:284
    "endpoint must not be permanently blocked..." ==> expected: <true> but was: <false>
[INFO] BUILD FAILURE
```

After restoring the fix, same command:

```
$ mvn test -pl webhook-platform-worker -Dtest=RedisConcurrencyControlServiceTest,WebhookDeliveryServiceTest
[INFO] Tests run: 9, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

**Full verification block:**

```
$ mvn test -pl webhook-platform-worker -Dtest=RedisConcurrencyControlServiceTest
[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS

$ mvn test -pl webhook-platform-worker
[INFO] Tests run: 70, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

(also ran the repo-wide unit split, `mvn test -pl webhook-platform-worker -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'` — 63/63 green.)

**Manual verification (`make up` stack was already running from a prior session;
rebuilt only the worker image — `docker-compose build worker && docker-compose up -d worker`
— to pick up the fix):**

1. Registered a fresh org/project via `/api/v1/auth/register`, created an endpoint
   pointed at an unreachable port, enabled mTLS with a deliberately corrupt
   `clientCert`/`clientKey`/`caCert`, created a subscription, sent 7 events.
2. Worker log for every one of the 7 deliveries: `ERROR ... HTTP request failed
   for delivery <id>: Failed to create mTLS client` followed immediately by
   `Scheduled retry 1 for delivery <id> at ...` — **none** rejected with "Max
   concurrency reached" (max-concurrent-per-endpoint default is 5, so under the
   old code the 6th/7th would have blocked).
3. `deliveries` table for that endpoint: all 7 rows `attempt_count = 1` (i.e. all
   7 actually reached the HTTP-attempt stage — a concurrency-rejected delivery
   stays at `attempt_count = 0`, since the increment happens only after the
   permit is acquired).
4. `/actuator/prometheus` on the worker: `webhook_concurrency_acquired_total 27`
   == `webhook_concurrency_released_total 27`, `webhook_concurrency_active_permits 0.0`
   (not negative).
5. Disabled mTLS (`DELETE .../mtls`, simulating the operator fixing the cert) and
   sent one more event: dispatched **immediately** — worker log shows the attempt
   right away (`Connection refused` on the dummy port, expected, but crucially
   *not* "Max concurrency reached" and no 24h wait).
6. Cleaned up the test project/endpoint afterward (`DELETE` on both).

### Left out of scope

- P1-26 covers the platform's other lying metrics; only the `activePermits`
  drift in this same file was touched here, as the task said.
- Did not add a Testcontainers-backed test for Redisson's actual lease-expiry
  wall-clock behavior — that's Redisson's own (already-trusted) library
  behavior, not something this fix's logic controls; the unit tests instead
  verify the parameter we actually own (the leaseTime value passed in), and the
  manual `make up` run exercised the real Redis path end-to-end.
