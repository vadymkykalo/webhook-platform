# P1-28 — Coverage tooling (JaCoCo + vitest)

- **Status:** DONE
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

- [x] Add JaCoCo to the root `pom.xml` with report aggregation across the four
      Java modules. Make sure it works with **both** CI test jobs (unit and
      integration are separate `mvn test` invocations with inverse `-Dtest=`
      filters — a naive setup will report only whichever ran last).
- [x] Add `coverage` config to `vite.config.ts` (v8 provider) and a
      `test:coverage` script.
- [x] Publish reports as CI artifacts so a PR reviewer can actually open them.
- [x] Record a **baseline** per module before the test tasks start. That number
      is the point of this task — P1-22 and P3-34 should be able to cite a
      before and after.
- [x] Set thresholds carefully. Start at or just below the current baseline and
      ratchet up as tests land. A threshold set aspirationally high on day one
      means a red build everyone learns to ignore — the same failure mode as
      P1-17's advisory gates, in reverse.
- [x] Add a README badge once there is a real number behind it.
- [x] Do **not** treat coverage as the goal. The worker module could hit a
      respectable percentage while `WebhookDeliveryService` stays untested,
      because the CRUD services are easy to cover. Report per-class coverage for
      the delivery path specifically.

## Verification

```bash
mvn clean test jacoco:report
open target/site/jacoco-aggregate/index.html      # or read the CSV

cd webhook-platform-ui && npm run test:coverage
```

- [x] Confirm the aggregate report includes classes exercised only by the
      integration suite — that is the failure mode to check for.

## Definition of done

- [x] Coverage measurable for Java (all four modules, both suites) and the UI.
- [x] Baseline numbers recorded in the log, per module.
- [x] Thresholds set at baseline, with a note on how they will ratchet.
- [x] Reports available as CI artifacts.

## Progress log

**2026-08-21 — implementation.**

### What changed

- Root `pom.xml`: added `jacoco-maven-plugin` (0.8.12) to `<build><plugins>`
  (inherited by every module, same pattern already used there for
  maven-compiler-plugin). Three executions: `prepare-agent`
  (`append=true`, destFile driven by a new `jacoco.destFile` property so CI
  can override it per job), `report` (per-module quick report, phase=test),
  `jacoco-merge` (folds whatever `jacoco*.exec` files sit in a module's own
  `target/` into `target/jacoco-merged.exec`, phase=verify).
- New 5th module `webhook-platform-coverage-report` (packaging `pom`,
  depends on all four real modules, no code of its own) — exists only so
  `jacoco:report-aggregate` has a project whose *dependencies* are the four
  real modules (that's how it discovers their `target/classes` +
  `target/jacoco*.exec`; a plain multi-module `<modules>` list isn't enough).
  `report-aggregate` bound at phase=test, output pinned to
  `<repo-root>/target/site/jacoco-aggregate` so the task's own verification
  path resolves exactly.
- Each of `webhook-platform-common/worker/api/cli`'s own `pom.xml`: added its
  own `check` execution (phase=verify) against
  `target/jacoco-merged.exec`, with module-specific thresholds — see "Why
  per-module, not one aggregate threshold" below.
- `webhook-platform-ui/vite.config.ts`: `coverage` block (v8 provider,
  reporters text/html/lcov/json-summary, sensible excludes, thresholds).
  `package.json`: `test:coverage` script + `@vitest/coverage-v8` devDependency.
- `.github/workflows/ci.yml`: `backend-test` and `backend-integration-test`
  now pass `-Djacoco.destFile=target/jacoco-unit.exec` /
  `target/jacoco-it.exec` respectively and upload those exec files as
  artifacts (`jacoco-unit-exec`, `jacoco-integration-exec`). New
  `coverage-report` job (`needs: [backend-test, backend-integration-test]`,
  `if: ${{ !cancelled() }}`) downloads both, runs
  `mvn verify -pl webhook-platform-coverage-report -am -DskipTests`, and
  uploads the aggregate HTML/CSV/XML report as `jacoco-aggregate-report`.
  `frontend-test` now runs `npm run test:coverage` instead of `test:ci` and
  uploads `webhook-platform-ui/coverage` as `vitest-coverage-report`.
- `.gitignore`: added `coverage/` (vitest output).
- `README.md`: coverage badge (static, see note in the "Coverage" section
  about it needing manual updates) + a short "Coverage" section under
  "Building from source" with the exact commands.

### The specific failure mode this task called out — verified fixed

The task's real concern: CI splits tests into two separate `mvn test`
invocations (`backend-test`, unit-only filter; `backend-integration-test`,
inverse filter) as two separate GitHub Actions jobs on two separate runners
with no shared filesystem. A naive JaCoCo setup reports only whichever job's
data a report step happens to read.

Reproduced and confirmed the fix locally:

```
mvn test -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest' -Djacoco.destFile=target/jacoco-unit-test.exec --fail-at-end
  -> Tests run: 168 (worker), 0 failures. api/common/cli also green.
mvn test -Dtest='*RepositoryTest,*IntegrationTest,*IT,*ConcurrencyTest,*RbacTest,*IsolationTest' -DfailIfNoTests=false -Djacoco.destFile=target/jacoco-it-test.exec --fail-at-end
  -> Tests run: 188 (api), 13 (worker), 0 failures.
mvn jacoco:report-aggregate (via the coverage-report module)
  -> [INFO] Loading execution data file .../webhook-platform-api/target/jacoco-it-test.exec
     [INFO] Loading execution data file .../webhook-platform-api/target/jacoco-unit-test.exec
     [INFO] Loading execution data file .../webhook-platform-worker/target/jacoco-it-test.exec
     [INFO] Loading execution data file .../webhook-platform-worker/target/jacoco-unit-test.exec
     [INFO] Analyzed bundle 'webhook-platform-api' with 602 classes
     [INFO] Analyzed bundle 'webhook-platform-worker' with 59 classes
```

Both exec files got loaded and merged for api and worker (the two modules
with classes exercised by the integration suite) — `report-aggregate`'s
default `dataFileIncludes` (`**/jacoco*.exec`) picked up both without any
extra config. Also ran the task's exact verbatim verification command from a
clean tree:

```
mvn clean test jacoco:report
-> Reactor Summary: Common/API/Worker/CLI/Coverage Report all SUCCESS
-> BUILD SUCCESS, Total time: 08:15 min
-> target/site/jacoco-aggregate/index.html and jacoco.csv produced at the
   repo root, exactly the path named in this task's Verification block.
```

### A `jacoco:check` gotcha found and fixed mid-task

First attempt bound `jacoco:check` inside `webhook-platform-coverage-report`
itself, expecting it to aggregate across the four real modules the same way
`report-aggregate` does. It doesn't — `jacoco:check`'s only data-source
parameter is a single `dataFile` (confirmed via
`mvn help:describe -Dgoal=check -Ddetail=true`: no `dataFileIncludes`, no
dependency-walking). Bound in a `pom`-packaging module with no classes of its
own, it just silently skipped: `Skipping JaCoCo execution due to missing
execution data file:.../webhook-platform-coverage-report/target/jacoco.exec`.

Fixed by moving threshold enforcement to each real module's own `pom.xml`,
each checking its own `target/jacoco-merged.exec` (built by the new
`jacoco-merge` execution, which — unlike `check` — does support merging
several exec files, from that module's own `target/` dir). The
`coverage-report` module now does report-aggregate only; the description in
its `pom.xml` documents why `check` doesn't live there.

**Second gotcha, same root run**: the first per-module threshold for
`webhook-platform-common` (0.55) was set from the report-aggregate CSV's
"webhook-platform-common" bundle figure — 60.9%. Running `mvn verify` against
it immediately failed:

```
[WARNING] Rule violated for bundle webhook-platform-common: instructions covered ratio is 0.45, but expected minimum is 0.55
```

Root cause: the aggregate report's per-bundle figure for `common` is
*inflated relative to common's own tests* — `report-aggregate` matches
classes by class ID across **all** loaded exec files, so instructions in
`common`'s classes that get incidentally executed while `api`/`worker`/`cli`
run *their own* tests (very plausible: `common` is small, shared, mostly
enums/DTOs used everywhere) count toward `common`'s aggregate bundle even
though `common`'s own test suite never touched them. A per-module `check`,
scoped to only that module's own `target/jacoco-merged.exec`, correctly
does **not** see that incidental coverage — it measures "coverage of
`common`'s code by `common`'s own tests," a stricter, different question.
Confirmed by cross-checking `api`/`worker`/`cli` too: their own-module
numbers matched the aggregate almost exactly (33.08% vs 33.1%, 73.03% vs
73.0%, 8.67% vs 8.7%) because nothing else in the reactor depends on them —
only `common` (depended on by everything) showed real divergence (45.51% own
vs 60.9% aggregate). Fixed by lowering `common`'s threshold to 0.40 (below
the real 45.51%) and documenting both numbers in its `pom.xml` so the next
person doesn't repeat the same 15-minute detour.

After the fix, `mvn verify -pl webhook-platform-coverage-report -am -DskipTests`
from a tree with existing exec data: `BUILD SUCCESS`, all four modules
report `All coverage checks have been met.`

### Baseline coverage (measured 2026-08-21, unit + integration merged, commit at HEAD of this branch)

Cross-module aggregate (`target/site/jacoco-aggregate/jacoco.csv`, via
`report-aggregate` — the number a PR reviewer sees in the aggregate HTML
report):

| Counter | Covered | Total | % |
|---|---|---|---|
| INSTRUCTION | 48,482 | 129,772 | 37.36% |
| BRANCH | 1,923 | 11,080 | 17.36% |
| LINE | 9,031 | 17,270 | 52.29% |

Per-module, own tests only (`target/site/jacoco/jacoco.csv` per module —
this is what each module's `jacoco:check` execution actually gates on, and
differs from the aggregate for `common` — see the gotcha above):

| Module | INSTRUCTION covered/total | % | Threshold set |
|---|---|---|---|
| `webhook-platform-common` | 2,420 / 5,317 | 45.51% | 0.40 |
| `webhook-platform-api` | 35,542 / 107,430 | 33.08% | 0.30 |
| `webhook-platform-worker` | 9,332 / 12,779 | 73.03% | 0.65 |
| `webhook-platform-cli` | 368 / 4,246 | 8.67% | 0.05 |

Delivery path, per class (the thing this task said to report instead of
treating the aggregate % as the goal — from `target/site/jacoco-aggregate/jacoco.csv`,
cross-checked against each owning module's own CSV, identical values since
neither `worker` nor `api` are depended on by another module here):

| Class | Module | INSTRUCTION | BRANCH | LINE |
|---|---|---|---|---|
| `WebhookDeliveryService` | worker | 1,467/2,004 (73.2%) | 90/148 (60.8%) | 345/451 (76.5%) |
| `RetrySchedulerService` | worker | 554/670 (82.7%) | 28/40 (70.0%) | 129/160 (80.6%) |
| `OrderingBufferService` | worker | 369/387 (95.3%) | 25/26 (96.2%) | 77/81 (95.1%) |
| `DeliveryConsumer` | worker | 182/190 (95.8%) | 9/14 (64.3%) | 41/42 (97.6%) |
| `OutboxPublisherService` | api | 420/744 (56.5%) | 24/64 (37.5%) | 104/169 (61.5%) |
| `SequenceGeneratorService` | api | 4/59 (6.8%) | 0/0 | 1/17 (5.9%) |

`SequenceGeneratorService` is the standout gap: 6.8% instruction coverage,
essentially untested, despite being on the FIFO-ordering path CLAUDE.md calls
out specifically. Deliberately **not** given its own threshold (a floor near
its actual value would just rubber-stamp the gap) — flagged here for P1-23
(FIFO ordering fixes) to pick up. Everything else on the delivery path
(`WebhookDeliveryService`, `RetrySchedulerService`, `OrderingBufferService`,
`DeliveryConsumer`, `OutboxPublisherService`) is P1-21/P1-22's actual output
and sits at 56.5%-95.8% — gated via the CLASS-scoped rules in
`webhook-platform-worker/pom.xml` and `webhook-platform-api/pom.xml`
(minimums 0.65 and 0.50 respectively).

### Frontend (Vitest + v8)

```
npm run test:coverage
-> Test Files  11 passed (11)
->      Tests  81 passed (81)
-> All files          |   16.38 |    58.04 |   18.63 |   16.38 |
```

(lines / branches / functions / statements as reported by v8, in that
column order.) Thresholds set at lines 14 / statements 14 / functions 16 /
branches 55 — a few points below the measured baseline. Only 11 test files
exist against ~150 source files (most `src/pages/*Page.tsx` are entirely
untested), so this is a low floor on purpose: it exists to catch a real
regression, not to imply the UI is well-tested. One test
(`DashboardPage.test.tsx > renders populated stat cards...`) was observed to
fail once under `test:coverage` (v8 instrumentation overhead shifting
timing) but passed on every other run, including under plain `test:ci` —
noted as a pre-existing flake unrelated to this task's config, not fixed
here (out of scope).

### Ratchet plan

Every threshold above is deliberately set a few points *below* its measured
baseline, not at or above it — start conservative, tighten as real tests
land (P1-21/P1-22 already moved the needle on the worker delivery path;
P1-23 should do the same for `SequenceGeneratorService`; P3-34/P2-3x for
the UI pages currently at 0%). Ratchet by editing the `<minimum>` values in
each module's own `pom.xml` `check` rule (Java) or the `thresholds` block in
`webhook-platform-ui/vite.config.ts` (UI) to just below the new measured
baseline each time a test task lands — never move them up preemptively of
an actual measured number, that's exactly the P1-17 failure mode this task
was told to avoid repeating.

### Deliberately left out

- No live coverage badge service (Codecov et al.) — the README badge is a
  static shields.io badge that must be updated by hand; out of scope for
  what this task needs (CI artifacts are enough for a PR reviewer to check
  in this repo, per the task's own Definition of done).
- No cross-module BUNDLE-wide `jacoco:check` gate (e.g. "37.36% overall or
  fail") — `jacoco:check` has no native multi-module aggregation (see the
  gotcha above), and building one by hand (parsing the aggregate CSV/XML in
  a script step and failing the build manually) felt like exactly the kind
  of over-engineering this task's own "don't treat coverage as the goal"
  instruction warns against, when four honest per-module thresholds already
  say more. Per-class delivery-path CLASS rules cover the specific ask
  instead.
