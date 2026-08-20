# P2-33 — OSS metadata, docs site, demo, committed OpenAPI

- **Status:** TODO
- **Priority:** P2
- **Branch:** `feature/P2-33-oss-metadata-and-docs`
- **Depends on:** P1-15 and P1-16 (badges and install docs depend on those landing)
- **Area:** repo root, `.github/`, `docs/`

## Context

What already exists is more than most self-hosted projects launch with: a 15.6KB
README with three flow diagrams, `CONTRIBUTING.md`, `SECURITY.md`, MIT `LICENSE`,
`CHANGELOG.md`, issue and PR templates, a 25-file Helm chart, a monitoring stack,
6 runbooks, and a 570-line `docs/SELF_HOSTED_GUIDE.md` with hardware sizing, a
port matrix, TLS/mTLS, and troubleshooting.

This task fills the remaining trust-signal gaps, not substance gaps.

## Steps

- [ ] Add the missing files, verified absent: `CODE_OF_CONDUCT.md`,
      `.github/CODEOWNERS`, `.github/FUNDING.yml` (if wanted), `.editorconfig`,
      `NOTICE`. (`dependabot.yml` and `ISSUE_TEMPLATE/config.yml` belong to
      P1-17 — check they landed rather than duplicating.)
- [ ] README badges: CI status, license, coverage (needs P1-28), latest release,
      Docker pulls (needs P1-15). Do not add a coverage badge before there is a
      real number behind it.
- [ ] Export OpenAPI in CI and **commit the spec**. Today the API reference lives
      only inside `DocumentationPage.tsx` — 4,080 lines of genuinely substantial
      in-app docs with per-language samples, but it is not crawlable, not
      linkable from GitHub, and not versioned with releases. Evaluators read
      before they install.
- [ ] Stand up a static docs site (Docusaurus/Mintlify) or, at minimum, publish
      the committed OpenAPI via a renderer. Reuse the `DocumentationPage` content
      rather than writing it twice — divergent docs are worse than one location.
- [ ] Add an "SDK covers X, use REST for Y" table (see P1-27) so the ~6-of-35
      controller coverage is explicit.
- [ ] A public read-only demo instance is the highest-leverage marketing item for
      a UI-heavy product — right now `docs/img.png` is doing all the persuasion.
      Scope it carefully: seeded data, no registration, hard resource caps, and
      **make sure P0-08/P0-13 have landed first** — a public demo with live
      cross-tenant IDOR is worse than no demo.
- [ ] License posture: MIT is defensible on a spot-check (Spring Boot Apache-2.0,
      React/Radix/Tailwind/Recharts MIT, Lucide ISC) but nothing proves it. Add a
      dependency license report and an SBOM. Two specific decisions needed:
      **MinIO is AGPL-3.0** (`docker-compose.yml:109`) inside an MIT-branded
      "boxed" distribution — a lawyer at an evaluating company will ask; and the
      Bitnami subchart pins (P1-19) affect what users can actually pull.
- [ ] `.mailmap` to unify the two author identities (P1-16 also lists this —
      whoever gets there first).

## Verification

```bash
ls CODE_OF_CONDUCT.md NOTICE .editorconfig .github/CODEOWNERS
# spec is committed and current:
git diff --exit-code openapi.yaml    # after regenerating in CI
```

- [ ] Open the rendered docs site and click through the API reference.
- [ ] If a demo is deployed, confirm from a second account that cross-tenant
      access is impossible.

## Definition of done

- [ ] Standard OSS metadata files present.
- [ ] OpenAPI committed and rendered somewhere linkable.
- [ ] License/SBOM report exists; MinIO and Bitnami decisions recorded.
- [ ] Demo live (or explicitly deferred with a reason), and only after P0 security work.

## Progress log
