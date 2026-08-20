# P1-28 — Coverage tooling (JaCoCo + vitest)

- **Status:** TODO
- **Priority:** P1 — small, and it makes P1-22 and P3-34 measurable
- **Branch:** `feature/P1-28-coverage-tooling`
- **Depends on:** nothing (but most useful before the big test tasks)
- **Area:** `pom.xml`, `webhook-platform-ui/vite.config.ts`, `.github/workflows/ci.yml`

## The gap

```bash
grep -rn "jacoco" pom.xml webhook-platform-*/pom.xml     # nothing
grep -n "coverage" webhook-platform-ui/vite.config.ts    # nothing
```

There is no coverage measurement anywhere, in either language. You cannot state
a coverage number publicly today, and every test task in this punch-list
currently has to describe its outcome qualitatively.

## Steps

- [ ] Add JaCoCo to the root `pom.xml` with report aggregation across the four
      Java modules. Make sure it works with **both** CI test jobs (unit and
      integration are separate `mvn test` invocations with inverse `-Dtest=`
      filters — a naive setup will report only whichever ran last).
- [ ] Add `coverage` config to `vite.config.ts` (v8 provider) and a
      `test:coverage` script.
- [ ] Publish reports as CI artifacts so a PR reviewer can actually open them.
- [ ] Record a **baseline** per module before the test tasks start. That number
      is the point of this task — P1-22 and P3-34 should be able to cite a
      before and after.
- [ ] Set thresholds carefully. Start at or just below the current baseline and
      ratchet up as tests land. A threshold set aspirationally high on day one
      means a red build everyone learns to ignore — the same failure mode as
      P1-17's advisory gates, in reverse.
- [ ] Add a README badge once there is a real number behind it.
- [ ] Do **not** treat coverage as the goal. The worker module could hit a
      respectable percentage while `WebhookDeliveryService` stays untested,
      because the CRUD services are easy to cover. Report per-class coverage for
      the delivery path specifically.

## Verification

```bash
mvn clean test jacoco:report
open target/site/jacoco-aggregate/index.html      # or read the CSV

cd webhook-platform-ui && npm run test:coverage
```

- [ ] Confirm the aggregate report includes classes exercised only by the
      integration suite — that is the failure mode to check for.

## Definition of done

- [ ] Coverage measurable for Java (all four modules, both suites) and the UI.
- [ ] Baseline numbers recorded in the log, per module.
- [ ] Thresholds set at baseline, with a note on how they will ratchet.
- [ ] Reports available as CI artifacts.

## Progress log
