# P0-07 — Transform failure silently ships the untransformed payload

- **Status:** DONE
- **Priority:** P0 — data exposure shaped
- **Branch:** `feature/P0-07-transform-failure-fallback`
- **Depends on:** nothing
- **Modules:** `webhook-platform-worker`

## The defect

Three places fall back to sending the **original, untransformed** payload when a
configured transformation cannot be applied:

- `PayloadTransformService.java:65-68`
  ```java
  } catch (Exception e) { log.warn(…); return originalPayload; }
  ```
- `WebhookDeliveryService.java:697-707` — a missing or disabled
  `transformationId` logs a warning and falls back to the inline template, or to
  no transform at all.
- `IncomingForwardService.java:589-596` — identical fallback for the JSONPath
  transform.

Why this is not a style issue: customers use transformations to **strip PII**
before forwarding to a third party. Someone disables the transformation, or a
template edit introduces a JSON syntax error — and every delivery then ships the
full raw event to the third-party endpoint, gets a 200, and is recorded
`SUCCESS`. Nothing in the UI or metrics says the payload was not transformed.

## Steps

- [x] Reproduce first: configure a transformation, break its template, send an
      event, and confirm the raw payload arrives with a `SUCCESS` record.
- [x] Change the failure mode: a configured-but-inapplicable transformation must
      **fail the attempt as retryable**, not pass through. Apply to all three
      sites.
- [x] Distinguish "no transformation configured" (fine, send as-is) from
      "transformation configured but failed" (fail). The current code conflates
      them — that conflation is the bug.
- [x] Surface it: a dedicated error message on the delivery attempt, and a
      counter (e.g. `transform_failed_total`) so it is alertable rather than
      buried in a `log.warn`.
- [x] Check the DLQ path — a permanently broken template must eventually reach
      DLQ rather than retrying forever.
- [x] Consider whether an operator needs a deliberate opt-out
      ("send raw if transform fails") as an explicit per-transformation flag.
      If you add one, it must default to **off**. (Considered, not added — see
      Progress log.)

## Tests to write

- [x] `PayloadTransformServiceTest` (new): a broken template throws rather than
  returning the original payload.
- [x] Extend `IncomingForwardServiceTest` (exists): a failing transform marks the
  forward attempt failed and does not POST the raw body.
- [x] A delivery-side test asserting no HTTP call is made when a configured
  transform fails.

## Verification

```bash
mvn test -pl webhook-platform-worker -Dtest=PayloadTransformServiceTest
mvn test -pl webhook-platform-worker -Dtest=IncomingForwardServiceTest
mvn test -pl webhook-platform-worker
```

Manual:
```bash
make up && make wait-healthy
# create a transformation that strips a field, verify it works
# break the template, send another event
# assert: the receiver gets NOTHING (not the raw payload), and the attempt is
# recorded as failed with a clear message
```

## Definition of done

- [x] A failing configured transform never results in raw data leaving the platform.
- [x] The failure is visible as an error + counter, not a warn log.
- [x] Tests fail against old code, pass against new.

## Progress log

### Summary

All three sites conflated "no transformation configured" (fine — send as-is)
with "transformation configured but failed to apply" (was silently sending the
raw payload; now fails the attempt as retryable). Fixed by introducing a new
unchecked `PayloadTransformException` (worker `service` package) that callers
must not swallow, and making each site throw it instead of falling back:

- **`PayloadTransformService.transform()`** (`webhook-platform-worker/src/main/java/com/webhook/platform/worker/service/PayloadTransformService.java`):
  `template == null || template.isBlank()` still returns the original payload
  (no transform configured — correct). Any other failure (invalid source JSON,
  invalid template JSON, processing error) now increments a
  `transform_failed_total{component="payload_transform_service"}` counter,
  logs at ERROR, and throws `PayloadTransformException` instead of returning
  `originalPayload`. Constructor changed from `@RequiredArgsConstructor` to an
  explicit constructor that also takes `MeterRegistry` (needed to register the
  counter) — Spring wires this automatically, no other call sites construct it
  manually.

- **`WebhookDeliveryService`** (`.../service/WebhookDeliveryService.java`):
  `resolveTransformTemplate()` now throws `PayloadTransformException` when
  `delivery.getTransformationId()` is set but
  `transformationCacheService.findEnabledTemplate(...)` returns null (deleted
  or disabled transformation), instead of silently falling back to the inline
  `payloadTemplate` (often null → raw payload). `attemptDelivery()` gained a
  dedicated `catch (PayloadTransformException e)` block (before the generic
  `catch (Exception e)`) that increments a new
  `transform_failed_total{component="outgoing_delivery"}` counter, logs at
  ERROR, and calls `handleError(...)` with a `"TRANSFORM_FAILED: " + message`
  prefix — same as the existing `SSRF_PROTECTION:` convention. `handleError`
  already routes into `scheduleRetry()`, which already has the DLQ-on-
  max-attempts logic, so no separate DLQ handling was needed — a transform
  failure now rides the exact same retry ladder as an HTTP failure and
  terminates at DLQ once `maxAttempts` is reached.

- **`IncomingForwardService`** (`.../service/IncomingForwardService.java`):
  `resolveAndTransformPayload()` — same fix shape as `WebhookDeliveryService`:
  a configured-but-missing/disabled `transformationId` throws instead of
  falling through to the inline `payloadTransform` JSONPath; a failing inline
  JSONPath expression (`PathNotFoundException` or any other exception) now
  throws `PayloadTransformException` instead of `log.warn(...); return body;`.
  `attemptForward()` gained a `catch (PayloadTransformException e)` block
  (before the generic `catch (Exception e)`) mirroring the delivery-side fix:
  increments `transform_failed_total{component="incoming_forward"}`, logs at
  ERROR, delegates to the existing `handleError(...)`, which already has the
  DLQ-at-`maxAttempts` logic. Removed the now-unused `PathNotFoundException`
  import.

- **Opt-out flag**: considered per the task's "Consider whether..." step, and
  deliberately **not added**. Reasoning: it would need a new column on both the
  `worker` and `api` `Transformation`/`Delivery`/`IncomingDestination` entities
  plus a Flyway migration (schema changes touch both module copies per
  `CLAUDE.md`), UI/API surface to set it, and — because P0-07 is explicitly a
  PII-leak fix — a default-off flag that operators could flip is exactly the
  footgun this task closes. No current requirement calls for it. If wanted
  later, it's a separate, reviewable follow-up task rather than something to
  fold into a P0 security fix.

### Reproduction (bug confirmed on old code)

Stashed the three `src/main` fixes (keeping the new tests) and ran the new/
extended tests against the unfixed code:

```
mvn test -pl webhook-platform-worker -Dtest=PayloadTransformServiceTest,IncomingForwardServiceTest,WebhookDeliveryServiceTest
...
Tests run: 23, Failures: 4, Errors: 6, Skipped: 0
BUILD FAILURE
```

Failures were exactly the P0-07 bug: `NoInteractionsWanted` on the mocked
`WebClient` because the old code called `webClient.post()` with the
(un-transformed or wrongly-transformed) payload in cases where it should have
failed the attempt instead — e.g.:

```
IncomingForwardServiceTest.configuredTransformationMissing_failsAttemptAsRetryable_doesNotForwardRawBody
org.mockito.exceptions.verification.NoInteractionsWanted:
No interactions wanted here: ... But found these interactions on mock 'webClient':
-> at com.webhook.platform.worker.service.IncomingForwardService.attemptForward(IncomingForwardService.java:276)

WebhookDeliveryServiceTest.attemptDelivery_configuredTransformationMissing_noHttpCall_failsRetryable
org.mockito.exceptions.verification.NoInteractionsWanted: ... found interactions on mock 'webClient'
-> at com.webhook.platform.worker.service.WebhookDeliveryService.attemptDelivery(WebhookDeliveryService.java:341)
```

(`PayloadTransformServiceTest` errored with `NoSuchMethodError` on old code
since it uses the new 2-arg constructor — expected, since that constructor
change is part of the fix.)

Restored the fix (`git stash pop`) and re-ran — all green (see below).

### Verification output (real, from this session)

```
$ mvn test -pl webhook-platform-worker -Dtest=PayloadTransformServiceTest
...
Tests run: 6, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

```
$ mvn test -pl webhook-platform-worker -Dtest=IncomingForwardServiceTest
...
Tests run: 9, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

```
$ mvn test -pl webhook-platform-worker
...
Tests run: 81, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

(`webhook-platform-worker`'s own `mvn test` run happened to reach a live
Postgres, so `*RepositoryTest` classes such as `DeliveryRepositoryTest` also
ran as part of the 81 and passed — not a Docker requirement of this change.)

Also ran `WebhookDeliveryServiceTest` on its own (8 tests, the 2 new P0-07
tests plus the 6 pre-existing ones) — all pass.

### Deliberately skipped

Manual verification block (`make up && make wait-healthy` + the
create-transformation / break-template / confirm-nothing-arrives walkthrough)
was **not run** in this worktree — other agents may be running the docker
compose stack concurrently in sibling worktrees, and this would port-collide.
Left for the coordinator to run centrally, per instructions.

### Files touched

- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/service/PayloadTransformException.java` (new)
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/service/PayloadTransformService.java`
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/service/WebhookDeliveryService.java`
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/service/IncomingForwardService.java`
- `webhook-platform-worker/src/test/java/com/webhook/platform/worker/service/PayloadTransformServiceTest.java` (new)
- `webhook-platform-worker/src/test/java/com/webhook/platform/worker/service/IncomingForwardServiceTest.java`
- `webhook-platform-worker/src/test/java/com/webhook/platform/worker/service/WebhookDeliveryServiceTest.java`
