# CLAUDE.md — webhook-platform-ui

`src/api/*.api.ts` are thin wrappers over the shared `src/api/http.ts` axios client, which owns the bearer token and does automatic refresh-on-401 with request queueing — call the API through these wrappers rather than importing axios directly, or a 401 won't be retried.

TanStack Query keys are centralized in `src/api/queries.ts`; add new keys there instead of inlining string arrays at call sites.

Every user-facing string is a translation key with a value in **both** `src/i18n/locales/en.json`
and `uk.json`. `src/i18n/__tests__/locales.test.ts` fails CI on a key present in one and missing
from the other — otherwise the gap stays invisible until it renders as a raw key in production.

Page tests render through `src/test/renderPage.tsx`, not a bare `render()`: it supplies a fresh
no-retry `QueryClient` (retries hang error-state tests), a `MemoryRouter` and a fake
authenticated `OWNER`. One file: `npm test -- EndpointsPage`.

`src/types/api.types.ts` mirrors the backend DTOs by hand, so a backend API change lands here
too. Nothing generates or diffs this file: `npm run typecheck` only checks the app against the
mirror, so a field the mirror never learned about type-checks green and arrives as `undefined` at
runtime. Reconcile against `openapi.yaml` when a DTO changes.
