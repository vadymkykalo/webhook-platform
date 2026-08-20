# Launch punch-list — agent task board

Each `*.md` file here is **one self-contained task**. A fresh agent with no prior
context can open a single file and execute it end to end.

Findings were produced by a full audit (delivery pipeline, security, tests, UI,
OSS readiness) and every `file:line` citation in these tasks was read and
verified against the code at commit `a433518`. If a citation no longer matches,
the code moved — re-locate it before assuming the finding is stale.

## Working protocol

1. **Pick the lowest-numbered task whose `Status:` is `TODO`** and whose
   `Depends on:` tasks are all `DONE`. Priority prefix is the order:
   `P0` (blocks any public exposure) → `P1` → `P2` → `P3`.
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
| P0-01 | P0 | TODO | Retry claim leaves deliveries in an unrecoverable state |
| P0-02 | P0 | TODO | Deliveries dropped on every rolling deploy |
| P0-03 | P0 | TODO | Kafka offsets committed ahead of unfinished work |
| P0-04 | P0 | TODO | Redis permit leak throttles an endpoint to zero for 24h |
| P0-05 | P0 | TODO | Successful delivery re-sent as a duplicate |
| P0-06 | P0 | TODO | Single scheduler thread stalls platform-wide dispatch |
| P0-07 | P0 | TODO | Transform failure silently ships the untransformed payload |
| P0-08 | P0 | TODO | TestEndpointController has no tenancy check at all |
| P0-09 | P0 | TODO | Any user can rotate every tenant's encryption keys |
| P0-10 | P0 | TODO | Access token accepted as a refresh token |
| P0-11 | P0 | TODO | X-Forwarded-For spoofing defeats auth rate limiting |
| P0-12 | P0 | TODO | Device-code flow grants the wrong org role |
| P0-13 | P0 | TODO | API-key project scoping enforced inconsistently |
| P0-14 | P0 | TODO | Plaintext reset tokens, logged temp password, unsafe defaults |
| P1-15 | P1 | TODO | Publish Docker images — product is uninstallable today |
| P1-16 | P1 | TODO | Reconcile versions, backfill CHANGELOG, UPGRADING.md |
| P1-17 | P1 | TODO | Make CI security gates actually fail; add Dependabot |
| P1-18 | P1 | TODO | Fix and harden install.sh |
| P1-19 | P1 | TODO | Upgrade Spring Boot 3.2.0 (EOL) and base images |
| P1-20 | P1 | TODO | Alertmanager + Compose backup/restore automation |
| P1-21 | P1 | TODO | End-to-end delivery test (highest-value test in the list) |
| P1-22 | P1 | TODO | Tests for WebhookDeliveryService |
| P1-23 | P1 | TODO | Fix FIFO ordering (cursor regression, gap check, sequence) |
| P1-24 | P1 | TODO | Retry ladder vs 48h cap, outbox ordering, SENDING recovery |
| P1-25 | P1 | TODO | Incoming-forward claim + IngressService transaction scope |
| P1-26 | P1 | TODO | Thread/pool sizing, @Transactional bypass, lying metrics |
| P1-27 | P1 | TODO | Rename SDK packages to hookflow (irreversible after publish) |
| P1-28 | P1 | TODO | Coverage tooling (JaCoCo + vitest) |
| P2-29 | P2 | TODO | UI never tells the user the backend is down |
| P2-30 | P2 | TODO | Accessibility: zero aria-labels in the whole UI |
| P2-31 | P2 | TODO | Hardcoded strings + 704KB bundle from eager locales |
| P2-32 | P2 | TODO | Stored XSS via dangerouslySetInnerHTML + i18n |
| P2-33 | P2 | TODO | OSS metadata, docs site, demo, committed OpenAPI |
| P3-34 | P3 | TODO | Workflow engine and CLI command tests |
| P3-35 | P3 | TODO | Load/soak harness + SDK contract tests |
| P3-36 | P3 | TODO | Table partitioning + log aggregation |

Keep this table in sync with each file's `Status:` line — it is the only
place to see the board at a glance.
