# P3-35 — Load/soak harness and SDK contract tests

- **Status:** DONE (harness, receiver, and contract-test suites complete and verified; real throughput/soak numbers not captured in this sandbox — see Progress log)
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

- [x] Add a load harness (k6 is the lightest fit for this stack). Scenarios worth
      having: sustained ingestion at target RPS; fan-out burst (1 event → N
      deliveries); an endpoint that is slow, then down, then recovers; ordered
      deliveries under backlog — the exact condition where P1-23 showed FIFO
      silently disengages.
- [ ] Define and record target numbers: events/sec ingested, deliveries/sec,
      p99 delivery latency, and the point at which the outbox backs up. Publish
      them — a self-hosted infra product is judged on whether the maintainer
      knows their own numbers.
      **Partial**: the harness computes and reports all four numbers
      (`load/ingest.js` + `load-receiver`'s `/_control/summary` for
      events/sec, deliveries/sec, p99; `load/scripts/outbox-depth.sh` for
      backlog onset) and `load/README.md` has a table to fill in — but no
      real numbers were captured in this sandbox session (no spare Docker
      capacity — see Progress log). Not ticked because "record... publish
      them" isn't done, only made possible.
- [ ] Add a soak run (hours, not minutes) watching for connection leaks, memory
      growth, and Redis key accumulation. `leak-detection-threshold: 60000` is
      already configured and will report.
      **Partial**: `load/soak.js` + `load/scripts/monitor-soak.sh` exist and
      were smoke-tested (60s slice), but the actual hours-long run was not
      executed here — see Progress log for exactly why and how to run it.
- [x] SDK contract tests: run each SDK's suite against a real API instance in CI
      (the P1-15 images make this cheap), or generate SDK request expectations
      from the committed OpenAPI spec (P2-33). Prefer the latter — it catches
      drift at build time rather than at runtime.
      No committed OpenAPI spec exists yet (P2-33 not done — confirmed via
      `find . -iname "*openapi*"`, only the runtime `OpenApiConfig.java`
      exists), so this uses the documented fallback: hand-written contract
      tests per SDK, run against a live API instance in CI.
- [ ] Optional, lower value than the above: a small Playwright suite covering
      login → create project → create endpoint → send event → see delivery.
      **Deliberately skipped** — explicitly the lowest-priority, optional
      item in this task, and everything above it took the full session.
- [x] Wire the load harness into CI as a **manually triggered** workflow, not on
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

**What was actually run in this sandbox** (no spare Docker capacity for a
real `make up` — see Progress log): all four k6 scenarios plus `soak.js`
were run with `k6 run` against a minimal, throwaway stand-in API server
(register/projects/api-keys/endpoints/subscriptions/events, not committed)
plus the real `load/receiver/server.js`, and all three SDK contract suites
were run against the same stand-in. Full real output for each is in the
Progress log below. Every one of these needs to be re-run against a real
`make up` stack to get real numbers — commands are exactly the ones in this
section (and `pytest tests/contract -v`, `composer test:contract` for
python/php).

## Definition of done

- [x] Load harness exists with at least the four scenarios above.
- [ ] Published throughput/latency numbers with the conditions they were measured under.
- [ ] Soak run completed; leaks investigated or ruled out.
- [x] SDK drift caught automatically.

## Progress log

**2026-08-21 — implementation session**

### What exists now

- `load/` — k6 harness:
  - `load/lib/config.js`, `load/lib/setup.js` — shared env-var config and
    register/project/api-key/endpoint/subscription bootstrap helpers.
  - `load/ingest.js` — sustained ingestion at `TARGET_RPS` via
    `constant-arrival-rate`.
  - `load/fanout.js` — creates `FANOUT_N` endpoints on one event type, sends
    `EVENTS_TO_SEND` events, asserts `deliveriesCreated === FANOUT_N` and
    compares the receiver's actual count against the expected total.
  - `load/failure-recovery.js` — two concurrent scenarios: steady traffic
    for the whole run, and a phase controller that walks load-receiver
    through healthy → slow → down → healthy while traffic keeps flowing.
  - `load/ordering.js` — the P1-23 black-box reproduction: one forced
    retry (via load-receiver's `/_control/fail-next`) opens a gap, then a
    burst of successor events fires immediately behind it; a
    `ordering_violations` k6 threshold fails the run (non-zero exit) if
    load-receiver saw them arrive out of order.
  - `load/soak.js` — hours-scale constant-arrival-rate ingestion, meant to
    run alongside `load/scripts/monitor-soak.sh`.
  - `load/receiver/server.js` — the controllable "customer server" all
    scenarios deliver to: mode healthy/slow/down, forced-failure counter,
    and a received-request log with latency + ordering stats at
    `GET /_control/summary`. Zero npm dependencies (plain `http`).
  - `load/docker-compose.load.yml` — additive compose file joining
    `load-receiver` to `webhook-network` without touching the main
    `docker-compose.yml`.
  - `load/scripts/monitor-soak.sh` — polls HikariCP active/pending
    connections, JVM heap, outbox pending count + oldest-pending age, and
    Redis `DBSIZE` every 60s via `docker compose exec` (actuator's
    management port isn't published to the host under `make up`, by
    design — see docker-compose.yml's MANAGEMENT_PORT comment).
  - `load/scripts/outbox-depth.sh` — one-shot outbox backlog snapshot.
  - `load/README.md` — setup (including the required
    `WEBHOOK_ALLOW_PRIVATE_IPS=true` for load-receiver's private Docker
    address to pass SSRF checks), how to run each scenario, how to read
    results, soak-run instructions, and an honest "what was actually
    verified" section.

- SDK contract tests, one per SDK, each bootstrapping its own throwaway
  tenant via raw HTTP against the JWT-authenticated endpoints (the SDKs
  themselves are API-key-scoped only) then exercising the real client:
  - `sdks/node/tests/contract/` (`client.contract.test.ts`, `support.ts`,
    `README.md`) + `sdks/node/jest.contract.config.js` +
    `sdks/node/tsconfig.contract.json` + `npm run test:contract`.
  - `sdks/python/tests/contract/` (`test_client_contract.py`, `support.py`,
    `conftest.py`) + `contract` pytest marker in `pytest.ini` +
    `pytest tests/contract -v`.
  - `sdks/php/tests/Contract/` (`ClientContractTest.php`,
    `ContractSupport.php`) + `phpunit.contract.xml` +
    `composer test:contract`.
  - Each suite skips gracefully (not fails) when the API isn't reachable —
    checked once via `GET /v3/api-docs` (permitAll on the main port;
    `/actuator/health/liveness` deliberately avoided — under `make up`
    actuator lives only on the internal MANAGEMENT_PORT, not published to
    the host).
  - No committed OpenAPI spec exists yet (P2-33, separate task, not done —
    confirmed by `find . -iname "*openapi*"`, which only turns up the
    runtime `OpenApiConfig.java`), so this is the documented fallback:
    hand-written assertions against a live instance. Each contract test file
    says so and points at P2-33 as the better long-term approach.

- `.github/workflows/load-and-contract-tests.yml` — `workflow_dispatch`
  (with an opt-in boolean for a 60s `soak.js` smoke slice) + nightly cron
  (03:00 UTC) only, **no** `push`/`pull_request` trigger. Two jobs:
  `k6-load-tests` (builds the stack via `make up`, starts `load-receiver`,
  runs all four scenarios with short-but-real params, snapshots outbox
  depth, tears down) and `sdk-contract-tests` (builds the stack, runs all
  three SDK contract suites against it).

### Why no real `make up` run happened here

This sandbox's Docker daemon was already busy: `docker ps` showed other
agents' Testcontainers runs in progress (`testcontainers-ryuk`, an active
Postgres container from another worktree) and `free -h` showed ~1.2GB free
RAM out of 15GB. `docker-compose.yml` uses fixed container names
(`webhook-postgres`, `webhook-kafka`, `webhook-redis`, ...) shared across
every worktree in this repo, so a second `make up` here risked colliding
with or starving another agent's run rather than just failing cleanly for
me. The task instructions explicitly allow for this ("If a full soak run...
or full k6 execution isn't feasible in this sandbox session, say so
explicitly and document exactly how to run it... rather than fabricating
results") — see `load/README.md`'s "What was actually verified" section for
the full reasoning and for exactly what was verified instead.

### What was actually verified instead

k6 was installed from a static binary
(`grafana/k6` `v2.2.0-linux-amd64.tar.gz`) since it isn't preinstalled here.
A minimal, throwaway stand-in for the API
(register/projects/api-keys/endpoints/subscriptions/events, with best-effort
delivery + one retry — not committed to the repo) plus the real
`load/receiver/server.js` were used to run every scenario end-to-end and
confirm the harness itself is mechanically correct — request shapes,
control-flow, thresholds, and exit codes, not real platform numbers.

`k6 run -e TARGET_RPS=10 -e DURATION=5s load/ingest.js` (against the stand-in):
```
✓ register status is 201
✓ create project status is 201
✓ create api key status is 201
✓ create endpoint (load.ingest_test) status is 201
✓ create subscription (load.ingest_test) status is 201
✓ ingest accepted (201)
✓ not rate limited (429)
load-receiver summary: {"totalReceived":50,"distinctSeqs":50,"outOfOrderTransitions":0,"inOrder":true,"latencyMsP50":38,"latencyMsP99":71,"currentMode":"healthy"}
THRESHOLDS: ingest_errors ✓ 'count<1' count=0
```

`k6 run -e FANOUT_N=5 -e EVENTS_TO_SEND=3 -e SETTLE_SECONDS=3 load/fanout.js`:
```
fanout setup: 5 endpoints subscribed to load.fanout_test, sending 3 events (expecting 15 deliveries)
✓ fanout event accepted (201)
✓ deliveriesCreated === 5
fanout result: expected 15 deliveries, load-receiver saw 15 (p50=32ms p99=70ms)
```

`k6 run` with short phase durations on `load/failure-recovery.js`: both the
`traffic` and `phase_control` scenarios ran concurrently for the full
scheduled duration and completed cleanly (30/30 checks passed); the
stand-in's naive retry logic produced some out-of-order arrivals during the
down/recovery phases, as expected from a backend with no ordering buffer —
not a signal about the real worker.

`k6 run -e BURST_SIZE=8 -e RETRY_WAIT_SECONDS=5 load/ordering.js` — this is
the one that matters most: against the stand-in (no per-endpoint ordering
buffer at all), the harness correctly **detected and failed on** the
violation:
```
ordering result: {...,"outOfOrderTransitions":3,"distinctSeqs":9,"inOrder":false}
ORDERING VIOLATED: 3 out-of-order transition(s) across 9 sequence numbers
THRESHOLDS: ordering_violations ✗ 'count==0' count=3
```
`k6 run` exited `99` (non-zero) — confirming this scenario is a real,
CI-checkable regression gate, not just a log line. It has not yet been run
against the real `OrderingBufferService`.

`k6 run -e TARGET_RPS=5 -e DURATION=3s load/soak.js` ran cleanly (16
iterations, 0 errors) — confirms the script itself works; the real
hours-long soak was not run.

Node/Python/PHP contract suites: all skip cleanly with no live API
(`5 skipped` node/php, `71 passed, 5 skipped` python — the 71 are the
existing stubbed-HTTP unit tests, untouched); against the stand-in API, all
15 contract tests (5 per SDK) pass. Along the way this caught two real bugs
in the tests themselves (not the platform) — a wrong exception-property name
(`statusCode` vs. the SDK's actual `status`) in the node suite, and a
mock-server gap (missing `createdAt` on the subscription response) that
surfaced the same way a real API/SDK drift would — both fixed. PHP was run
via `docker run --rm --network host php:8.2-cli` since PHP isn't installed
in this sandbox (`composer install` needed `unzip`, installed in the
container only, not persisted).

### Follow-up for whoever runs this against a real stack

1. `export WEBHOOK_ALLOW_PRIVATE_IPS=true` (or add to `.env`) before `make up`.
2. `make up && make wait-healthy`.
3. `docker compose -f docker-compose.yml -f load/docker-compose.load.yml --profile embedded-db up -d load-receiver`.
4. Run each scenario per `load/README.md`, record numbers in that file's
   "Target numbers" table.
5. For the soak run: `k6 run -e DURATION=4h -e TARGET_RPS=10 load/soak.js &
   ./load/scripts/monitor-soak.sh soak-results.csv`, then check
   `docker compose logs api worker | grep -i "connection leak"` and the CSV
   trends per `load/README.md`'s "Soak run" section.
6. `cd sdks/node && npm run test:contract`, `cd sdks/python && pytest
   tests/contract -v`, `cd sdks/php && composer test:contract`.
