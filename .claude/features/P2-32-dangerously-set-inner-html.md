# P2-32 — Stored XSS via dangerouslySetInnerHTML + unescaped i18n

- **Status:** IN PROGRESS
- **Priority:** P2 — low blast radius, but a researcher finds it on day one
- **Branch:** `feature/P2-32-dangerously-set-inner-html`
- **Depends on:** coordinate with P2-31 (same i18n surface)
- **Module:** `webhook-platform-ui`

## The defect

```bash
grep -rl "dangerouslySetInnerHTML" webhook-platform-ui/src | wc -l   # 19 files
grep -n "escapeValue" webhook-platform-ui/src/i18n/index.ts          # 18: escapeValue: false
```

22 uses across 19 files, all feeding `t()` output to get bold-in-subtitle, e.g.
`DeliveriesPage.tsx`:

```tsx
dangerouslySetInnerHTML={{ __html: t('deliveries.subtitle', { project: project.name }) }}
```

i18next is initialised with `interpolation: { escapeValue: false }` — correct for
React's normal escaping, **wrong** the moment the output goes into `innerHTML`.
So an interpolated project name is injected unescaped.

A project named `<img src=x onerror=alert(1)>` is stored XSS in your own
dashboard. Blast radius is low — you must own the org to set the name, so it is
mostly self-XSS — but it becomes cross-user in any shared org, and it is exactly
the kind of finding that turns up in a first security review of a public repo.

## Steps

- [ ] Reproduce first: create a project named
      `<img src=x onerror=alert(1)>` and open the Deliveries page. **See it fire.**
- [ ] Replace the 22 sites with react-i18next's `<Trans>` component, which
      renders markup as React elements and escapes interpolated values properly.
- [ ] Enumerate every interpolation that reaches `innerHTML` and confirm none
      remains: project names, org names, endpoint URLs, event types, member
      emails — all user-controlled.
- [ ] Keep `escapeValue: false` (it is right for React) but add a lint rule
      banning `dangerouslySetInnerHTML` so a future "just this once" cannot
      reintroduce the pattern.
- [ ] Audit the same class of injection server-side while you are thinking about
      it: does anything render user-controlled strings into emails or the shared
      debug-link pages without escaping? Note what you checked.

## Tests to write

- [ ] A render test with a hostile project name asserting no script executes and
      the literal text is displayed — one canonical case, plus the same name
      pushed through a `<Trans>` subtitle.
- [ ] A lint-level guard is the real regression test here; make sure it fails on
      a deliberately reintroduced `dangerouslySetInnerHTML`.

## Verification

```bash
cd webhook-platform-ui && npm run lint && npm run typecheck && npm run test:ci
grep -rn "dangerouslySetInnerHTML" src | wc -l    # expect 0
```

Manual:
```bash
make up && make wait-healthy
# create org/project/endpoint with names containing <img src=x onerror=alert(1)>
# walk every page that renders those names; no alert, literal text shown
```

## Definition of done

- [ ] Zero `dangerouslySetInnerHTML` in `src/`.
- [ ] Hostile names render as literal text everywhere.
- [ ] Lint rule prevents reintroduction.
- [ ] Server-side rendering surfaces checked and reported.

## Progress log
