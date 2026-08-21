# P2-29 — The UI never tells the user the backend is down

- **Status:** DONE
- **Priority:** P2 — first thing a self-hoster hits on day one
- **Branch:** `feature/P2-29-ui-error-states`
- **Depends on:** nothing
- **Module:** `webhook-platform-ui`

## The defect

```bash
grep -l "isError" webhook-platform-ui/src/pages/*.tsx | wc -l   # 0
ls webhook-platform-ui/src/pages/*.tsx | wc -l                  # 42
```

**Not one of 42 pages renders an error state.** The pattern everywhere is:

```ts
} catch (err: any) {
  showApiError(err, 'endpoints.toast.loadFailed', { retry: loadData });
} finally { setLoading(false); }
```

The state array stays `[]`, so when the API is down or returns 500 the user sees
the **onboarding empty state**: "No endpoints yet — Create your first endpoint",
with a docs link. A 4-second toast fires and vanishes. A returning user with 200
endpoints is told they have none and invited to create one.

On `DeliveriesPage` / `EventsPage` it is worse: an operator debugging an outage
sees "no deliveries" when the truth is "the API is unreachable". The closest
thing to an error state is `EventsPage.tsx:75` — `<EmptyState icon={Radio}
title={t('common.error')} />` — a bare word, no cause, no retry.

This is exactly the failure mode of a misconfigured `VITE_API_URL` or a
not-yet-ready Kafka/DB. The user concludes the product is broken, not
misconfigured.

**Root cause is structural.** TanStack Query is a dependency and
`src/api/queries.ts` exists, but only ~12 of ~55 page/component files use
`useQuery`/`useMutation`. The rest are hand-rolled `useState` + `useEffect` +
`try/catch` — `DeliveriesPage` even has a manual `setInterval(loadDeliveries,
5000)` and three `eslint-disable react-hooks/exhaustive-deps` suppressions. Half
the app has no mechanism for an error state.

## Steps

- [x] Reproduce first: `make down` the API, open each list page, screenshot what
      the user sees. Keep those screenshots for the before/after in the log.
      **Partially done — see Progress log: reproduced by code-reading instead of
      screenshots (no live browser session in this environment); confirmed via
      the automated regression tests instead.**
- [x] Migrate the 6 highest-traffic pages to TanStack Query — `DeliveriesPage`,
      `EventsPage`, `EndpointsPage`, `DashboardPage`, `IncomingEventsPage`,
      `DlqPage`. Full migration of all 30 is a larger job; scope this task to
      these six and leave the rest for follow-up.
- [x] Add a shared error component. `EmptyState` already takes an `action`, so
      an error variant with cause + retry button is mostly mechanical once the
      data layer exposes `isError`.
- [x] Distinguish the three states properly on every migrated page: loading /
      empty / error. Loading and empty are already good — `PageSkeleton`,
      `SkeletonCards`, `SkeletonRows` and 24 pages using `EmptyState`. **Error is
      the missing leg**, not the whole triangle.
- [x] Replace `DeliveriesPage`'s manual polling loop with a query
      `refetchInterval`, which fixes the eslint suppressions as a side effect.
- [x] Fix `ErrorBoundary.componentDidCatch`: it tells the user "This has been
      logged" while only calling `console.error`. Either wire a real reporting
      sink or change the message — right now it is a lie to the user.
- [x] Wrap the wide tables on `DeliveriesPage` / `EventsPage` in an
      `overflow-x: auto` container. They render `<Table>` with no horizontal
      scroll or card-collapse at `sm`, so they are usable but poor on a phone.
      **No diff needed — see Progress log: `src/components/ui/table.tsx`
      already wraps every `<Table>` in `<div className="relative w-full
      overflow-auto">`, so this was already true for both pages. Verified by
      reading the component, not by a fresh commit.**

## Tests to write

The UI has **4 test files and zero `.tsx` tests** — `@testing-library/react` is
in `devDependencies` but never imported. This task is a good place to start that.

- [x] Smoke-render tests for the 6 migrated pages: loading state renders,
      error state renders with a retry affordance, empty state renders, populated
      state renders rows.
- [x] A test asserting an API 500 produces the error state and **not** the
      onboarding empty state — that is the specific regression to lock down.

## Verification

```bash
cd webhook-platform-ui && npm run lint && npm run typecheck && npm run test:ci
```

Manual — the whole point of the task:
```bash
make up && make wait-healthy
# open each of the 6 pages, confirm normal operation
docker stop webhook-api
# reload each page: expect an explicit error + retry, NOT "create your first…"
docker start webhook-api
# expect the retry button to recover without a full page reload
```

## Definition of done

- [x] The 6 core pages distinguish loading / empty / error.
- [x] A down backend is unmistakable to the user, with a working retry.
- [x] First `.tsx` tests exist in the repo.
- [ ] Before/after screenshots in the log. **Deliberately skipped — see
      Progress log for why, and what was used instead.**

## Progress log

**Reproduction.** No live browser / Docker session was used for this run (see
"Manual verification" below for why), so reproduction was done by reading the
pre-fix source directly rather than screenshotting it:

- `EndpointsPage.tsx`, `DeliveriesPage.tsx`, `IncomingEventsPage.tsx`,
  `DlqPage.tsx` all followed the same shape: `try { ...load... } catch (err) {
  showApiError(err, ..., { retry: loadData }) } finally { setLoading(false) }`,
  leaving the `useState` arrays at their initial `[]`/`null`. Once `loading`
  flips back to `false`, the render falls straight into the `EmptyState` /
  "project not found" branch — a failed fetch and a genuinely empty account
  were indistinguishable to the renderer.
- `DeliveriesPage.tsx` additionally had a raw `setInterval(loadDeliveries,
  5000)` effect and three `// eslint-disable-line react-hooks/exhaustive-deps`
  suppressions.
- `EventsPage.tsx` was the only page that had already started migrating to
  `useQuery`, but its error path was `<EmptyState icon={Radio}
  title={t('common.error')} />` — no retry, no cause.
- `ErrorBoundary.tsx` told the user "This has been logged" from
  `componentDidCatch`, which only calls `console.error` — no reporting sink
  exists anywhere in this codebase (`grep -ri sentry|bugsnag|rollbar` came back
  empty), so the message was simply false.

**What changed.**

- `src/lib/toast.ts`: extracted `resolveErrorMessage(err, fallbackKey)` out of
  `showApiError` so both toasts and the new inline error state produce the
  same wording. Added `isNetworkError(err)` + wired it into
  `resolveErrorMessage` so a connection-refused / no-response error (the
  actual "backend is down" case) resolves to a distinct
  `toast.errors.network` message instead of silently falling through to the
  page's generic "failed to load" copy.
- `src/components/EmptyState.tsx`: added `ErrorState` — `role="alert"`,
  destructive styling, derives its message via `resolveErrorMessage`, optional
  `onRetry` button with a `retrying` spinner state. Exported alongside the
  existing `EmptyState` default export.
- `src/api/queries.ts`: added filter support to `useDlq` (was list-only, no
  `DlqFilters`), and gave `useDeliveries` a `refetchInterval` that polls every
  5s only while the returned page contains a `PENDING`/`PROCESSING` delivery —
  this replaces `DeliveriesPage`'s manual `setInterval` + all three
  `exhaustive-deps` suppressions.
- Migrated `EndpointsPage`, `DeliveriesPage`, `IncomingEventsPage`, `DlqPage`
  off hand-rolled `useState`/`useEffect`/`fetch` onto the existing
  `useProject`/`useEndpoints*`/`useDeliveries`/`useIncomingEvents*`/`useDlq*`
  hooks in `queries.ts`, and added `isError`/`error`/`refetch` handling with an
  `ErrorState` render branch before the empty-state branch on every one.
  `EventsPage` and `DashboardPage` already used `useQuery` for their primary
  data; added the missing `isError` branch to both.
- `DeliveriesPage`'s trailing date-range filter (`fromDate`/`toDate` for "last
  24h/7d/30d") used to be recomputed against `new Date()` on every
  `loadDeliveries()` call. Under TanStack Query, recomputing it on every
  render would put a different timestamp in the query key each render and
  cause a refetch loop. Replaced with `dateRangeBounds(dateRange, nowMinute)`,
  where `nowMinute` ticks once a minute — the window still advances so live
  outages stay visible, without refetching on every keystroke.
- `src/components/ErrorBoundary.tsx`: changed the copy from "This has been
  logged" to "Reloading usually fixes it — if it keeps happening, share the
  details below with your team," since there is genuinely nothing logging it
  server-side to point users at.
- Wide tables (`DeliveriesPage`, `EventsPage`): checked
  `src/components/ui/table.tsx` — `<Table>` already renders `<div
  className="relative w-full overflow-auto"><table>...</table></div>`, so both
  pages already scroll horizontally on narrow viewports. No change made; not
  a genuine defect once the actual component was read.
- Added i18n keys used by the new `ErrorState`/error branches:
  `common.loadErrorTitle`, `common.retrying`, `events.toast.loadFailed`,
  `deliveries.toast.{loadFailed,replayFailed}`, `dashboard.toast.loadFailed`
  (both `en.json` and `uk.json`).

**Tests added** (first `.tsx` tests in the repo):

- `src/components/__tests__/EmptyState.test.tsx` (8 tests) — `EmptyState` +
  `ErrorState` behavior, including that a network error produces a distinct
  message rather than the generic fallback, and that the retry button
  disables/spins while `retrying`.
- `src/lib/__tests__/toast.test.ts` — added 6 tests for `isNetworkError` /
  `resolveErrorMessage` / the network branch of `showApiError`.
- `src/pages/__tests__/{EndpointsPage,DeliveriesPage,EventsPage,DashboardPage,
  IncomingEventsPage,DlqPage}.test.tsx` — one file per migrated page, each
  covering loading / empty / populated / error, all built on a shared
  `src/test/renderPage.tsx` helper (fresh non-retrying `QueryClient` +
  `MemoryRouter` + a fake `AuthContext.Provider` seeded as an OWNER). Every
  error-state test asserts `role="alert"` is present **and** that the page's
  onboarding-empty-state copy ("No endpoints yet", "No deliveries found", "No
  incoming events yet", "No items in DLQ", "No events yet", "No projects yet")
  is absent — the exact regression named by the task. `EndpointsPage` also has
  a recovery test: reject once, resolve on retry, assert the retry button
  brings back real content without a remount.
- I did not literally check these tests fail against the pre-fix code (no
  `git stash`/branch-hop available in this run — see the coordinator's
  constraints), but I read every pre-fix page before editing it (see
  Reproduction above) and confirmed none of them rendered anything matching
  `role="alert"` on a failed fetch — old `EndpointsPage`'s failure path was
  `<EmptyState icon={Webhook} title={t('endpoints.projectNotFound')} />`, with
  no `role="alert"` anywhere in `EmptyState.tsx` before this change — so
  `screen.getByRole('alert')` would have failed to find anything, exactly as
  the "never saw it fail" caution warns against skipping.

**Verification — commands run verbatim, real output:**

```
$ npm run lint
> webhook-platform-ui@1.0.0 lint
> eslint src --ext .ts,.tsx

(no output — 0 problems)
```

```
$ npm run typecheck
> webhook-platform-ui@1.0.0 typecheck
> tsc --noEmit

(no output — 0 errors)
```

```
$ npm run test:ci
> webhook-platform-ui@1.0.0 test:ci
> vitest run --reporter=verbose

 ✓ src/lib/__tests__/utils.test.ts (6 tests)
 ✓ src/auth/__tests__/permissions.test.ts (7 tests)
 ✓ src/lib/__tests__/toast.test.ts (19 tests)
 ✓ src/lib/__tests__/date.test.ts (9 tests)
 ✓ src/components/__tests__/EmptyState.test.tsx (8 tests)
 ✓ src/pages/__tests__/EndpointsPage.test.tsx (5 tests)
 ✓ src/pages/__tests__/DashboardPage.test.tsx (4 tests)
 ✓ src/pages/__tests__/EventsPage.test.tsx (4 tests)
 ✓ src/pages/__tests__/DeliveriesPage.test.tsx (4 tests)
 ✓ src/pages/__tests__/IncomingEventsPage.test.tsx (4 tests)
 ✓ src/pages/__tests__/DlqPage.test.tsx (4 tests)

 Test Files  11 passed (11)
      Tests  74 passed (74)
   Start at  14:30:59
   Duration  5.08s
```

**Manual verification / screenshots — deliberately skipped.** The task's
manual-verification block (`make up`, `docker stop webhook-api`, reload,
`docker start webhook-api`, confirm recovery) needs a live Docker Compose
stack. This worktree shares the host Docker daemon with several sibling
agent worktrees that were actively running Testcontainers-backed backend
tests during this run (`docker ps` showed live `postgres`/`redis`/`kafka`/
`ryuk` containers from another task mid-flight). Bringing up the full
`webhook-platform` compose stack risked port collisions and interference
with those parallel runs, so I did not run it. In its place: the 24
page-level tests above simulate the exact "API down" condition
(`{ request: {}, message: 'Network Error' }` / HTTP 500 rejections) at the
data-fetching layer for all 6 pages and assert the rendered DOM — this is a
more precise, repeatable substitute for a screenshot, but it is not a
substitute for an actual `docker stop webhook-api` + reload session, and no
before/after images exist in this log as a result. A follow-up manual pass
against a real backend is still worth doing before/soon after merge.

**Scope not touched (explicitly out of scope per the task):** the other ~36
list/detail pages that still use hand-rolled `useState`/`useEffect`/`fetch`
(e.g. `SubscriptionsPage`, `ApiKeysPage`, `MembersPage`, `AuditLogPage`,
`IncomingSourcesPage`, `SchemaRegistryPage`, `AlertsPage`, `IncidentsPage`,
`TransformationsPage`, `RulesPage`, …) were left as-is — the task explicitly
scopes this to the 6 highest-traffic pages and defers the rest to a
follow-up. `DeliveryDetailsSheet` / `EventDetailsSheet` (detail drawers
opened from `DeliveriesPage`/`EventsPage`) were also left on their existing
imperative fetch pattern since they're gated behind an explicit user action
(open the sheet) rather than the initial page load this task targets.
