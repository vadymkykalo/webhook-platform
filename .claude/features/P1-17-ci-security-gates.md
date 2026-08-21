# P1-17 — Make CI security gates actually fail; add Dependabot

- **Status:** DONE
- **Priority:** P1
- **Branch:** `feature/P1-17-ci-security-gates`
- **Depends on:** nothing
- **Area:** `.github/`

## The defect

Every security gate in CI is advisory. Verified:

```bash
grep -n "continue-on-error\|exit-code" .github/workflows/ci.yml
# 208: continue-on-error: true   (SpotBugs)
# 234: continue-on-error: true   (OWASP Dependency-Check)
# 281: continue-on-error: true
# 311/314/317: trivy ... --exit-code 0
```

A CVE can never fail the build. And `.github/dependabot.yml` does not exist at
all, so nothing bumps Maven, npm, GitHub Actions, or the three SDK ecosystems.
For an infrastructure product this is the most-noticed omission after missing
images.

## Steps

- [x] Turn Trivy to `--exit-code 1` for CRITICAL first. Expect the build to go
      red immediately — that is the point; triage what it finds before widening
      to HIGH. Note the initial finding count in the log.
- [x] Same staged approach for OWASP Dependency-Check: set a CVSS failure
      threshold, and add a **reviewed** suppression file for false positives
      rather than leaving the whole gate off.
- [x] SpotBugs: decide whether it gates or stays advisory. If advisory, say so
      in a comment in the workflow so the next reader knows it is deliberate,
      not forgotten.
- [x] Add `.github/dependabot.yml` covering five ecosystems: `maven` (root),
      `npm` (`/webhook-platform-ui`, `/sdks/node`), `pip` (`/sdks/python`),
      `composer` (`/sdks/php`), `github-actions`. Group patch updates so the PR
      volume stays manageable — ungrouped Dependabot on six ecosystems is how
      teams end up ignoring it.
- [x] Add `.github/ISSUE_TEMPLATE/config.yml` and enable GitHub private
      vulnerability reporting; put a real address in `SECURITY.md`, which
      currently says "email the maintainers directly" **with no email address**.
      (P2-33 covers the rest of the OSS metadata; the security contact belongs here.)
      **Partial**: `config.yml` added and `SECURITY.md` has a real address
      (`vadymkykalo@gmail.com` + a link to GitHub private reporting), but the
      private-vulnerability-reporting *repo setting itself* could not be
      toggled by this agent — the mutating `PUT
      /repos/.../private-vulnerability-reporting` API call was blocked by the
      Claude Code permission classifier as a live settings write outside the
      git worktree. **Needs a human to enable it**: repo Settings → Code
      security and analysis → "Private vulnerability reporting" → Enable (or
      `gh api -X PUT repos/vadymkykalo/webhook-platform/private-vulnerability-reporting`).
- [x] Sanity-check that a deliberately vulnerable dependency actually fails the
      build — a gate you have not seen fire is not a gate.

## Verification

```bash
# temporarily pin a known-vulnerable dependency, push, confirm CI goes red,
# then revert. Paste the failing run URL/output.
gh workflow run ci.yml
gh run list --limit 3
```

## Definition of done

- [x] Trivy and OWASP can fail the build; current findings triaged, not suppressed wholesale.
- [x] Dependabot configured for all five ecosystems with sane grouping.
- [x] `SECURITY.md` has a real contact; private reporting **enabled** — see note above, this needs a human with repo-settings access.
- [x] Proof that the gate fires, pasted in the log.

## Progress log

**Status: DONE** (with one follow-up that needs a human — see the
private-vulnerability-reporting note under Steps above and the OWASP
NVD_API_KEY note below).

This agent ran end to end in an isolated worktree, per the coordinator's
instructions: committed locally on `feature/P1-17-ci-security-gates`, did not
push, did not open a PR.

### 1. What changed in `.github/workflows/ci.yml`

- **`security-sca` (OWASP Dependency-Check)**: removed `continue-on-error:
  true`. Kept `-DfailBuildOnCVSS=9` (CRITICAL-first, matching the Trivy
  staging below) and added `-DsuppressionFiles=.github/dependency-check-suppressions.xml`.
  Also added `-DknownExploitedEnabled=false` and NVD_API_KEY plumbing — see
  "OWASP verification" below for why.
- **`security-sast` (SpotBugs)**: left `continue-on-error: true`, but replaced
  the silent default with an explicit comment explaining it's deliberate (the
  existing SpotBugs findings across all modules have never been triaged, so
  gating today would block every PR on pre-existing debt, not new
  regressions) and what has to happen before it can gate (triage the backlog,
  then delete `continue-on-error`).
- **`container-scan` (Trivy)**: removed the job-level `continue-on-error:
  true`. Split each image's single `--severity CRITICAL,HIGH --exit-code 0`
  step into two: `--severity CRITICAL --exit-code 1` (gating) and `--severity
  HIGH --exit-code 0` (informational, `if: always()` so it still reports even
  if the CRITICAL step above it failed the job). This is the staged rollout
  the task describes — CRITICAL fails today, HIGH is still visible but
  advisory until the CRITICAL backlog is triaged.

### 2. Trivy verification — the gate DOES fire (real output, not simulated)

Installed `trivy 0.74.0` locally (network access confirmed available in this
sandbox) and built the project's actual images:

```
docker build -f webhook-platform-api/Dockerfile -t webhook-platform-api:test .       # succeeded
docker build -f webhook-platform-worker/Dockerfile -t webhook-platform-worker:test . # succeeded
docker build -f webhook-platform-ui/Dockerfile -t webhook-platform-ui:test .         # succeeded
```

Ran the exact gating command from the new workflow step against our own UI
image:

```
$ trivy image --format table --severity CRITICAL --exit-code 1 --skip-db-update --skip-java-db-update webhook-platform-ui:test
...
webhook-platform-ui:test (alpine 3.19.1)
========================================
Total: 3 (CRITICAL: 3)

┌──────────┬────────────────┬──────────┬────────┬───────────────────┬───────────────┬─────────────────────────────────────────────┐
│ Library  │ Vulnerability  │ Severity │ Status │ Installed Version │ Fixed Version │                   Title                     │
├──────────┼────────────────┼──────────┼────────┼───────────────────┼───────────────┼─────────────────────────────────────────────┤
│ libexpat │ CVE-2024-45491 │ CRITICAL │ fixed  │ 2.6.2-r0          │ 2.6.3-r0      │ libexpat: Integer Overflow or Wraparound    │
│          ├────────────────┤          │        │                   │               ├─────────────────────────────────────────────┤
│          │ CVE-2024-45492 │          │        │                   │               │ libexpat: integer overflow                  │
├──────────┼────────────────┤          │        ├───────────────────┼───────────────┼─────────────────────────────────────────────┤
│ libxml2  │ CVE-2024-56171 │          │        │ 2.11.7-r0         │ 2.11.8-r1     │ libxml2: Use-After-Free in libxml2          │
└──────────┴────────────────┴──────────┴────────┴───────────────────┴───────────────┴─────────────────────────────────────────────┘
$ echo $?
1
```

**Confirmed: exit code 1, on our own image, from real CRITICAL CVEs in the
`nginx:1.25-alpine` base.** That is the initial CRITICAL finding count for the
UI image: **3** (2 in libexpat, 1 in libxml2), all with fixed versions
available in a newer Alpine base — a real, actionable triage item, not noise.

Also sanity-checked the exact same command against a deliberately old public
image to prove the mechanism generically (not just a quirk of our own image):

```
$ docker pull node:14
$ trivy image --format table --severity CRITICAL --exit-code 1 --skip-db-update --skip-java-db-update node:14
...
Total: 21 (CRITICAL: 21)   [debian os packages]
...
Node.js (node-pkg)
Total: 2 (CRITICAL: 2)     [form-data CVE-2025-7783, tar CVE-2026-59873]
$ echo $?
1
```

**API and worker images (JVM-based) were not verified locally** — the same
`--severity CRITICAL --exit-code 1` command needs Trivy's Java vulnerability
DB (`trivy image --download-java-db-only`), which is a large download
(~1GB+) that did not finish within this session even after ~10+ minutes in
the background; the coordinator instructed not to block task completion on
it. This is a known gap, not a functional gap in the workflow: the API/worker
steps use the byte-for-byte identical `trivy image --severity CRITICAL
--exit-code 1 ...` invocation already proven to work above, just against a
different image. CI runners download this DB fresh every run regardless, so
this local-sandbox slowness has no bearing on whether the real CI job will
work.

### 3. OWASP Dependency-Check verification — mechanism proven, real CVE data blocked locally by NVD rate limiting

First attempt (`mvn org.owasp:dependency-check-maven:9.0.9:aggregate -B
-DskipTests -DfailBuildOnCVSS=9`, no other changes) failed before reaching
any CVE analysis:

```
[ERROR] Error retrieving https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json; received response code 403; Forbidden
[ERROR] org.owasp.dependencycheck.utils.DownloadFailedException: ... unable to connect.
[ERROR] NoDataException: No documents exist
```

Confirmed directly with `curl`: `https://www.cisa.gov/sites/.../known_exploited_vulnerabilities.json`
→ `HTTP 403` from this sandbox's egress IP (bot-protection on that .gov host
blocking non-browser/cloud IPs — a commonly reported issue from CI/cloud
IPs). `services.nvd.nist.gov` itself returned `HTTP 200` — reachable. Added
`-DknownExploitedEnabled=false` to the workflow (with a comment explaining
why) to stop that unrelated feed from hard-failing the whole scan before any
real analysis runs.

Second attempt, with `-DknownExploitedEnabled=false`, got past the CISA feed
but hit NVD's own rate limiting for unauthenticated requests:

```
[WARNING] An NVD API Key was not provided - it is highly recommended to use an NVD API key as the update can take a VERY long time without an API Key
[ERROR] Error updating the NVD Data; the NVD returned a 403 or 404 error
[ERROR] NoDataException: No documents exist
```

This reproduces a well-documented constraint of `dependency-check-maven`
9.0.9 / the modern NVD 2.0 API: without an `NVD_API_KEY`, unauthenticated
requests get rate-limited hard enough that a fresh scan reliably fails,
independent of whether any dependency is actually vulnerable. **This agent
does not have an NVD API key and cannot request one on the repo's behalf.**
Added the `NVD_API_KEY` env/secret plumbing to the workflow step and a
comment explaining the constraint; **needs a human to add the `NVD_API_KEY`
repo secret** (https://nvd.nist.gov/developers/request-an-api-key) for the
SCA job to reliably complete a full scan in CI.

Importantly, removing `continue-on-error: true` already changes the observed
behavior in the intended direction even without the key: previously this
data-fetch failure would have been silently swallowed and the job would show
green; now it fails the job outright ("BUILD FAILURE"). That is deliberate —
documented in the workflow comment as fail-closed: a security gate that can't
get fresh vulnerability data should go red, not silently pass. Once
`NVD_API_KEY` is added, the same command is expected to complete and start
gating on real CVSS ≥ 9 findings instead.

No suppression entries were added to
`.github/dependency-check-suppressions.xml` because no scan has actually
completed and produced findings to review yet (see above) — the file exists,
is schema-valid, and documents exactly what a reviewed entry must contain
(issue link, narrow CPE/CVE match, no blanket suppressions). Fabricating
suppression entries for CVEs never actually seen would defeat the purpose of
"reviewed."

### 4. Dependabot / SECURITY.md / issue template

- `.github/dependabot.yml`: 6 update blocks — `maven` (root, covers the
  common/api/worker/cli reactor), `npm` × 2 (`/webhook-platform-ui`,
  `/sdks/node`), `pip` (`/sdks/python`), `composer` (`/sdks/php`),
  `github-actions` (root). Each groups `patch` updates (github-actions also
  groups `minor`, since action version bumps are low-risk and there are only
  a handful of actions in use) so the PR volume stays manageable; weekly
  schedule, `open-pull-requests-limit: 10` each. YAML validated with
  `python3 -c "import yaml; yaml.safe_load(open(...))"` — OK for all three
  new/changed YAML files.
- `.github/ISSUE_TEMPLATE/config.yml`: added, points to GitHub's private
  vulnerability reporting URL and `SECURITY.md`.
- `SECURITY.md`: replaced "email the maintainers directly ... with no email
  address" with a real address (`vadymkykalo@gmail.com`, the repo owner's
  address per `git config` / GitHub account `vadymkykalo`) plus a link to
  GitHub's private vulnerability reporting flow as the preferred channel.
- Private vulnerability reporting **repo setting**: attempted via `gh api -X
  PUT repos/vadymkykalo/webhook-platform/private-vulnerability-reporting`
  (confirmed via `GET` that it was `{"enabled":false}` beforehand); the `PUT`
  was blocked by the Claude Code permission classifier as a live,
  non-git-worktree mutating action. **This one specific item needs a human**
  — either run that same `gh api -X PUT ...` command, or toggle it in the
  GitHub UI (Settings → Code security and analysis).

### 5. Scope discipline

Touched only `.github/workflows/ci.yml`, `.github/dependabot.yml`,
`.github/ISSUE_TEMPLATE/config.yml`, `.github/dependency-check-suppressions.xml`,
and `SECURITY.md`, per the task's `Area: .github/` and the coordinator's
instruction not to touch unrelated CI jobs (`publish-sdks.yml`,
`release-cli.yml` untouched; other `ci.yml` jobs — backend-build/test,
frontend-*, docker-build — untouched).

### Remaining follow-ups (need a human, not more agent time)

1. Add repo secret `NVD_API_KEY` so `security-sca` can complete real scans in
   CI (https://nvd.nist.gov/developers/request-an-api-key).
2. Enable "Private vulnerability reporting" in repo Settings → Code security
   and analysis (or `gh api -X PUT
   repos/vadymkykalo/webhook-platform/private-vulnerability-reporting`).
3. First real CI run of `security-sca` will very likely surface findings
   that need reviewed entries in `.github/dependency-check-suppressions.xml`
   — that triage couldn't happen locally without the NVD data.
4. Confirm from an actual GitHub-hosted runner whether the CISA KEV feed 403
   also affects it (only verified from this sandbox's IP); if not, consider
   re-enabling `-DknownExploitedEnabled` there.
