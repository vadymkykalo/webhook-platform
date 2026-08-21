# P1-16 — Reconcile versions, backfill CHANGELOG, write UPGRADING.md

- **Status:** DONE
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

- [x] Decide the single current version. The SDKs at `2.2.1` and the `v2.1.0` tag
      suggest the product is at 2.x; the poms saying `1.0.0-SNAPSHOT` are simply
      stale. State the decision explicitly in the log.
- [x] Set it everywhere: `mvn versions:set -DnewVersion=<v>` for the reactor,
      `Chart.yaml` (`version` and `appVersion`), `ui/package.json`, and confirm
      the SDKs line up.
- [x] Backfill `CHANGELOG.md` for `v1.0.1 … v2.1.0` from git history:
      `git log --oneline v1.0.0..v2.1.0`. Commit messages are terse ("fix",
      "improve"), so read the diffs where the message is uninformative — a
      backfill of "fix / improve / improve" is worse than none.
- [x] Write `UPGRADING.md`, leading with what breaks going v1 → v2. This is
      exactly the gap the truncated changelog created.
- [x] Add a release workflow that keeps these in lockstep, so this never drifts
      again. Manual "update version numbers" in `CONTRIBUTING.md` across six
      files is the root cause.
- [x] Add a CI check that fails when tag, pom, chart and UI versions disagree.
- [x] Unify the two author identities with a `.mailmap`
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

- [x] Run the new drift check locally and confirm it fails when you deliberately
      desync one file.

## Definition of done

- [x] One version across pom / Chart / UI / SDKs / next tag.
- [x] CHANGELOG covers every released tag with real content.
- [x] `UPGRADING.md` answers "what breaks v1 → v2".
- [x] Drift check in CI.

## Progress log

### Version decision

By the time this task ran, `git tag` actually listed **9** tags, not the 7 the
original audit table shows: `v2.2.0` and `v2.2.1` exist beyond `v2.1.0` (dated
2026-03-16 and 2026-03-18, both pre-dating this task). SDKs (node/python/php)
were already at `2.2.1`, matching the *latest* tag exactly — stronger evidence
than the task's own hint. **Decision: current version = `2.2.1`** (not
`2.1.0`), applied identically (no `-SNAPSHOT`) to every source: root pom,
all 4 module poms, `deploy/helm/hookflow/Chart.yaml` (`version` +
`appVersion`), `webhook-platform-ui/package.json` (+ `package-lock.json`),
and confirmed unchanged against `sdks/node/package.json`,
`sdks/python/pyproject.toml`, `sdks/php/composer.json` (all already `2.2.1`).
Also fixed two stray `1.0.0-SNAPSHOT` references that `mvn versions:set`
doesn't touch: `webhook-platform-cli/install.sh`'s no-release-found fallback,
and a commented-out alias example in `README.md`.

Rationale for *not* using a `-SNAPSHOT` suffix on develop: this task's job is
to stop existing drift, not to open a new release cycle. The reactor is
allowed to run a `-SNAPSHOT` ahead of the last release again once the next
`release/*` branch is cut (`scripts/set-version.sh <next>-SNAPSHOT`); the new
drift check strips `-SNAPSHOT` before comparing so that's supported without
re-triggering the check.

### Tag topology anomaly (found during changelog backfill)

Tags are not in strict chronological order: `git merge-base --is-ancestor
v1.1.0 v1.0.1` is true, i.e. **`v1.1.0` is an ancestor of `v1.0.1`/`v1.0.2`/
`v1.0.3`** — those three patch tags were cut *after* `v1.1.0` already existed
on `main`, so they're misnumbered (should logically have been `1.1.x`, not
`1.0.x`). True chronological order is `v1.0.0 → v1.1.0 → v1.0.1 → v1.0.2 →
v1.0.3 → v2.0.0 → v2.1.0 → v2.2.0 → v2.2.1`. CHANGELOG.md documents this
inline rather than silently reordering it away.

### CHANGELOG / UPGRADING content

Backfilled by reading `git log --oneline` per true-chronological tag pair and
opening diffs for every terse commit ("fix", "add feature", "Security fix",
"production readiness audit") rather than echoing commit subjects — the
Flyway migration files under each release range were the most reliable
record of what actually shipped for 2.0.0/2.1.0/2.2.0.

Headline v1→v2 break, verified directly in
`webhook-platform-common/.../CryptoUtils.java`: v1.x derived the AES key via
`SHA-256(masterKey)` truncated to 16 bytes; v2.x uses
`PBKDF2WithHmacSHA256` (65,536 iterations) over `masterKey + WEBHOOK_ENCRYPTION_SALT`
— a different algorithm, not a parameter tweak, so **any secret encrypted
under v1.x cannot be decrypted by v2.x**, with no fallback and no bulk
re-encryption tool. Also documented: Flyway history reset (`V001`–`V025` old
numbering deleted, replaced by a new `V001`–`V009` baseline — an existing
v1.x DB fails Flyway checksum validation against v2.x), ports no longer
binding `0.0.0.0` by default (new `API_BIND`, defaults `127.0.0.1`), Redis
now requiring `REDIS_PASSWORD`, and the `TEST_ENDPOINT_BASE_URL` default
changing because `container_name` was dropped from `docker-compose.yml`.
`UPGRADING.md` leads with all of these; `CHANGELOG.md` has a full entry per
release plus the `[Unreleased]` section left untouched.

### Release workflow / CI drift check

Added `scripts/check-version-drift.sh` (compares root-pom version, stripped
of any `-SNAPSHOT`, against `Chart.yaml` `version`/`appVersion`,
`webhook-platform-ui/package.json`, all three SDK manifests, and — if `HEAD`
is exactly on a `vX.Y.Z` tag — the tag itself) and
`scripts/set-version.sh <version>` (wraps `mvn versions:set` +
sed/node one-liners to bump every one of those files together, replacing the
"update version numbers" hand-edit step in `CONTRIBUTING.md`'s release
process). Wired both into `Makefile` (`make version-check`, `make
version-set VERSION=...`) and added a new `version-check` job at the top of
`.github/workflows/ci.yml` that runs the drift script on every push/PR, no
JDK/npm setup needed. `CONTRIBUTING.md`'s Release Process section now points
at these instead of "update version numbers" by hand.

### .mailmap

`git shortlog -sn --all` showed `vadymkykalo` (446) and `vkykalo` (96) as
separate identities, both already using the same `vadymkykalo@gmail.com`
address — so a single `.mailmap` line (`Vadym Kykalo <vadymkykalo@gmail.com>`)
was enough to consolidate them: `git shortlog -sn --all` now shows one entry,
`Vadym Kykalo   542`.

### Verification (real output)

```
$ git tag | tail -3
v2.1.0
v2.2.0
v2.2.1

$ grep -m1 "<version>" pom.xml
    <version>2.2.1</version>

$ grep -E "^version|^appVersion" deploy/helm/hookflow/Chart.yaml
version: 2.2.1
appVersion: "2.2.1"

$ grep -m1 '"version"' webhook-platform-ui/package.json
  "version": "2.2.1",

$ grep -m1 '"version"' sdks/node/package.json
  "version": "2.2.1",
# all consistent — confirmed, also checked sdks/python and sdks/php (2.2.1)

$ mvn clean package -DskipTests
...
[INFO] Reactor Summary for Webhook Platform 2.2.1:
[INFO]
[INFO] Webhook Platform ................................... SUCCESS [  0.294 s]
[INFO] Webhook Platform Common ............................ SUCCESS [  6.591 s]
[INFO] Webhook Platform API ............................... SUCCESS [ 23.373 s]
[INFO] Webhook Platform Worker ............................ SUCCESS [  3.401 s]
[INFO] Webhook Platform CLI ............................... SUCCESS [  1.448 s]
[INFO] ------------------------------------------------------------------------
[INFO] BUILD SUCCESS

$ bash scripts/check-version-drift.sh
pom.xml (reactor):          2.2.1  (compared as 2.2.1)
Chart.yaml version:         2.2.1
Chart.yaml appVersion:      2.2.1
webhook-platform-ui:        2.2.1
sdks/node/package.json:     2.2.1
sdks/python/pyproject.toml: 2.2.1
sdks/php/composer.json:     2.2.1

All version sources agree on 2.2.1
$ echo $?
0

# Deliberately desync one file and confirm the check fails:
$ sed -i -E 's/^version: .*/version: 9.9.9/' deploy/helm/hookflow/Chart.yaml
$ bash scripts/check-version-drift.sh
pom.xml (reactor):          2.2.1  (compared as 2.2.1)
Chart.yaml version:         9.9.9
Chart.yaml appVersion:      2.2.1
webhook-platform-ui:        2.2.1
sdks/node/package.json:     2.2.1
sdks/python/pyproject.toml: 2.2.1
sdks/php/composer.json:     2.2.1
::error::Chart.yaml version (9.9.9) disagrees with pom.xml (2.2.1)

Version drift detected. Realign every file in one step with:
  scripts/set-version.sh <version>
$ echo $?
1

# Restored deploy/helm/hookflow/Chart.yaml to 2.2.1 immediately after; re-ran
# the check clean (exit 0) before committing.
```

### Left out / follow-ups

- Did not rename SDK packages or touch package identity — explicitly out of
  scope, reserved for P1-27.
- `scripts/set-version.sh` bumps the three SDK manifests too (keeping the
  whole repo on one version number, consistent with how SDKs and platform
  versions already matched at `2.2.1`); if a future maintainer wants SDKs to
  version independently of the platform, that's a deliberate follow-up
  decision, not something this task assumed.
- Did not touch `[Unreleased]` in `CHANGELOG.md` — left as-is per the task's
  scope (backfilling *released* versions).
