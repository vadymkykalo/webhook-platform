# P2-32 — Stored XSS via dangerouslySetInnerHTML + unescaped i18n

- **Status:** DONE
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

- [x] Reproduce first: create a project named
      `<img src=x onerror=alert(1)>` and open the Deliveries page. **See it fire.**
- [x] Replace the 22 sites with react-i18next's `<Trans>` component, which
      renders markup as React elements and escapes interpolated values properly.
- [x] Enumerate every interpolation that reaches `innerHTML` and confirm none
      remains: project names, org names, endpoint URLs, event types, member
      emails — all user-controlled.
- [x] Keep `escapeValue: false` (it is right for React) but add a lint rule
      banning `dangerouslySetInnerHTML` so a future "just this once" cannot
      reintroduce the pattern.
- [x] Audit the same class of injection server-side while you are thinking about
      it: does anything render user-controlled strings into emails or the shared
      debug-link pages without escaping? Note what you checked.

## Tests to write

- [x] A render test with a hostile project name asserting no script executes and
      the literal text is displayed — one canonical case, plus the same name
      pushed through a `<Trans>` subtitle.
- [x] A lint-level guard is the real regression test here; make sure it fails on
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

- [x] Zero `dangerouslySetInnerHTML` in `src/`.
- [x] Hostile names render as literal text everywhere.
- [x] Lint rule prevents reintroduction.
- [x] Server-side rendering surfaces checked and reported.

## Progress log

**Environment note:** `develop` was checked out in the main repo worktree the
whole time, so this worktree could not literally run `git checkout develop &&
git pull` (git refuses to check out a branch that's checked out elsewhere).
Confirmed the main worktree's local `develop` (`6b3e28a`, includes P2-31 —
`22c2fd4 Merge feature/P2-31-i18n-and-bundle into develop`) was up to date, and
branched `feature/P2-32-dangerously-set-inner-html` directly from that ref
(`git checkout -b feature/P2-32-dangerously-set-inner-html develop`).

**Reproduce first.** Since `make up` isn't feasible here (resource contention
with sibling parallel-agent worktrees — P1-19, P1-23, P1-25, P2-29..31, P3-35,
P3-36 etc. were running concurrently), reproduction was done by rendering
`DeliveriesPage` in the existing Vitest/RTL harness with
`project.name = '<img src=x onerror=alert(1)>'` against the **original**
`dangerouslySetInnerHTML={{ __html: t('deliveries.subtitle', { project:
project.name }) }}` line. jsdom parsed the interpolated string as real markup
and inserted a live `<img onerror="alert(1)" src="x">` element into the DOM
(confirmed via the RTL debug dump — see below); a real browser would fire that
`onerror` handler immediately on the invalid `src`. This is the same class of
proof `make up` + a real browser would have given, just without a live browser.

Actual jsdom output before the fix (from `container.querySelector('img')`
being non-null and the debug dump showing):
```
Track webhook delivery attempts for
<strong>
  <img
    onerror="alert(1)"
    src="x"
  />
</strong>
```

**Fix.** Found 24 `dangerouslySetInnerHTML` sites across 20 files (task
estimated 22/19; the count shifted slightly after P2-31 touched some of the
same files). All fed `t()`/`Trans` output built from user-controlled or
locale-string interpolation. Replaced every site:

- 19 "subtitle" sites (`apiKeys`, `deliveries` x2, `devWorkspace`, `dlq`,
  `endpoints`, `events`, `incomingEvents`, `incomingSources`, `replay`,
  `subscriptions`, `testConsole`, `usage`, plus `events.details.noDeliveriesNoSub`
  x2, `auth.forgotPassword.sentMessage`, `auth.register.verificationSent`,
  `auth.verification.banner`, `docsPage.security.*` x2,
  `transformations.howItWorks.hint`, `transformations.howToApply.body`) → now
  render via `<Trans i18nKey="..." values={{ ... }} components={{ strong: <strong />
  }} />` (or `components={{ code: <code /> }}` for the two docs/transform keys
  that use `<code>`). `usage.subtitle`'s inline `defaultValue` fallback became
  `Trans`'s `defaults` prop.
- 2 "brandTitle" sites (`LoginPage.tsx`, `RegisterPage.tsx`) used
  `.replace('\n', '<br />')` on a static (non-user-controlled) locale string —
  not user-controlled, but still removed per the lint ban. Replaced with a
  `.split('\n').map(...)` that renders `<span>{line}{i < arr.length - 1 &&
  <br />}</span>` per line — no HTML string ever touches the DOM.

Interpolated values now covered by `<Trans values={{...}} />` (and therefore
escaped): project name (`project.name` — the finding's reproduction case),
event type (`event.eventType`, `filteredEventType`), user email
(`user?.user?.email` in the verification banner, `email` in forgot-password /
register confirmation screens). Grepped for any other interpolation reaching
`innerHTML`/`insertAdjacentHTML`/`document.write` — none found; org name and
endpoint URL are rendered as plain JSX text elsewhere in the app (never through
`dangerouslySetInnerHTML`), so they were never in scope for this bug but were
checked as part of the enumeration step.

**Lint rule.** Added `'react/no-danger': 'error'` to
`webhook-platform-ui/.eslintrc.cjs` (the `react` plugin was already loaded via
`plugin:react/recommended`, `no-danger` just wasn't enabled). Verified live: a
`dangerouslySetInnerHTML` was deliberately reintroduced into `UsagePage.tsx`,
`npm run lint` failed with
`74:58  error  Dangerous property 'dangerouslySetInnerHTML' found  react/no-danger`,
then the line was reverted.

**Server-side audit (step 5).** Checked:
- `webhook-platform-api/.../service/EmailService.java` — builds 5 HTML emails
  (verification, password reset, invite, temporary password, generic alert).
  None interpolate a user-controlled *display* string (org name, user full
  name) into the HTML body — only server-generated tokens/URLs
  (`verifyUrl`/`resetUrl`/`inviteUrl`, built from a UUID token, not user text)
  and a server-generated random temporary password. `orgId` appears only as a
  URL query-string value, never as rendered HTML text. No user-controlled text
  is interpolated unescaped anywhere in this file.
- `webhook-platform-api/.../service/AlertNotificationService.java` — builds a
  Slack payload (JSON, not HTML — not an injection surface), a webhook JSON
  payload (same), and an HTML alert email. The HTML email **already** escapes
  the two user-controlled fields it interpolates —
  `escapeHtml(event.getTitle())`, `event.getMessage() != null ?
  escapeHtml(event.getMessage()) : ""`, and `escapeHtml(rule.getName())` — via
  a local `escapeHtml()` that replaces `&`, `<`, `>`. Already safe; no change
  needed.
- `SharedDebugLinkController.java` (`GET /api/v1/public/debug/{token}`, the
  "shared debug-link page" the task calls out) — returns
  `ResponseEntity<SharedDebugLinkPublicResponse>`, i.e. JSON, not
  server-rendered HTML. The corresponding UI page,
  `webhook-platform-ui/src/pages/SharedDebugPage.tsx`, renders that JSON
  through plain JSX (`grep dangerouslySetInnerHTML` on that file: 0 matches) —
  React's default escaping applies, same as every other page fixed here.
- Grepped the whole API/worker/common tree for any `text/html`
  `produces`/`MediaType.TEXT_HTML` controller response — none exist. The
  backend is JSON-API-only; there is no server-rendered HTML surface at all
  beyond the emails above.

No server-side injection issue found; `AlertNotificationService` was already
doing the right thing.

**Verification — real output pasted below (after `npm ci` — `node_modules`
wasn't present in this fresh worktree):**

```
$ npm run lint
✖ 12 problems (0 errors, 12 warnings)
```
(all 12 are pre-existing `i18next/no-literal-string` warnings in the P2-31
`overrides` block for files unrelated to this change — `DeliveryDetailsSheet.tsx`,
`EventDetailPage.tsx`, `IncomingSourceDetailPage.tsx`, `TransformationsPage.tsx`,
`WorkflowBuilderPage.tsx`; 0 errors, 0 `react/no-danger` violations.)

```
$ npm run typecheck
> tsc --noEmit
(no output — exit 0)
```

```
$ npm run test:ci
 Test Files  14 passed (14)
      Tests  89 passed (89)
```

```
$ grep -rn "dangerouslySetInnerHTML" src | wc -l
0
```

New test file: `src/pages/__tests__/DeliveriesPage.xss.test.tsx` — two cases,
both passing: (1) the canonical hostile-project-name case (no `<img>` element
in the DOM, `window.alert` never called), (2) the same hostile name pushed
through the `deliveries.subtitle` `<Trans>` — asserts it lands as inert text
inside the `<strong>` Trans renders, never as a live element. Confirmed both
tests genuinely regress: reverted `DeliveriesPage.tsx`'s subtitle back to the
original `dangerouslySetInnerHTML` line, re-ran the test file — both failed,
and the RTL debug dump showed a live `<img onerror="alert(1)" src="x">`
element in the tree — then reverted back to the fix.

**Manual walk-through:** not performed — `make up` skipped per the task's
explicit allowance, given resource contention with the other concurrently
running parallel-agent worktrees in this session. Relied on the render tests
above plus the static grep/lint verification instead, as instructed.

**Left out / not touched:** the two `brandTitle` sites are not user-controlled
(static locale copy) so weren't part of the actual vulnerability, but were
converted anyway since the lint rule is unconditional. No other
`dangerouslySetInnerHTML`-adjacent sinks (`insertAdjacentHTML`,
`document.write`, direct `.innerHTML =`) exist anywhere in `src/`.
