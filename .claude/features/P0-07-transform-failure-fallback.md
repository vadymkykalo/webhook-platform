# P0-07 — Transform failure silently ships the untransformed payload

- **Status:** TODO
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

- [ ] Reproduce first: configure a transformation, break its template, send an
      event, and confirm the raw payload arrives with a `SUCCESS` record.
- [ ] Change the failure mode: a configured-but-inapplicable transformation must
      **fail the attempt as retryable**, not pass through. Apply to all three
      sites.
- [ ] Distinguish "no transformation configured" (fine, send as-is) from
      "transformation configured but failed" (fail). The current code conflates
      them — that conflation is the bug.
- [ ] Surface it: a dedicated error message on the delivery attempt, and a
      counter (e.g. `transform_failed_total`) so it is alertable rather than
      buried in a `log.warn`.
- [ ] Check the DLQ path — a permanently broken template must eventually reach
      DLQ rather than retrying forever.
- [ ] Consider whether an operator needs a deliberate opt-out
      ("send raw if transform fails") as an explicit per-transformation flag.
      If you add one, it must default to **off**.

## Tests to write

- `PayloadTransformServiceTest` (new): a broken template throws rather than
  returning the original payload.
- Extend `IncomingForwardServiceTest` (exists): a failing transform marks the
  forward attempt failed and does not POST the raw body.
- A delivery-side test asserting no HTTP call is made when a configured
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

- [ ] A failing configured transform never results in raw data leaving the platform.
- [ ] The failure is visible as an error + counter, not a warn log.
- [ ] Tests fail against old code, pass against new.

## Progress log
