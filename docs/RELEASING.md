# Releasing

Maintainer's checklist. Contributors do not need any of this — see
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Steps

1. Create release branch: `git checkout -b release/1.x.0 develop`
2. Update version numbers everywhere in one step: `make version-set VERSION=1.x.0`
   (wraps `scripts/set-version.sh`, which sets the reactor poms, `Chart.yaml`,
   `webhook-platform-ui/package.json` and the three SDK manifests together —
   don't hand-edit them individually, that's how these drifted apart in the
   first place). Verify with `make version-check`.
3. Update `CHANGELOG.md`: move `[Unreleased]` content under the new version
   heading, and write `UPGRADING.md` notes if the release breaks anything.
4. Create PR to `main`. **Merge it with "Create a merge commit"** — not
   "Squash and merge", which is GitHub's default here and breaks step 6 (see
   Code Review above).
5. After merge, tag release: `git tag v1.x.0`
6. Merge back to `develop` and bump the reactor to the next `-SNAPSHOT`
   (`make version-set VERSION=1.x+1.0-SNAPSHOT`). With a merge commit in step 4
   this is conflict-free; after a squash it is a manual reconciliation.

CI's `version-check` job (`.github/workflows/ci.yml`) fails the build if the
pom, Chart, UI and SDK versions ever disagree again.

