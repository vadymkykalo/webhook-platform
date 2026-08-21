# P4-39 — Strip task-ID references from code comments

- **Status:** TODO
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

- [ ] Walk every matching file. For each comment referencing a task ID:
  - If the comment explains **why** (a non-obvious constraint, a workaround,
    an invariant) independent of the task number, keep the content but strip
    the task-ID prefix/suffix — the reasoning is still valuable, the ticket
    number is not.
  - If the comment exists *only* to say "this was added/changed for PXX",
    delete it outright — that belongs in git blame / the PR, not the file.
- [ ] Do **not** touch `.claude/features/*.md` — those files are the task
  board itself; task-ID references there are the point, not litter.
- [ ] Do **not** touch `CHANGELOG.md` / `UPGRADING.md` — historical record,
  task-ID-adjacent references there (if any) are legitimate changelog content.
- [ ] Migration file *names* (`V051__drop_redundant_hot_table_index.sql`
  etc.) are fine as-is — Flyway filenames aren't "comments" and renumbering
  them is its own hazard (see the `db-migration` skill). Only touch comment
  *bodies* inside migration files, not filenames.
- [ ] After cleanup, re-run the grep above and confirm the count is at or
  near zero (some legitimate hits — e.g. a Grafana panel literally titled
  with a ticket number a human chose deliberately — are fine to leave;
  use judgment, don't strip content that isn't actually about *this*
  punch-list).
- [ ] Spot-check that no comment removal accidentally deleted the only
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

- [ ] Task-ID references in code comments reduced to ~zero, judgment applied
      to genuine exceptions.
- [ ] No loss of genuinely useful non-obvious-reasoning comments — only the
      ticket-number framing was stripped, not the substance.
- [ ] Full build + unit suites still green (this is a comment-only change;
      any test failure means something else was touched by accident).

## Progress log
