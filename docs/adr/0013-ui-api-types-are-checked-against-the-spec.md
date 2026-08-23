# 0013 — The UI's API types are checked against `openapi.yaml`, not generated in place of it

**Status:** Accepted, implemented

## Context

`webhook-platform-ui/src/types/api.types.ts` was a 292-line hand-written mirror of the backend
DTOs. Nothing generated it and nothing diffed it, so backend/frontend type drift had no detector
at all.

`npm run typecheck` gates CI and looks like the safety net, but it checks the *app* against the
*mirror* — never the mirror against the backend. A renamed or retyped backend field produced a
green typecheck and a runtime `undefined`: the UI rendered a blank where a value used to be, or
sent a payload the backend rejected with a 400 that looked like user error.

The hard half was already solved. `openapi.yaml` is committed and semantically drift-checked
against springdoc by `OpenApiDriftIntegrationTest` (ADR-0009), so a trustworthy machine-readable
description of the backend was already sitting in the repo, unused by the frontend.

## Decision

Generate the schema, keep the mirror, and check one against the other.

- **`src/types/api.generated.ts`** — `openapi-typescript` output from the committed
  `openapi.yaml`, committed itself. `npm run types:generate` regenerates it;
  `scripts/check-types-drift.sh` (`make types-check`, and a step in CI's `Frontend Lint &
  Typecheck` job) fails when it is stale. Same pattern `openapi.yaml` itself already uses.
- **`src/types/api.types.ts`** — unchanged in role: still hand-written, still what the app
  imports.
- **`src/types/api.contract.ts`** — compile-time assertions that every mirrored interface is
  still assignable to its generated schema. `tsc --noEmit` already gates CI, so this is where a
  renamed field becomes a red build in the branch that renamed it.

**The mirror survives because measurement said so, not by default.** The proposal assumed the
mirror would be migrated away a slice at a time and deleted when empty. Generating once and
looking settled it the other way: springdoc marks nothing `required`, so *every* generated
property is optional. Consuming those types directly would put a null check on every field read
in the app — hundreds of them, none of which corresponds to a real possibility.

The conformance direction is mirror → spec, which allows the mirror to be *narrower* and forbids
it being wider. `CurrentUserResponse.role` is `'OWNER' | 'DEVELOPER' | 'VIEWER'` while the spec
also lists `API_KEY`, because an API key never signs in to the dashboard; that narrowing is
deliberate and stays. A mirror that said `string` where the spec says an enum would fail, which
is the useful direction — it has silently lost the enum.

## Consequences

- **A backend DTO change is now a three-step landing**: regenerate `openapi.yaml` on the backend
  side, `npm run types:generate` here, then fix what `api.contract.ts` reports.
- **Turning it on found three fields that were already wrong**, all in the shape this exists to
  catch: `AuthResponse.tokenType` and `.expiresIn` do not exist on the backend, and neither does
  `ProjectResponse.organizationId`. `AuthResponse` was also missing `refreshToken`. None were
  read by the app, so nothing had failed yet — which is exactly why nobody knew.
- **A field added to a DTO and never mirrored still goes unnoticed.** That is a smaller failure —
  a feature the UI does not use yet, rather than a value rendering as `undefined` — and catching
  it would mean requiring the mirror to be exhaustive, which it deliberately is not.
- **`api.generated.ts` is ~9900 lines of committed generated code.** It is type-only, so it emits
  no JavaScript and does not touch the coverage thresholds, but it is large in diffs. That is the
  intended trade: a field disappearing from the UI's view of the API deserves to show up in a
  diff.
- One more file must be regenerated at release time or CI goes red — the same failure mode as
  `openapi.yaml`, with the same one-command fix.

## Alternatives rejected

- **Adopt the generated types directly and delete the mirror.** The optionality gap above. Not
  a matter of taste: it is a null check per field read, app-wide.
- **A hand-written narrowing layer over the generated types** (`Required<Pick<…>>` per DTO)
  instead of the mirror. That *is* the mirror, with worse ergonomics and the same need for a
  drift story.
- **`orval` instead of `openapi-typescript`.** Also generates the client layer, which would
  collide with the hand-written `src/api/*.api.ts` wrappers and the refresh-on-401 behaviour in
  `http.ts` that they exist to route through.
- **Generate from a running server rather than the committed spec.** Makes the frontend build
  depend on the API being up, for no gain — the spec is already drift-checked.
- **Generate at build time instead of committing the output.** Hides the change from review.

## Related

- ADR-0009 — `openapi.yaml` is committed and drift-checked; this extends its guarantee to the UI
