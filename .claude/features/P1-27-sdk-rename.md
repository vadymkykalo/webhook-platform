# P1-27 — Rename SDK packages to hookflow (irreversible after publish)

- **Status:** IN PROGRESS
- **Priority:** P1 — **time-critical**: cheap now, impossible after first publish
- **Branch:** `feature/P1-27-sdk-rename`
- **Depends on:** P1-16 (version reconciliation) — coordinate, both touch SDK manifests
- **Area:** `sdks/`, `.github/workflows/publish-sdks.yml`

## The problem

The product, the CLI, the classes and the docs are all called **Hookflow**. The
SDK packages are not:

| Registry | Current name |
|----------|--------------|
| npm | `@webhook-platform/node` |
| PyPI | `webhook-platform` |
| Packagist | `webhook-platform/php` |

Package names are permanent once published — registries do not allow reuse or
rename. If the first publish goes out under the old name, the product ships
forever with a mismatched identity, or you carry two names and a deprecation
notice indefinitely.

Confirm the current publish state before anything else: if these are already
live, this task changes shape entirely (new package + deprecation shim on the
old one) — say which situation you found in the log.

## Steps

- [ ] Check whether each package is already published. `npm view`, `pip index` /
      PyPI web, Packagist. **Do this first** — it determines the whole approach.
- [ ] If unpublished: rename to `hookflow` / `@hookflow/node` / `hookflow/php`
      (pick names consistent with each registry's conventions and check
      availability), update every manifest, import path, README and code sample.
- [ ] If already published: keep the old name alive as a deprecation shim that
      re-exports the new one, and publish the new name. Do not silently abandon
      users on the old package.
- [ ] Update `publish-sdks.yml` and fix the two workflow defects while you are in
      it: it publishes on **every** GitHub release including CLI-only ones, and
      has no version-drift guard, so it will fail with "version already exists"
      on any release where an SDK version was not bumped. Gate publishing on the
      SDK version actually having changed.
- [ ] Remove the committed build artifacts — they look sloppy on a public repo
      and are already covered by `.gitignore` rules that were added too late:
      ```bash
      git rm -r --cached sdks/python/hookflow/__pycache__ \
                         sdks/python/webhook_platform.egg-info \
                         sdks/python/.pytest_cache \
                         sdks/php/.phpunit.cache
      ```
- [ ] Document SDK scope honestly. All three cover ~6 of 35 API controllers —
      Events, Endpoints, Subscriptions, Deliveries, IncomingSources,
      IncomingEvents, plus signature verification. There is no support for
      Transformations, Rules, Workflows, Schemas, DLQ, Analytics, Usage, Alerts,
      Incidents, PII rules, Audit Log, Tunnels, API keys, Members or Projects.
      That is a perfectly reasonable "send + verify" scope — but it must be
      **stated** in each README so users do not assume dashboard parity.
- [ ] Worth advertising while you are in the READMEs: the Node SDK has **zero
      runtime dependencies** (uses `node:https` directly). That is an unusually
      good supply-chain posture for an infra SDK.

## Tests to write

- The existing suites (node 56 cases, python 71, php 48) must pass unchanged
  after the rename — they are the regression net for this task.
- Add a smoke test per SDK that imports the package by its **new** name and
  constructs a client, so a broken rename fails loudly rather than at install
  time for a user.

## Verification

```bash
cd sdks/node && npm ci && npm test && npm pack --dry-run
cd ../python && pip install -e . && pytest && python -c "import hookflow"
cd ../php && composer install && vendor/bin/phpunit
```

```bash
git status --short    # no __pycache__, egg-info, .pytest_cache, .phpunit.cache
grep -rn "webhook-platform" sdks/*/README.md sdks/node/package.json \
     sdks/python/pyproject.toml sdks/php/composer.json
# only intentional references remain
```

## Definition of done

- [ ] Publish state of all three packages established and recorded.
- [ ] Names consistent with the product, or a documented deprecation path.
- [ ] `publish-sdks.yml` only fires on real SDK version bumps.
- [ ] Build artifacts untracked; SDK scope documented in each README.

## Progress log
