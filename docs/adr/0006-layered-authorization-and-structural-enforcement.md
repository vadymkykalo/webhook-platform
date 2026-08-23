# 0006 — Authorization is layered, and tenancy confinement moves from opt-in calls to structural enforcement

**Status:** Accepted

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
3. **Role is declared at the route.** `@RequireAccess(AccessLevel)` states what a handler
   requires; `ScopeEnforcementInterceptor` enforces it before the handler runs, for JWT and
   API-key callers alike. 79 mutating handlers carry it (72 WRITE, 7 OWNER), derived from the
   imperative calls they already made. `MutatingHandlerAccessDeclarationTest` fails the build
   on a new one that declares nothing and is not a documented exemption.

   The level is `READ | WRITE | OWNER`, deliberately not "the minimum `MembershipRole`": the
   four roles are not a line. OWNER, DEVELOPER and VIEWER order naturally, but API_KEY sits
   outside that order — a key is neither above nor below a Viewer, it is a different kind of
   caller whose permissions come from its scope. A minimum-role annotation would have had to
   invent a position for it.

   The interceptor calls the same `RbacUtil` the handlers do rather than reimplementing what
   write access means, and the handlers keep their imperative calls as defence in depth.

4. **Org ownership is a property of data access, not a parameter.** A request-scoped
   `TenantContext` says which organization the current thread may see; Hibernate's `@TenantId`
   on 40 entities adds `organization_id = <current tenant>` to every query built from them —
   derived queries, JPQL, and `find()` by primary key alike. `organizationId` left 174 of the
   187 service signatures that carried it, and `validateProjectOwnership` shrank to a single
   `findById` whose only remaining job is turning "not in this tenant" into a 404.

   The three checks above are declarations a handler can be audited for. This one is not a
   declaration at all: there is nothing to write, and nothing to forget.

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

## How the tenant scope is established

Four kinds of caller, and every one of them says which it is:

| Caller | Scope | Set by |
|---|---|---|
| JWT | the organization in the token | `TenantContextFilter` |
| API key | the organization owning the key's project | `TenantContextFilter`, from the token the auth filter built |
| Platform admin | root — sees every organization | `TenantContextFilter` |
| Scheduler, Kafka consumer, WebSocket | root | `@SystemTenant` on the method (28 of them), a decorator for the WebSocket handler |
| Public path (`/ingress`, `/tunnel`, `/hook`, billing webhook) | the organization discovered from the URL's token or slug | `TenantContext.runAs(...)` in the service, after a system-scoped lookup |

**Root, not a sentinel.** Hibernate 6's `CurrentTenantIdentifierResolver.isRoot` suppresses the
predicate entirely, which is what "system" has to mean. A sentinel organization id would have
filtered every background query down to zero rows — the same bug as a missing filter, silent in
the other direction.

**No scope at all is a failure.** `TenantNotResolvedException`, not a default. Both plausible
defaults are wrong: a sentinel breaks system work, and "no filter" is exactly the opt-in default
this ADR exists to remove. An uncovered path shows up as a 500 in a test run rather than as a
cross-tenant read in production.

**Writing under root still needs care.** Hibernate takes the `@TenantId` property's value if one
is set and the tenant is root, and otherwise stamps the current tenant over it; under a real
tenant, setting a *different* organization is a `PropertyValueException` rather than a silent
cross-tenant write. So system-scoped code that inserts tenant-scoped rows sets `organizationId`
itself — `AuthService.register` does, on the Membership it creates.

## Consequences of the tenancy half

- **Three things had to change that are not obviously about tenancy**, and each one is the kind
  of detail that would otherwise be rediscovered painfully:
  - **Open Session In View is off.** OSIV opens an `EntityManager` in a `HandlerInterceptor`
    before the handler runs — before a public path has had any chance to discover which
    organization it belongs to. Every unauthenticated request 500s with it on. Its removal cost
    one fetch-join (`OrganizationRepository.findByIdWithPlan`), because a lazy `Plan` proxy
    cached and handed to a handler can no longer initialise itself.
  - **A tenant scope must be entered outside the transaction**, not inside it. Hibernate reads
    the tenant when it opens a session, so a scope entered within an existing transaction arrives
    too late and the row is stamped with whatever scope the transaction began in.
    `TestEndpointService.captureRequest` and `IngressService.receiveWebhook` both enter the scope
    first and open a transaction within it.
  - **Startup has a grace window.** Spring Data builds and validates repository queries while the
    context comes up, on a thread with no scope. During that window an unset scope resolves to
    root; `ApplicationReadyEvent` closes it. The flag lives on the resolver bean, not in a static,
    because a test JVM runs several application contexts.
- **Another organization's resource is a 404, not a 403.** The tenant's queries never see the row,
  so there is nothing to compare and forbid. This is an improvement rather than a regression: the
  old 403 confirmed that an id the caller had no access to existed.
- **Native queries are outside the guarantee.** Hibernate's discriminator is applied when it
  builds SQL; a `nativeQuery = true` method supplies its own. Of the 38 in the api, 15 that are
  reachable from a request now carry an explicit `organization_id = :organizationId` predicate,
  and the rest are system paths — outbox and retry claims, retention deletes, table-size
  estimates, sequence reconciliation — that are meant to cross tenants. The rule is stated in the
  repository package's `package-info.java`; adding a native query means deciding which kind it is.
- **The worker maps the column but does not filter on it.** It has no `AuthContext` and every
  consumer is a system path, but it inserts `delivery_attempts` and `incoming_forward_attempts`
  rows, so it carries the tenant across from the parent row. Mapping it on both sides also keeps
  `EntityMappingParityIntegrationTest` satisfied without a new exemption (ADR-0002).
- **Thirteen public service methods still take an organization**, each because the organization
  comes off a *row being processed* rather than off the caller: the plan cache keyed by
  organization, the billing schedulers walking many organizations, `acceptInvite` (whose invitee
  is authenticated into a *different* organization from the one they are joining), and the
  outbound payment-provider calls. `ServiceTenantParameterTest` freezes that list.
- **`organization_id` is denormalised onto 31 tables, `NOT NULL` from the start.** The usual
  reason to defer the constraint — a rolling deploy where instances predating the column are still
  inserting rows — does not apply, because there is no production deployment yet: no old writer to
  break, and no accumulated data to backfill. Shipping the column nullable would have meant
  carrying a half-applied invariant and a note to tighten it later.

  It paid for itself immediately: `NOT NULL` failed eight test fixtures that insert rows straight
  through JDBC, bypassing the mapping that stamps the tenant. Every one of them was a row that
  would have belonged to nobody. That is the class of bug the constraint exists to catch, and
  without it they would have been silent.

  `V056` is still not an instant migration for anyone who has data: `delivery_attempts` and
  `tunnel_request_log` are partitioned and the ALTER cascades to every partition.

## The ratchets

Three now, one per check that could be omitted:

- `MutatingHandlerScopeDeclarationTest` — API-key scope.
- `MutatingHandlerAccessDeclarationTest` — role.
- `ServiceTenantParameterTest` — no public service method takes an organization, outside a frozen
  exemption list. Reflection, a vacuity guard, and a second test that fails when an exemption goes
  stale.

`CrossTenantIsolationTest` is the other half of the last one: reflection proves the parameter is
gone, and that test proves the filter actually confines rows — two organizations, a real database,
and the six behaviours that matter (find-by-id, derived queries, root scope, insert stamping,
refusal to write across tenants, and failure when unscoped).

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
- **Postgres row-level security** instead of a Hibernate discriminator. It would enforce the
  same rule one layer lower and survive native queries, which is a real advantage. Rejected
  because the session variable it keys on has to be set on the pooled connection rather than on
  the Hibernate session, which puts the correctness of every request in the hands of connection
  checkout ordering — a worse failure mode than the one native queries leave, and much harder to
  test. Worth revisiting if native queries multiply.
- **Keeping `organizationId` as a parameter but making the check mandatory** — a base class, or
  an aspect asserting that `validateProjectOwnership` ran. Both leave the parameter, so both
  leave the caller choosing which organization to pass; the aspect would have checked that *a*
  call happened, not that it named the right one.

## Follow-up

Three of the invariants above were enforced by prose alone and were each violated at least once
afterwards. [ADR-0012](0012-tenancy-invariants-are-guarded-not-documented.md) gives them checks;
it finishes this decision rather than reopening it.

[ADR-0015](0015-requireaccess-is-the-declaration-and-the-enforcement.md) does the same on the
authorization side: it settles what the declarative and imperative RBAC checks are each for, and
makes `@RequireAccess` fail closed rather than pass through a caller it cannot map to a role.
