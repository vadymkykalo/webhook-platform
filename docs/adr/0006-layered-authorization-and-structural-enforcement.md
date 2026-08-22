# 0006 — Authorization is layered, and tenancy confinement moves from opt-in calls to structural enforcement

**Status:** Accepted, partially implemented

## Context

A request carries either a JWT (dashboard, CLI) or an `X-API-Key` (server-to-server). Both
resolve into one `AuthContext`, injected as a plain controller method parameter. Four
distinct questions then have to be answered, and historically each was answered in a
different place:

| Question | Where it was enforced | Default when the author forgot |
|---|---|---|
| Is the caller's role allowed to write? | `auth.requireWriteAccess()` in the handler body | **allow** |
| Does the API key's scope permit this? | `@RequireScope`, via `ScopeEnforcementInterceptor` | **allow** |
| Is this project inside the key's project? | `auth.validateProjectAccess(projectId)` in the handler body | **allow** |
| Is this project inside the caller's org? | `validateProjectOwnership(projectId, organizationId)` in the service, with `organizationId` threaded through ~186 method signatures | **allow** |

Every one of those defaults to allow, and none of them is visible at the seam a reviewer
reads — the route declaration. That is not a hypothetical: three handlers shipped
reachable by a `VIEWER` JWT and a `READ_ONLY` API key, including one that returned a real
HMAC signature computed with the endpoint's signing secret, and one that fired a signed
outbound request from the platform. About a third of `{projectId}` routes never called
`validateProjectAccess` at all.

## Decision

Keep the four checks distinct — they answer genuinely different questions and collapsing
them would make the coarsest one win. Change **where** they are answered, moving each from
an opt-in call to something a handler cannot silently omit:

1. **Project confinement is structural, and this is already implemented.**
   `ScopeEnforcementInterceptor.enforceProjectScope` compares the `{projectId}` in the
   resolved URI template against the API key's own project for *every* such route,
   whether or not the handler binds the variable or calls anything. Opting out requires
   an explicit `@ProjectScopeExempt`. Existing `validateProjectAccess` calls stay as
   defence in depth.
2. **Scope declaration is ratcheted.** `MutatingHandlerScopeDeclarationTest` reflects over
   every `POST`/`PUT`/`PATCH`/`DELETE` handler and fails the build if it declares no
   `@RequireScope` and is not in a frozen, individually-justified exemption set. The
   interceptor's runtime default stays *allow* for backward compatibility; the build-time
   default is now *deny*.
3. **Role and org-ownership checks remain in place** — `requireWriteAccess()` in handlers,
   `validateProjectOwnership` in services — and are **not yet** structural. This is the
   part of the decision still outstanding.

## Consequences

- The route declaration is becoming the place where authorization is legible. Three of the
  four questions can now be answered by reading the annotations; the role check still
  cannot.
- `MutatingHandlerScopeDeclarationTest`'s exemption list is a security surface. Adding an
  entry is a decision that has to state its reason, and the list is deliberately awkward
  to grow.
- The ratchet is build-time only. A handler annotated with a *too permissive* scope passes
  it. It catches omission, not misjudgement.
- ~186 service method signatures still carry `organizationId` as a parameter, and each
  body still has to call `validateProjectOwnership`. Every one of those is a place the
  check can be forgotten, and nothing catches it.

## Outstanding

Extend the structural approach to the two remaining checks:

- **Role**: require every mutating handler to declare its minimum role at the route (an
  annotation the same interceptor enforces), with the same build-time ratchet, so
  `requireWriteAccess()` becomes defence in depth rather than the only guard.
- **Org ownership**: make "an organization can only reach its own rows" a property of data
  access — a request-scoped tenant identity consulted by the repository layer — rather than
  a parameter threaded through every signature. Hibernate's `@TenantId` with a
  `CurrentTenantIdentifierResolver` is the natural fit and would delete the parameter from
  those 186 signatures.

## Alternatives rejected

- **Spring Security method-level `@PreAuthorize` SpEL.** Moves the check to the seam, but
  the expressions are strings evaluated at runtime — a typo is a silent allow, which is
  the failure mode this ADR exists to remove.
- **Deny-by-default at the interceptor for missing `@RequireScope`.** Correct in
  principle, and rejected only as a migration step: flipping it before every handler is
  annotated would break existing integrations. The build-time ratchet gets to the same
  place without a breaking release. Flip the runtime default once the exemption list is
  the complete set.
- **Hand-rolled org checks per endpoint.** Explicitly forbidden in `CLAUDE.md`; this ADR
  is why.
