# Launch punch-list — agent task board

Each `*.md` file here is **one self-contained task**. A fresh agent with no prior
context can open a single file and execute it end to end.

Findings were produced by a full audit (delivery pipeline, security, tests, UI,
OSS readiness) and every `file:line` citation in these tasks was read and
verified against the code at commit `a433518`. If a citation no longer matches,
the code moved — re-locate it before assuming the finding is stale.

`P0-37` and `P0-38` are the exception: they were not part of that audit. Both
were found live, during the manual verification step of `P0-02`, and their
citations are verified against whatever commit was current in that session,
not `a433518`.

## Working protocol

1. **Take the task you were assigned.** If you were not given one, take the
   lowest-numbered `TODO` whose `Depends on:` tasks are all `DONE` — but read
   "Running agents in parallel" below first: the `Status:` line is bookkeeping,
   **not a lock**, because your branch is invisible to other agents until it
   merges. Two agents can silently claim the same task.
2. **Branch from `develop`**, per the GitFlow policy in the root `CLAUDE.md`:
   ```bash
   git checkout develop && git pull
   git checkout -b feature/<task-id>-<slug>     # branch name is given in each file
   ```
   Never commit to `main`. Never commit to `develop` directly.
3. **Set `Status: IN PROGRESS`** in the task file and commit that change first,
   so parallel agents don't collide on the same task.
4. **Do the work.** Tick `- [ ]` → `- [x]` as each step lands.
   Some tasks group several small independent defects under lettered
   sub-sections (`14a`, `23b`, …) instead of one `## Steps` block. Those
   sub-sections are the steps — tick them the same way, and each is
   independently shippable if you run out of time.
5. **Write the tests the task names.** A task is not done because the code
   changed; it is done when a test that would have caught the original defect
   passes, and fails when the fix is reverted. Where the task gives a
   "reproduce first" step, do that step *before* fixing — a regression test you
   never saw fail proves nothing.
6. **Run the verification block** in the task verbatim. Paste real output into
   the `Progress log`, not a summary of it.
7. **Set `Status: DONE`**, fill the `Progress log` with what changed and
   anything you deliberately left out, then open a PR into `develop`.
8. If you cannot finish, set `Status: BLOCKED`, write why in the log, and leave
   the ticked steps ticked. Partial progress is useful; silent abandonment is not.

## Running agents in parallel

Most of these tasks touch the same handful of files, so "36 tasks" is not "36
parallel agents". There are **two independent streams**. Within a stream the
tasks are sequential — they edit the same files and would conflict; across the
two streams they are safe to run at the same time.

**Stream A — worker / delivery core.** Strictly in order. Every one of these
touches `WebhookDeliveryService`, `BoundedAsyncExecutor`, `DeliveryConsumer`,
`KafkaConsumerConfig` or `RetrySchedulerService`:

```
P0-01 → P0-02 → P0-03 → P0-04 → P0-05 → P0-07 → P1-21 → P1-22 → P1-23 → P1-24
```

**Stream B — api / security.** Mostly independent files, with two chains:

```
P0-09 ┐
P0-11 ├── independent, any order
P0-06 ┘   (P0-06 edits both application.yml files — do it when Stream A is between tasks)

P0-08 → P0-13          (P0-13 generalises P0-08's fix; same controllers)
P0-10 → P0-12          (both touch token issuance)
P0-10 → P0-14          (both touch AuthService)
```

**After both P0 streams are green**, the rest parallelises much more freely —
P1-15/16/17/18 (packaging and CI), P2-29..33 (UI, a different language), and
P3-34..36 barely overlap at all. Two exceptions that must stay ordered:
**P1-19** (Spring Boot upgrade) comes after P1-21 and P1-22, because upgrading an
untested delivery engine means finding the regressions in production; and
**P1-27** (SDK rename) is time-critical — it becomes impossible once the packages
are published.

If you are running one agent at a time, just follow the numbers.

## Test commands (this repo splits tests by class-name suffix)

```bash
# unit (no Docker)
mvn test -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'

# integration (needs Docker — Testcontainers)
mvn test -Dtest='*RepositoryTest,*IntegrationTest,*IT,*ConcurrencyTest,*RbacTest,*IsolationTest' -DfailIfNoTests=false

# one class / one method, scoped to a module
mvn test -pl webhook-platform-worker -Dtest=WebhookDeliveryServiceTest
mvn test -pl webhook-platform-api -Dtest='EndpointControllerTest#rejectsForeignProject'

# frontend
cd webhook-platform-ui && npm run lint && npm run typecheck && npm run test:ci
```

**Naming a new test class is a routing decision**: any class ending in
`IntegrationTest`, `IT`, `RepositoryTest`, `ConcurrencyTest`, `RbacTest` or
`IsolationTest` goes to the Docker-required CI job; everything else must pass
without Docker. See the `backend-tests` skill for the full contract.

## Board

| Task | Priority | Status | What it fixes |
|------|----------|--------|---------------|
| P0-01 | P0 | DONE | Retry claim leaves deliveries in an unrecoverable state |
| P0-02 | P0 | DONE | Deliveries dropped on every rolling deploy |
| P0-03 | P0 | DONE | Kafka offsets committed ahead of unfinished work |
| P0-04 | P0 | DONE | Redis permit leak throttles an endpoint to zero for 24h |
| P0-05 | P0 | DONE | Successful delivery re-sent as a duplicate |
| P0-06 | P0 | DONE | Single scheduler thread stalls platform-wide dispatch |
| P0-07 | P0 | DONE | Transform failure silently ships the untransformed payload |
| P0-08 | P0 | DONE | TestEndpointController has no tenancy check at all |
| P0-09 | P0 | DONE | Any user can rotate every tenant's encryption keys |
| P0-10 | P0 | DONE | Access token accepted as a refresh token |
| P0-11 | P0 | DONE | X-Forwarded-For spoofing defeats auth rate limiting |
| P0-12 | P0 | DONE | Device-code flow grants the wrong org role |
| P0-13 | P0 | DONE | API-key project scoping enforced inconsistently |
| P0-14 | P0 | DONE | Plaintext reset tokens, logged temp password, unsafe defaults |
| P1-15 | P1 | TODO | Publish Docker images — product is uninstallable today |
| P1-16 | P1 | TODO | Reconcile versions, backfill CHANGELOG, UPGRADING.md |
| P1-17 | P1 | DONE | Make CI security gates actually fail; add Dependabot |
| P1-18 | P1 | TODO | Fix and harden install.sh |
| P1-19 | P1 | TODO | Upgrade Spring Boot 3.2.0 (EOL) and base images |
| P1-20 | P1 | DONE | Alertmanager + Compose backup/restore automation |
| P1-21 | P1 | DONE | End-to-end delivery test (highest-value test in the list) |
| P1-22 | P1 | TODO | Tests for WebhookDeliveryService |
| P1-23 | P1 | TODO | Fix FIFO ordering (cursor regression, gap check, sequence) |
| P1-24 | P1 | TODO | Retry ladder vs 48h cap, outbox ordering, SENDING recovery |
| P1-25 | P1 | TODO | Incoming-forward claim + IngressService transaction scope |
| P1-26 | P1 | TODO | Thread/pool sizing, @Transactional bypass, lying metrics |
| P1-27 | P1 | TODO | Rename SDK packages to hookflow (irreversible after publish) |
| P1-28 | P1 | TODO | Coverage tooling (JaCoCo + vitest) |
| P2-29 | P2 | DONE | UI never tells the user the backend is down |
| P2-30 | P2 | TODO | Accessibility: zero aria-labels in the whole UI |
| P2-31 | P2 | TODO | Hardcoded strings + 704KB bundle from eager locales |
| P2-32 | P2 | TODO | Stored XSS via dangerouslySetInnerHTML + i18n |
| P2-33 | P2 | TODO | OSS metadata, docs site, demo, committed OpenAPI |
| P3-34 | P3 | TODO | Workflow engine and CLI command tests |
| P3-35 | P3 | TODO | Load/soak harness + SDK contract tests |
| P3-36 | P3 | TODO | Table partitioning + log aggregation |
| P0-37 | P0 | DONE | Outbox publisher never publishes (Hibernate mangles `::` cast in native query) |
| P0-38 | P0 | DONE | Never-attempted deliveries routed to the 24h retry tier |

Keep this table in sync with each file's `Status:` line — it is the only
place to see the board at a glance.
