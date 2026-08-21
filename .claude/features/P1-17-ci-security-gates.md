# P1-17 — Make CI security gates actually fail; add Dependabot

- **Status:** IN PROGRESS
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

- [ ] Turn Trivy to `--exit-code 1` for CRITICAL first. Expect the build to go
      red immediately — that is the point; triage what it finds before widening
      to HIGH. Note the initial finding count in the log.
- [ ] Same staged approach for OWASP Dependency-Check: set a CVSS failure
      threshold, and add a **reviewed** suppression file for false positives
      rather than leaving the whole gate off.
- [ ] SpotBugs: decide whether it gates or stays advisory. If advisory, say so
      in a comment in the workflow so the next reader knows it is deliberate,
      not forgotten.
- [ ] Add `.github/dependabot.yml` covering five ecosystems: `maven` (root),
      `npm` (`/webhook-platform-ui`, `/sdks/node`), `pip` (`/sdks/python`),
      `composer` (`/sdks/php`), `github-actions`. Group patch updates so the PR
      volume stays manageable — ungrouped Dependabot on six ecosystems is how
      teams end up ignoring it.
- [ ] Add `.github/ISSUE_TEMPLATE/config.yml` and enable GitHub private
      vulnerability reporting; put a real address in `SECURITY.md`, which
      currently says "email the maintainers directly" **with no email address**.
      (P2-33 covers the rest of the OSS metadata; the security contact belongs here.)
- [ ] Sanity-check that a deliberately vulnerable dependency actually fails the
      build — a gate you have not seen fire is not a gate.

## Verification

```bash
# temporarily pin a known-vulnerable dependency, push, confirm CI goes red,
# then revert. Paste the failing run URL/output.
gh workflow run ci.yml
gh run list --limit 3
```

## Definition of done

- [ ] Trivy and OWASP can fail the build; current findings triaged, not suppressed wholesale.
- [ ] Dependabot configured for all five ecosystems with sane grouping.
- [ ] `SECURITY.md` has a real contact; private reporting enabled.
- [ ] Proof that the gate fires, pasted in the log.

## Progress log
