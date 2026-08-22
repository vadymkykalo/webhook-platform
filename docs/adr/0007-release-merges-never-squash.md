# 0007 — `release/*` and `hotfix/*` merge into `main` with a merge commit, never a squash

**Status:** Accepted

## Context

The repository follows GitFlow: `main` receives only `release/*` and `hotfix/*`, and every
such merge must also be merged back into `develop`, or the change disappears at the next
release.

GitHub's default merge button is configured for squash, which is right for
`feature/*` → `develop` — a feature's work-in-progress commits should land as one.
Applying it to a release branch is not the same operation.

Squashing `release/2.3.0` into `main` writes a **new commit with no parent link to the
branch**. `main` and `develop` stop sharing a merge base. Git then has nothing to three-way
diff against, so the back-merge treats every file either side has touched as a conflict —
including files whose contents are byte-identical.

This is not theoretical. PR #100 was squash-merged for release 2.3.0. The next release's
back-merge reported 19 conflicts, 12 of them between identical files.

## Decision

- `feature/*` → `develop`: **squash**.
- `release/*` → `main` and `hotfix/*` → `main`: **merge commit**. Never squash, never
  rebase.
- Immediately after either lands on `main`, merge `main` back into `develop` — also as a
  merge commit.

## Consequences

- `main`'s history contains merge commits. That is the point: they are what preserves the
  common ancestry the back-merge needs.
- The repository's merge-button settings cannot express "squash for one target, merge
  commit for another". The rule is enforced by review, and by this ADR being the thing a
  reviewer can point at.
- A release that *was* squash-merged is recoverable but unpleasant: the back-merge has to
  be resolved by hand once, after which ancestry is restored.

## Alternatives rejected

- **Squash everything, for a linear history.** The cost lands entirely on the back-merge,
  which is the step GitFlow depends on and the one most likely to be done under time
  pressure during a hotfix.
- **Drop the back-merge and cherry-pick hotfixes into `develop`.** Cherry-picks also
  create unrelated SHAs and reintroduce the same divergence more slowly.
- **Abandon GitFlow for trunk-based development.** A reasonable thing to want; out of
  scope for this ADR, which records why the current model's merges work the way they do.
