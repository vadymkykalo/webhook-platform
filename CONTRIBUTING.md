# Contributing to Webhook Platform

Thank you for your interest in contributing! This document outlines the guidelines and workflow for contributing to the project.

## Branch Strategy (GitFlow)

```
main ─────────────────────────────────────────► (production releases)
  │
  └── develop ────────────────────────────────► (integration branch)
        │
        ├── feature/add-retry-logic ──────────► (feature branches)
        ├── feature/dashboard-charts
        │
        └── release/1.1.0 ────────────────────► (release preparation)
```

### Branches

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code. Only merged from `release/*` or hotfixes |
| `develop` | Integration branch. All features merge here first |
| `feature/*` | New features. Branch from `develop`, merge back to `develop` |
| `release/*` | Release preparation. Branch from `develop`, merge to `main` and `develop` |
| `hotfix/*` | Production fixes. Branch from `main`, merge to `main` and `develop` |

## Development Workflow

### 1. Start a new feature

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

### 2. Make your changes

- Write clean, tested code
- Follow existing code style
- Add tests for new functionality
- Update documentation if needed

### 3. Commit your changes

```bash
git add .
git commit -m "feat: add your feature description"
```

**Commit message format:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test changes
- `refactor:` - Code refactoring
- `chore:` - Build/tooling changes

### 4. Push and create PR

```bash
git push origin feature/your-feature-name
```

Create a Pull Request to `develop` branch on GitHub.

### 5. Code Review

- All PRs require at least one approval
- CI must pass before merging
- **Squash merge for `feature/*` → `develop`**, so a feature's work-in-progress
  commits land as a single commit
- **A merge commit for `release/*` and `hotfix/*` → `main` — never squash or
  rebase.** Squashing collapses the branch into a new SHA with no shared
  ancestry, so `main` and `develop` lose their common base and the mandatory
  back-merge conflicts on every file either side has touched — including files
  whose contents are identical. Release 2.3.0 hit this: the previous
  develop→main PR was squash-merged, and the next release's merge reported 19
  conflicts, 12 of them between byte-identical files.

## Running Tests Locally

```bash
# Unit tests
mvn test -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest'

# Integration tests (requires Docker)
mvn test -Dtest='*IntegrationTest,*IT,*RepositoryTest'

# Frontend
cd webhook-platform-ui
npm run lint
npm run typecheck
npm run build
```

## Code Style

### Java (Backend)
- Follow standard Java conventions
- Use Lombok where appropriate
- Write meaningful test names

### TypeScript (Frontend)
- ESLint + Prettier enforced
- Functional components with hooks
- Type everything explicitly

## Release Process

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

## Questions?

Open an issue or start a discussion on GitHub.
