# P3-35 — Load/soak harness and SDK contract tests

- **Status:** IN PROGRESS
- **Priority:** P3
- **Branch:** `feature/P3-35-load-and-contract-tests`
- **Depends on:** P1-21 (e2e harness), P1-15 (published images make load rigs easy)
- **Area:** new `load/` directory, `sdks/`, `.github/workflows/`

## The gap

**No load or soak testing exists** — no k6, Gatling, JMeter or benchmark file
anywhere in the repo. For a webhook platform whose entire value proposition is
throughput and reliability under failure, every performance claim is currently
unmeasured. Several P0/P1 findings (connection-pool sizing in P1-26, the
gap-timeout behaviour under backlog in P1-23, retry-tier throughput) can only be
settled by load.

**No SDK contract tests.** All three SDKs have unit tests against stubbed HTTP
(node 56 cases, python 71, php 48) but nothing validates them against a running
API or a shared OpenAPI contract. Drift between the API and three SDKs will be
discovered by users, not CI.

**No browser E2E** — no Playwright, no Cypress.

## Steps

- [ ] Add a load harness (k6 is the lightest fit for this stack). Scenarios worth
      having: sustained ingestion at target RPS; fan-out burst (1 event → N
      deliveries); an endpoint that is slow, then down, then recovers; ordered
      deliveries under backlog — the exact condition where P1-23 showed FIFO
      silently disengages.
- [ ] Define and record target numbers: events/sec ingested, deliveries/sec,
      p99 delivery latency, and the point at which the outbox backs up. Publish
      them — a self-hosted infra product is judged on whether the maintainer
      knows their own numbers.
- [ ] Add a soak run (hours, not minutes) watching for connection leaks, memory
      growth, and Redis key accumulation. `leak-detection-threshold: 60000` is
      already configured and will report.
- [ ] SDK contract tests: run each SDK's suite against a real API instance in CI
      (the P1-15 images make this cheap), or generate SDK request expectations
      from the committed OpenAPI spec (P2-33). Prefer the latter — it catches
      drift at build time rather than at runtime.
- [ ] Optional, lower value than the above: a small Playwright suite covering
      login → create project → create endpoint → send event → see delivery.
- [ ] Wire the load harness into CI as a **manually triggered** workflow, not on
      every PR — nightly at most. A load test on every push is a load test
      everyone disables.

## Verification

```bash
k6 run load/ingest.js
k6 run load/fanout.js
# record: events/sec, deliveries/sec, p99 latency, outbox depth over time
```

```bash
# contract tests against a live instance
make up && make wait-healthy
cd sdks/node && npm run test:contract
```

## Definition of done

- [ ] Load harness exists with at least the four scenarios above.
- [ ] Published throughput/latency numbers with the conditions they were measured under.
- [ ] Soak run completed; leaks investigated or ruled out.
- [ ] SDK drift caught automatically.

## Progress log
