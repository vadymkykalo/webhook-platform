# CLAUDE.md — webhook-platform-ui

`src/api/*.api.ts` are thin wrappers over the shared `src/api/http.ts` axios client, which owns the bearer token and does automatic refresh-on-401 with request queueing — call the API through these wrappers rather than importing axios directly, or a 401 won't be retried.

TanStack Query keys are centralized in `src/api/queries.ts`; add new keys there instead of inlining string arrays at call sites.
