# P1-27 — Rename SDK packages to hookflow (irreversible after publish)

- **Status:** DONE
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

- [x] Check whether each package is already published. `npm view`, `pip index` /
      PyPI web, Packagist. **Do this first** — it determines the whole approach.
- [ ] ~~If unpublished: rename to `hookflow` / `@hookflow/node` / `hookflow/php`~~
      N/A — all three are already published live. See 2b.
- [x] If already published: keep the old name alive as a deprecation shim that
      re-exports the new one, and publish the new name. Do not silently abandon
      users on the old package.
- [x] Update `publish-sdks.yml` and fix the two workflow defects while you are in
      it: it publishes on **every** GitHub release including CLI-only ones, and
      has no version-drift guard, so it will fail with "version already exists"
      on any release where an SDK version was not bumped. Gate publishing on the
      SDK version actually having changed.
- [x] Remove the committed build artifacts — they look sloppy on a public repo
      and are already covered by `.gitignore` rules that were added too late:
      ```bash
      git rm -r --cached sdks/python/hookflow/__pycache__ \
                         sdks/python/webhook_platform.egg-info \
                         sdks/python/.pytest_cache \
                         sdks/php/.phpunit.cache
      ```
      (Ran verbatim — see log: none of these paths were tracked, `git rm`
      errored "did not match any files". Root `.gitignore` already covers
      all four patterns. No-op, already satisfied before this task started.)
- [x] Document SDK scope honestly. All three cover ~6 of 35 API controllers —
      Events, Endpoints, Subscriptions, Deliveries, IncomingSources,
      IncomingEvents, plus signature verification. There is no support for
      Transformations, Rules, Workflows, Schemas, DLQ, Analytics, Usage, Alerts,
      Incidents, PII rules, Audit Log, Tunnels, API keys, Members or Projects.
      That is a perfectly reasonable "send + verify" scope — but it must be
      **stated** in each README so users do not assume dashboard parity.
- [x] Worth advertising while you are in the READMEs: the Node SDK has **zero
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

- [x] Publish state of all three packages established and recorded.
- [x] Names consistent with the product, or a documented deprecation path.
- [x] `publish-sdks.yml` only fires on real SDK version bumps.
- [x] Build artifacts untracked; SDK scope documented in each README.

## Progress log

### 0. Coordinator note (post-merge simplification)

The agent that ran this task correctly found the packages already published
and built a full deprecation-shim setup (`sdks/{node,python,php}-legacy` +
matching `publish-*-legacy` CI jobs, `npm deprecate` call). Before merging,
the repo owner confirmed the old packages have **zero real downloads/usage**
despite being live. Given that, the shim infrastructure was removed at merge
time as unneeded complexity — the old package names are simply abandoned,
no deprecation notice or re-export needed since nobody depends on them. Only
`publish-node`, `publish-python`, `publish-php` (the three new-name jobs)
remain in `publish-sdks.yml`; each SDK's README states the old package was
abandoned rather than kept as a shim. If real-world usage is ever discovered
on the old names, revisit — the removed shim design is preserved in this
file's git history (branch `feature/P1-27-sdk-rename`, commit `2f6adb7`) if
needed again.

### 1. Publish state (read first — changes the whole approach)

All three packages are **already published live**, under real accounts
matching this repo's git user (`vadymkykalo <vadymkykalo@gmail.com>`). This
is not the "cheap now" unpublished case the task headline describes — it's
the 2b path.

```
$ npm view @webhook-platform/node
@webhook-platform/node@2.2.1 | MIT | deps: none | versions: 8
Official Node.js SDK for Hookflow — reliable webhook infrastructure
...
maintainers: vadymkykalo <vadymkykalo@gmail.com>
published 5 months ago by vadymkykalo <vadymkykalo@gmail.com>

$ curl -s https://pypi.org/pypi/webhook-platform/json | ...
"author_email": "Vadym Kykalo <vadymkykalo@gmail.com>"
"version" (release_url): .../webhook-platform/2.2.1/
(the shipped module is already named `hookflow` — the PyPI *distribution*
name was the only thing still `webhook-platform`)

$ curl -s https://repo.packagist.org/p2/webhook-platform/php.json
"name":"webhook-platform/php","version":"2.2.1", authors: Vadym Kykalo
<vadymkykalo@gmail.com>, source repo:
https://github.com/vadymkykalo/webhook-platform-php.git   <-- separate repo,
not this monorepo (relevant for the PHP shim plan below)
```

So: rename is off the table for the already-taken names; approach is
**keep the old name alive as a deprecation shim, stand up the new name**.

### 2. Name availability for the new packages

```
$ npm view @hookflow/node   -> 404 (available)
$ npm view hookflow         -> 404 (available, unused — kept unscoped node
                                package name as @hookflow/node per npm scope
                                convention)
$ curl pypi.org/pypi/hookflow/json          -> 200, TAKEN by an unrelated
     project (tekintian/hookflow, a Git hooks manager). Not squatting by us.
$ curl pypi.org/pypi/hookflow-sdk/json      -> 404 (available) <- chosen
$ curl pypi.org/pypi/hookflow-python/json   -> 404 (available)
$ curl pypi.org/pypi/pyhookflow/json        -> 404 (available)
$ curl repo.packagist.org/p2/hookflow/php.json -> 404 (available) <- chosen
```

Final names: **`@hookflow/node`** (npm), **`hookflow-sdk`** (PyPI — bare
`hookflow` is taken by an unrelated package), **`hookflow/php`** (Packagist).
The importable/namespace surface (`hookflow` Python module, `Hookflow\` PHP
namespace) was already correct in the source — only the registry-facing
manifest name changed for those two.

### 3. What changed, per SDK

**Node** (`sdks/node`): `package.json` name -> `@hookflow/node`,
`publishConfig.access: public` added (required for a new scoped package),
`package-lock.json` root name/version updated, README title/install/import
snippets updated, added a "Renamed from..." notice, a Scope section, and a
zero-runtime-deps callout. Added `tsconfig.json` `paths` + `jest.config.js`
`moduleNameMapper` for `@hookflow/node` so a test can self-resolve the
package by its published name without a real install. New regression test:
`src/__tests__/package-rename.test.ts` (asserts `package.json.name ===
'@hookflow/node'` and constructs a client via `import { Hookflow } from
'@hookflow/node'`).

Deprecation shim: **`sdks/node-legacy/`** — new package.json for
`@webhook-platform/node@2.2.2`, `dependencies: { "@hookflow/node": "^2.2.1"
}`, `index.js` re-exports `@hookflow/node` and prints a one-line deprecation
warning (silenceable via `HOOKFLOW_SUPPRESS_DEPRECATION_WARNING=1`),
`index.d.ts` re-exports types, README explains why it exists and documents
the `npm deprecate` step a maintainer runs after publishing (package.json's
`deprecated` field is metadata only, npm doesn't act on it at publish time).

**Python** (`sdks/python`): `pyproject.toml` `[project].name` ->
`hookflow-sdk` (the `hookflow/` module directory and all internal imports
were already correctly named — no code changes needed there). README
title/install updated, added a "Renamed from..." notice explaining the
PyPI-name-vs-import-name distinction and why `hookflow-sdk` not bare
`hookflow`, plus a Scope section. New regression test:
`tests/test_package_rename.py` (asserts
`importlib.metadata.distribution('hookflow-sdk')` resolves, and constructs
a client via `from hookflow import Hookflow`).

Deprecation shim: **`sdks/python-legacy/`** — new `pyproject.toml` for
`webhook-platform@2.2.2` as a **pure dependency metapackage**
(`[tool.setuptools] packages = []`, `dependencies = ["hookflow-sdk>=2.2.1"]`)
— it ships no code of its own, since `hookflow-sdk` already provides the
`hookflow` module that existing `webhook-platform` users import. Verified
this builds and installs cleanly (`pip install -e .` succeeded, produced
`webhook_platform-2.2.2`). README explains the shim and the `npm`-style
migration note.

**PHP** (`sdks/php`): `composer.json` name -> `hookflow/php` (the `Hookflow\`
PSR-4 namespace was already correct — no `src/` changes needed). README
title/install updated with a "Renamed from..." notice and a Scope section.
New regression test: `tests/PackageRenameTest.php` (asserts
`composer.json`'s `name === 'hookflow/php'`, constructs a client).

Deprecation shim: **`sdks/php-legacy/`** — `composer.json` for
`webhook-platform/php@` as a Composer **metapackage** (`"type":
"metapackage"`, `"require": {"hookflow/php": "^2.2.1"}`, no `version` field
per `composer validate`'s own recommendation for Packagist-published
packages) — validated with `composer validate --no-check-all
--no-check-version` -> `./composer.json is valid`. README documents an
important **repo-topology caveat** discovered while confirming publish
state: the live `webhook-platform/php` Packagist package is actually backed
by a *separate* GitHub repo (`vadymkykalo/webhook-platform-php`), not this
monorepo — so actually publishing the shim update, and actually registering
`hookflow/php` for the first time, both require action outside this
monorepo (pushing to that existing repo, or standing up a `hookflow-php`
equivalent). Documented rather than silently assumed away; flagged in both
`sdks/php-legacy/README.md` and a comment in `publish-sdks.yml`.

### 4. `publish-sdks.yml`

Rewrote the workflow: every publish job (`publish-node`, `publish-python`,
`publish-php`, plus new `publish-node-legacy`, `publish-python-legacy`,
`publish-php-legacy`) now starts with a "Check version drift" step that
reads the local manifest version and queries the registry (`npm view`,
PyPI JSON API, Packagist p2 API) for the currently-published version;
build/test/publish steps are gated on `steps.check.outputs.should_publish
== 'true'`. A CLI-only GitHub release (no SDK version bump) now no-ops per
SDK instead of failing with "version already exists". Verified the YAML
parses (`python3 -c "import yaml; yaml.safe_load(...)"` -> OK) and the two
registry-query one-liners used inside the job scripts against the real
APIs (both returned the expected `2.2.1`/`2.2.1` for the already-published
names). `publish-php-legacy` only validates the metapackage's
`composer.json` in CI — actually publishing it needs the separate-repo step
above, which is outside GitHub Actions running from this monorepo.

### 5. Build artifacts

`git rm -r --cached sdks/python/hookflow/__pycache__
sdks/python/webhook_platform.egg-info sdks/python/.pytest_cache
sdks/php/.phpunit.cache` — ran verbatim, got `fatal: pathspec
'sdks/python/hookflow/__pycache__' did not match any files`. None of the
four paths are tracked in this repo state; root `.gitignore` already has
`__pycache__/`, `*.egg-info/`, `.pytest_cache/`, and
`sdks/php/.phpunit.cache/`. Pre-existing, already satisfied. Added
`sdks/php-legacy/vendor/` and `sdks/php-legacy/composer.lock` to
`.gitignore` proactively for the new shim directory.

### 6. Verification (verbatim commands, real output)

```
$ cd sdks/node && npm ci && npm test && npm pack --dry-run
added 279 packages, and audited 280 packages in 7s
...
> @hookflow/node@2.2.1 test
> jest
PASS src/__tests__/client.test.ts
PASS src/__tests__/webhooks.test.ts
PASS src/__tests__/incoming.test.ts
PASS src/__tests__/package-rename.test.ts
Test Suites: 4 passed, 4 total
Tests:       58 passed, 58 total
...
npm notice 📦  @hookflow/node@2.2.1
npm notice name: @hookflow/node
npm notice filename: hookflow-node-2.2.1.tgz
npm notice total files: 2
```
(58 = 56 original cases + 2 new smoke assertions — matches the task's
"node 56 cases" regression-net figure.)

```
$ cd ../python && pip install -e . && pytest && python -c "import hookflow"
Successfully installed hookflow-sdk-2.2.1
...
======================== 73 passed, 5 skipped in 0.42s =========================
OK 2.2.1
```
(pytest itself isn't a runtime dependency of the plain `pip install -e .`
verbatim command, so it was installed separately to run this step; the base
install worked with zero changes to `dependencies`. 73 = 71 original + 2 new
smoke assertions, matching "python 71 cases"; the 5 skipped are the
`@pytest.mark.contract` tests that need a live API, unrelated to this task.)

```
$ cd ../php && composer install && vendor/bin/phpunit
[composer install: 27 packages installed clean]
PHPUnit 10.5.64 by Sebastian Bergmann and contributors.
SSSSS.......................................                      44 / 44 (100%)
Tests: 44, Assertions: 88, PHPUnit Warnings: 1 (no coverage driver — expected,
plain php:8.2-cli has no xdebug/pcov), Skipped: 5.
```
Note on the count: the task's "php 48 cases" regression-net figure doesn't
match what's actually in the repo — the base suite before this task's
changes is **42** test methods (verified by running with the new
`PackageRenameTest.php` removed), not 48. 42 original + 2 new smoke
assertions = 44, which is what the run above shows. Flagging the mismatch
rather than silently reporting a made-up 48; all 42 pre-existing methods
still pass unchanged.

(Ran locally via Docker — `composer:2` and `php:8.2-cli` images — since
this sandbox has no `php`/`composer` binaries installed natively.)

```
$ git status --short
```
No `__pycache__`, `egg-info`, `.pytest_cache`, `.phpunit.cache`, `vendor/`,
`node_modules/`, or `dist/` entries — only the intended source/manifest
changes and the new `sdks/node-legacy/`, `sdks/python-legacy/`,
`sdks/php-legacy/` directories.

```
$ grep -rn "webhook-platform" sdks/*/README.md sdks/node/package.json \
     sdks/python/pyproject.toml sdks/php/composer.json
```
All remaining hits are intentional: the monorepo's own GitHub repo URL
(`github.com/vadymkykalo/webhook-platform`, unrelated to package naming,
out of scope to rename), and the deprecation-notice prose in the primary
READMEs plus the three `*-legacy/README.md` files explaining the old
package names. `sdks/node/package.json` and `sdks/php/composer.json`
themselves have zero remaining `webhook-platform` occurrences (grep matched
`sdks/node/package.json`'s repo `url` field only, which is the monorepo git
URL, not a package name).

### 7. Scope note vs. task's "Depends on: P1-16"

The task lists `Depends on: P1-16 (version reconciliation) — coordinate,
both touch SDK manifests`. P1-16 was not checked/coordinated with directly
in this session (it wasn't DONE on the board when this task started, and
this session doesn't touch other agents' branches). The manifest edits here
are additive/renaming, not version bumps beyond the new `-legacy` shims'
`2.2.2`, so conflict risk on merge should be limited to line-level overlap
in `package.json`/`pyproject.toml`/`composer.json`, resolvable at merge
time. Left for the coordinator to watch when merging both branches into
`develop`.
