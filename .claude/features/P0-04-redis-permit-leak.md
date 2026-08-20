# P0-04 — Redis permit leak throttles an endpoint to zero for 24 hours

- **Status:** TODO
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

- [ ] Reproduce first: force `decryptSecret` to throw, run
      `max-concurrent-per-endpoint + 1` attempts, assert the endpoint is then
      permanently blocked. **See it block.**
- [ ] Pass a `leaseTime` to `tryAcquire` — request timeout plus a margin — so
      orphaned permits self-heal without operator action.
- [ ] Move everything from the acquire (line ~249) through to the existing
      `finally` inside the guarded region, so no path can escape without
      releasing. Remove the now-redundant manual release in the SSRF branch.
- [ ] Audit every other early `return` between acquire and `finally`
      (`sed -n '246,335p' webhook-platform-worker/.../WebhookDeliveryService.java`)
      and confirm none skips the release.
- [ ] Fix the `activePermits` gauge drift: `RedisConcurrencyControlService.java:144-146`
      decrements in the `else` branch even when no permit was locally held, so
      the metric goes negative. (Related: P1-26 covers the other lying metrics —
      just this one here, since it is in the file you are already changing.)

## Tests to write

- New `RedisConcurrencyControlServiceTest`: a permit acquired and never
  explicitly released becomes available again after the lease expires.
- Extend a `WebhookDeliveryService` test (P1-22 creates the class; if it does not
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

- [ ] A crashed/throwing path can no longer permanently exhaust an endpoint's permits.
- [ ] Fixing a bad cert restores delivery immediately.
- [ ] `activePermits` gauge cannot go negative.
- [ ] Tests fail against old code, pass against new.

## Progress log
