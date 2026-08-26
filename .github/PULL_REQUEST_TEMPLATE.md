> **Target branch:** `develop`, not `main`. `main` only ever receives
> `release/*` and `hotfix/*` — a `feature/*` PR against it will be closed.
> ([`CONTRIBUTING.md`](../CONTRIBUTING.md#branch-strategy-gitflow))

## What this changes

<!-- What it does, and why it needed doing. If it fixes a bug, what the bug was. -->

## Related issues

Closes #

## Checklist

- [ ] Targets `develop`
- [ ] New behaviour has a test that failed before the change and passes after
- [ ] `make ratchets` passes — the build guards, which do not run under an
      obvious name in CI and are easy to trip without noticing
- [ ] Touched a DTO? Regenerated `openapi.yaml` and `api.generated.ts`
      (`make types-check`, `make docs-check`)
- [ ] Touched the schema? Entity in `api`, its copy in `worker`, and a migration
- [ ] New names checked against [`CONTEXT.md`](../CONTEXT.md)
- [ ] User-facing strings exist in **both** `en.json` and `uk.json`

## How to test it

<!-- The commands or steps a reviewer runs. Screenshots for UI changes. -->
