# P2-29 — The UI never tells the user the backend is down

- **Status:** TODO
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

- [ ] Reproduce first: `make down` the API, open each list page, screenshot what
      the user sees. Keep those screenshots for the before/after in the log.
- [ ] Migrate the 6 highest-traffic pages to TanStack Query — `DeliveriesPage`,
      `EventsPage`, `EndpointsPage`, `DashboardPage`, `IncomingEventsPage`,
      `DlqPage`. Full migration of all 30 is a larger job; scope this task to
      these six and leave the rest for follow-up.
- [ ] Add a shared error component. `EmptyState` already takes an `action`, so
      an error variant with cause + retry button is mostly mechanical once the
      data layer exposes `isError`.
- [ ] Distinguish the three states properly on every migrated page: loading /
      empty / error. Loading and empty are already good — `PageSkeleton`,
      `SkeletonCards`, `SkeletonRows` and 24 pages using `EmptyState`. **Error is
      the missing leg**, not the whole triangle.
- [ ] Replace `DeliveriesPage`'s manual polling loop with a query
      `refetchInterval`, which fixes the eslint suppressions as a side effect.
- [ ] Fix `ErrorBoundary.componentDidCatch`: it tells the user "This has been
      logged" while only calling `console.error`. Either wire a real reporting
      sink or change the message — right now it is a lie to the user.
- [ ] Wrap the wide tables on `DeliveriesPage` / `EventsPage` in an
      `overflow-x: auto` container. They render `<Table>` with no horizontal
      scroll or card-collapse at `sm`, so they are usable but poor on a phone.

## Tests to write

The UI has **4 test files and zero `.tsx` tests** — `@testing-library/react` is
in `devDependencies` but never imported. This task is a good place to start that.

- [ ] Smoke-render tests for the 6 migrated pages: loading state renders,
      error state renders with a retry affordance, empty state renders, populated
      state renders rows.
- [ ] A test asserting an API 500 produces the error state and **not** the
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

- [ ] The 6 core pages distinguish loading / empty / error.
- [ ] A down backend is unmistakable to the user, with a working retry.
- [ ] First `.tsx` tests exist in the repo.
- [ ] Before/after screenshots in the log.

## Progress log
