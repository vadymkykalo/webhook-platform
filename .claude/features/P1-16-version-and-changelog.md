# P1-16 — Reconcile versions, backfill CHANGELOG, write UPGRADING.md

- **Status:** IN PROGRESS
- **Priority:** P1
- **Branch:** `feature/P1-16-version-and-changelog`
- **Depends on:** coordinate with P1-15 (release workflow)
- **Area:** repo-wide

## The defect

Five sources of truth disagree:

| Source | Version |
|--------|---------|
| git tags | `v1.0.0 … v2.1.0` (7 tags) |
| root `pom.xml` | `1.0.0-SNAPSHOT` |
| `CHANGELOG.md` | only `1.0.0` + `Unreleased` |
| `deploy/helm/hookflow/Chart.yaml` | `1.0.0` / appVersion `1.0.0` |
| SDKs (node/python/php) | `2.2.1` |
| `webhook-platform-ui/package.json` | `1.0.0` |

Five tags — including a **major bump to v2.0.0** — have no changelog entry. A
user cannot answer "what version am I running and what changed?", and the v1→v2
break is entirely undocumented.

## Steps

- [ ] Decide the single current version. The SDKs at `2.2.1` and the `v2.1.0` tag
      suggest the product is at 2.x; the poms saying `1.0.0-SNAPSHOT` are simply
      stale. State the decision explicitly in the log.
- [ ] Set it everywhere: `mvn versions:set -DnewVersion=<v>` for the reactor,
      `Chart.yaml` (`version` and `appVersion`), `ui/package.json`, and confirm
      the SDKs line up.
- [ ] Backfill `CHANGELOG.md` for `v1.0.1 … v2.1.0` from git history:
      `git log --oneline v1.0.0..v2.1.0`. Commit messages are terse ("fix",
      "improve"), so read the diffs where the message is uninformative — a
      backfill of "fix / improve / improve" is worse than none.
- [ ] Write `UPGRADING.md`, leading with what breaks going v1 → v2. This is
      exactly the gap the truncated changelog created.
- [ ] Add a release workflow that keeps these in lockstep, so this never drifts
      again. Manual "update version numbers" in `CONTRIBUTING.md` across six
      files is the root cause.
- [ ] Add a CI check that fails when tag, pom, chart and UI versions disagree.
- [ ] Unify the two author identities with a `.mailmap`
      (`vadymkykalo` 346 commits / `vkykalo` 57 — same person). Cosmetic, but it
      is the first thing a visitor's eye lands on in the contributor graph.

## Verification

```bash
git tag | tail -3
grep -m1 "<version>" pom.xml
grep -E "^version|^appVersion" deploy/helm/hookflow/Chart.yaml
grep -m1 '"version"' webhook-platform-ui/package.json
grep -m1 '"version"' sdks/node/package.json
# all consistent

mvn clean package -DskipTests    # reactor still builds after versions:set
```

- [ ] Run the new drift check locally and confirm it fails when you deliberately
      desync one file.

## Definition of done

- [ ] One version across pom / Chart / UI / SDKs / next tag.
- [ ] CHANGELOG covers every released tag with real content.
- [ ] `UPGRADING.md` answers "what breaks v1 → v2".
- [ ] Drift check in CI.

## Progress log
