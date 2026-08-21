# P4-39 — Strip task-ID references from code comments

- **Status:** DONE
- **Priority:** P4 — cosmetic/hygiene, no functional risk, do last
- **Branch:** `feature/P4-39-task-id-comment-cleanup`
- **Depends on:** nothing functionally, but do it after every other board task
  is DONE — cleaning up mid-batch just means the next merged task re-adds more
- **Area:** repo-wide (~150 files across `webhook-platform-*`, `sdks/`,
  `deploy/`, `monitoring/`, `.github/`)

## The defect

Root `CLAUDE.md`'s own stated convention: "Don't reference the current task,
fix, or callers ... since those belong in the PR description and rot as the
codebase evolves." In practice this punch-list workflow violated it
constantly — comments like `// P1-24: ...`, `(P0-06)`, `-- P1-23 (23b): ...`
are scattered through source, tests, migrations, YAML, and shell scripts.

Most of this predates any single session — it's a pattern set by the very
first P0 fixes and repeated by nearly every task since (self-perpetuating:
each new agent reads existing code, sees the pattern, follows it). It is not
attributable to one task or one agent run.

Confirm current scope before starting:

```bash
grep -rln "P[0-3]-[0-9]\{1,2\}" \
  --include="*.java" --include="*.ts" --include="*.tsx" --include="*.js" \
  --include="*.yml" --include="*.yaml" --include="*.sql" --include="*.sh" \
  webhook-platform-api webhook-platform-worker webhook-platform-common \
  webhook-platform-cli webhook-platform-ui sdks deploy monitoring .github \
  Makefile 2>/dev/null | wc -l
```
(~150 files as of this task's filing; re-run to get the current true count —
it will have grown if other tasks landed first, which is expected and fine.)

## Steps

- [x] Walk every matching file. For each comment referencing a task ID:
  - If the comment explains **why** (a non-obvious constraint, a workaround,
    an invariant) independent of the task number, keep the content but strip
    the task-ID prefix/suffix — the reasoning is still valuable, the ticket
    number is not.
  - If the comment exists *only* to say "this was added/changed for PXX",
    delete it outright — that belongs in git blame / the PR, not the file.
- [x] Do **not** touch `.claude/features/*.md` — those files are the task
  board itself; task-ID references there are the point, not litter.
- [x] Do **not** touch `CHANGELOG.md` / `UPGRADING.md` — historical record,
  task-ID-adjacent references there (if any) are legitimate changelog content.
- [x] Migration file *names* (`V051__drop_redundant_hot_table_index.sql`
  etc.) are fine as-is — Flyway filenames aren't "comments" and renumbering
  them is its own hazard (see the `db-migration` skill). Only touch comment
  *bodies* inside migration files, not filenames.
- [x] After cleanup, re-run the grep above and confirm the count is at or
  near zero (some legitimate hits — e.g. a Grafana panel literally titled
  with a ticket number a human chose deliberately — are fine to leave;
  use judgment, don't strip content that isn't actually about *this*
  punch-list).
- [x] Spot-check that no comment removal accidentally deleted the only
  explanation of a genuinely non-obvious piece of logic — re-read the
  surrounding code after each deletion, don't blind-grep-and-delete lines.

## Verification

```bash
grep -rln "P[0-3]-[0-9]\{1,2\}" \
  --include="*.java" --include="*.ts" --include="*.tsx" --include="*.js" \
  --include="*.yml" --include="*.yaml" --include="*.sql" --include="*.sh" \
  webhook-platform-api webhook-platform-worker webhook-platform-common \
  webhook-platform-cli webhook-platform-ui sdks deploy monitoring .github \
  Makefile 2>/dev/null
# expect near-zero, review any survivors individually

mvn clean package -DskipTests
mvn test -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'
cd webhook-platform-ui && npm run lint && npm run typecheck && npm run test:ci
```

## Definition of done

- [x] Task-ID references in code comments reduced to ~zero, judgment applied
      to genuine exceptions.
- [x] No loss of genuinely useful non-obvious-reasoning comments — only the
      ticket-number framing was stripped, not the substance.
- [x] Full build + unit suites still green (this is a comment-only change;
      any test failure means something else was touched by accident).

## Progress log

**Scope check (before starting):**

```
$ grep -rln "P[0-3]-[0-9]\{1,2\}" \
  --include="*.java" --include="*.ts" --include="*.tsx" --include="*.js" \
  --include="*.yml" --include="*.yaml" --include="*.sql" --include="*.sh" \
  webhook-platform-api webhook-platform-worker webhook-platform-common \
  webhook-platform-cli webhook-platform-ui sdks deploy monitoring .github \
  Makefile 2>/dev/null | wc -l
130
```
130 files, 273 individual matching lines. In line with the "similar to or
larger than ~150" expectation in the task filing (task board grew since
filing; ended up slightly under 150 files but that's expected variance).

**Work done**, committed in logical batches by module so each is easy to
bisect if something needs review later:

1. `webhook-platform-common` — 4 files (KafkaTopics, UrlValidator, IncomingForwardMessage, UrlValidatorTest).
2. `webhook-platform-worker` main source — 17 files (WebhookDeliveryService,
   OrderingBufferService, RetryPolicy, RetrySchedulerService,
   IncomingForwardService, DeliveryConsumer, KafkaConsumerConfig,
   application.yml, etc.).
3. `webhook-platform-worker` tests — 18 files, including the two largest single
   files in the whole task (WebhookDeliveryServiceTest.java, 11 matches;
   DeliveryEndToEndIntegrationTest.java, 19 matches — the latter's class doc
   also dropped its dead pointer to `.claude/features/P1-21-e2e-delivery-test.md`
   and its references to "the launch punch-list's README 'Stream A' grouping",
   since that grouping concept won't exist once `.claude/features/` is
   removed).
4. `webhook-platform-api` main source — 28 files (security package,
   OutboxPublisherService, EventIngestService, AuthService, DeviceAuthService,
   ScopeEnforcementInterceptor, application.yml, etc.). Also rewrote
   ScopeEnforcementInterceptor's "see the P0-13 task log for why" pointer
   inline, since the log it pointed at is going away.
5. `webhook-platform-api` migrations — 9 Flyway files (V016, V045, V046, V047,
   V050, V051, V052, V053, V054). Comment *bodies* only — file names
   untouched, per the task's explicit instruction and the `db-migration`
   skill's guidance on Flyway filename hazards. V051's "see Progress log in
   .claude/features/P3-36-partitioning-and-logs.md" pointer was dropped for
   the same reason as above.
6. `webhook-platform-api` tests — 26 files. Renamed
   `ProjectScopeEnforcementIsolationTest`'s "P0-13 Test Org" / "p013-*" test
   fixture names to "Cross-Project Test Org" / "cross-project-*" since they
   existed purely to reference the ticket, not for any test-correctness
   reason.
7. `webhook-platform-ui` — 4 files (vite.config.ts coverage-threshold
   comments, DeliveriesPage XSS/i18n regression tests, locale-parity test).
   vite.config.ts's "see this task's Progress log" pointer dropped.
8. SDKs — 6 files. Node was in the original grep scope; PHP and Python were
   not (task's `--include` list doesn't cover `.php`/`.py`) but carry the
   exact same P1-27/P2-33/P3-35 comments copy-pasted across all three SDKs,
   so cleaned for consistency. The contract-test comments in all three also
   said the OpenAPI spec was "not yet done (see .claude/features/)" — that
   spec (`openapi.yaml` at the repo root) has since landed, so those comments
   were corrected to describe the current state rather than just having the
   ticket ID stripped from a now-false statement.
9. `deploy/` — 8 files (Helm chart/values, Prometheus alerts, backup/restore
   scripts).
10. `monitoring/` — 7 files (Alertmanager, Prometheus, Grafana datasource,
    Loki, Promtail configs).
11. `.github/workflows/` — 7 files (ci.yml had 9 of the matches; the rest one
    each).

Judgment calls / things deliberately left alone:
- `.claude/features/*.md` and `CHANGELOG.md`/`UPGRADING.md` — untouched, per
  the task.
- Root `docker-compose*.yml`, `load/`, `scripts/set-version.sh`,
  `scripts/check-version-drift.sh` — outside the task's defined directory
  scope (not in the `webhook-platform-*`/`sdks`/`deploy`/`monitoring`/
  `.github`/`Makefile` list the grep command scans), left alone to match the
  task's own verification command exactly.
- `sdks/*/tests/contract/README.md` (php/python/node) still say "P2-33 (not
  yet done)" / reference "P3-35's task file" — `.md` files were not in the
  task's `--include` list (docs vs. code comments), so left as-is; flagged
  here in case a future doc pass wants them too.

**Final scope re-check (after cleanup):**

```
$ grep -rln "P[0-3]-[0-9]\{1,2\}" \
  --include="*.java" --include="*.ts" --include="*.tsx" --include="*.js" \
  --include="*.yml" --include="*.yaml" --include="*.sql" --include="*.sh" \
  webhook-platform-api webhook-platform-worker webhook-platform-common \
  webhook-platform-cli webhook-platform-ui sdks deploy monitoring .github \
  Makefile 2>/dev/null
(no output — zero matches)
```

**Build verification:**

```
$ mvn clean package -DskipTests
...
[INFO] Reactor Summary for Webhook Platform 2.2.1:
[INFO]
[INFO] Webhook Platform ................................... SUCCESS [  0.262 s]
[INFO] Webhook Platform Common ............................ SUCCESS [  3.135 s]
[INFO] Webhook Platform API ............................... SUCCESS [ 10.061 s]
[INFO] Webhook Platform Worker ............................ SUCCESS [  1.942 s]
[INFO] Webhook Platform CLI ............................... SUCCESS [  1.700 s]
[INFO] Webhook Platform Coverage Report ................... SUCCESS [  0.974 s]
[INFO] ------------------------------------------------------------------------
[INFO] BUILD SUCCESS
```

**Unit test verification** (`mvn test -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'`):

```
webhook-platform-api:    Tests run: 525, Failures: 0, Errors: 0, Skipped: 0
webhook-platform-worker: Tests run: 180, Failures: 0, Errors: 0, Skipped: 0
webhook-platform-cli:    Tests run: 64,  Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```
(webhook-platform-common has no standalone unit-test module output beyond
what's folded into the reactor; no failures anywhere in the run.)

**UI verification** (`cd webhook-platform-ui && npm run lint && npm run typecheck && npm run test:ci`, after `npm ci`):

```
$ npm run lint
✖ 12 problems (0 errors, 12 warnings)
```
(all 12 are pre-existing `i18next/no-literal-string` warnings on lines this
task never touched — 0 errors.)

```
$ npm run typecheck
> tsc --noEmit
(clean, no output)
```

```
$ npm run test:ci
 Test Files  14 passed (14)
      Tests  89 passed (89)
```

No test failures anywhere, so no accidental non-comment change to revert —
this was a comment/doc-string-only change throughout (plus a few narrow
renames of ticket-ID-shaped test-fixture strings, and a handful of comment
corrections where the referenced task had since actually landed, e.g. the
OpenAPI spec).
