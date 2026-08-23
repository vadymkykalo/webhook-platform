# 0015 — `@RequireAccess` is both the declaration and the enforcement; the imperative call stays

**Status:** Accepted, implemented

## Context

Every guarded handler in this codebase says who may call it twice:

```java
@RequireAccess(AccessLevel.WRITE)          // read by ScopeEnforcementInterceptor
@PostMapping
public ResponseEntity<X> create(..., AuthContext auth) {
    auth.requireWriteAccess();             // the same question, asked again
```

`CLAUDE.md` called the second one "defence in depth", which sounded right and was never checked.
Counting says the two are not two opinions:

```bash
C=webhook-platform-api/src/main/java/com/webhook/platform/api/controller
grep -rho '@RequireAccess' $C | wc -l                                # 80
grep -rho 'requireWriteAccess()\|requireOwnerAccess()' $C | wc -l    # 80
```

Of 175 handlers: **80 carry both, 0 carry the annotation alone, 0 carry the imperative call
alone** (one did — see Consequences), and 95 carry neither, being reads or one of the 24
documented exemptions in `MutatingHandlerScopeDeclarationTest`.

Two things follow, and they point in opposite directions.

**They cannot disagree about meaning.** `ScopeEnforcementInterceptor.enforceAccessLevel` calls
the same `RbacUtil.requireWriteAccess` / `requireOwnerAccess` that `AuthContext` calls. There is
one implementation of "what WRITE means" and both roads lead to it. So the imperative call adds
no second opinion — only a second chance to run.

**They can disagree about running, and did.** The interceptor is registered on `/api/**` and
nothing else, and until this ADR it *returned silently* for any authentication it could not map
to a membership role — a platform-admin token, or none at all. A test asserted that
pass-through, with the reason that running `RbacUtil` against a platform admin would reject the
one caller `/api/v1/admin/**` exists for.

That reason does not survive inspection. **No handler under `/api/v1/admin/**` carries
`@RequireAccess`** — `EncryptionAdminController` is gated on the `PLATFORM_ADMIN` authority in
`SecurityConfig` and takes no `AuthContext`. So the pass-through never protected an admin
endpoint. What it actually covered was a platform-admin token aimed at a *tenant* handler, and
there the request was refused anyway — one step later, by `AuthContextArgumentResolver`, which
throws `UnauthorizedException` for any authentication that is neither a JWT nor an API key.

Which is the finding this ADR turns on:

> The imperative call was not what closed that gap. The **`AuthContext` parameter it needs** was.
> All 80 annotated handlers happen to take one; a handler that did not would have been reachable
> by a platform-admin token while looking annotated and guarded.

Delete the 80 imperative calls and a reasonable next reviewer deletes the now-unused parameter
with them. The check would still read as present, and the hole would open silently — the exact
failure mode ADR-0006 was written about.

There is also a **third** form, and it is not redundant with either: `MembershipService` checks
`requestingRole != MembershipRole.OWNER` by hand at three sites. That asks a different question —
the caller's role *in the target organization*, looked up from the database — where the
annotation can only see the role the token carries. `AuthContext.requireJwt()` (9 sites) is a
fourth, asking "not an API key", which is orthogonal to level.

## Decision

**`@RequireAccess` is the declaration and the enforcement.** Make it total rather than
near-total, and leave the imperative calls where they are.

1. **The interceptor fails closed.** An authentication that cannot be mapped to a membership role
   is now refused when a level above READ is declared, instead of passing through. This reverses
   the tested decision described above; the reason it is safe is that no admin handler declares a
   level, so the reversal cannot reach the caller the pass-through was protecting.
2. **`AccessLevelInterceptorCoverageTest`** (a ratchet) asserts every `@RequireAccess` handler is
   mapped under `/api/`, the one prefix `WebConfig` registers the interceptor on. An annotation
   outside it is decoration, and `MutatingHandlerAccessDeclarationTest` would happily count it as
   a declaration.
3. **The 80 imperative calls stay.** They are redundant *as checks* and the codebase is better
   with them than with the diff that removes them: a large change on the authorization path,
   buying tidiness, whose main risk is that the `AuthContext` parameter goes too.
4. **Service-layer role checks stay and are not the same question.** Nothing here asks
   `MembershipService` to change.

The rule for a new handler: write the annotation, and copy the imperative call from its
neighbours. Do not start a campaign in either direction.

## Consequences

- **A platform-admin token now gets 403 instead of 401** on a tenant handler that declares a
  level. It was refused either way; the refusal moves earlier and stops depending on the handler's
  signature. `/api/v1/admin/**` is unaffected — proved by a test, not by argument.
- **`OrganizationController.exportOrganizationData` gained the annotation it was missing.** It was
  the one handler with the imperative call and no declaration: a GET returning every member,
  project, endpoint and audit row in the organization, OWNER-only by an imperative call alone,
  while its sibling `deleteOrganization` declared it. Reads are not ratcheted and cannot sensibly
  be — most legitimately require nothing — so this one was found by counting, which is the argument
  for counting.
- **The duplication remains, and is now explained rather than justified.** Anyone who notices it
  next finds this file instead of re-deriving the analysis.
- **The residual risk is the `/api/**` registration**, now a ratchet rather than a coincidence. If
  an authenticated controller is ever mapped elsewhere, the build says so.
- Nothing changes for JWT or API-key callers, which is every real caller of these endpoints.

## Alternatives rejected

- **Delete the imperative calls; the annotation is enough.** The tempting one. Rejected because
  the parameter goes with them — see Context. Reconsider only if `AuthContext` becomes mandatory
  by some other means, or if the resolver stops being the thing that rejects a roleless caller.
- **Delete the annotation; the imperative call is enough.** This is the pre-ADR-0006 state, and
  three handlers shipped reachable by a `VIEWER` because of it — one returning a real HMAC
  signature, another firing a signed outbound request. The annotation is the half a reviewer can
  see and a ratchet can count.
- **Have the interceptor implement its own role logic** rather than calling `RbacUtil`. Two
  implementations of "what WRITE means" is two things to keep in step, for no gain.
- **Fold the service-layer owner checks into the annotation.** It cannot express them: the role
  in the *target* organization is a database lookup, not a token claim.
- **Keep the platform-admin pass-through and add the coverage ratchet only.** Leaves the guard
  depending on all 80 handlers keeping a parameter for an unrelated reason. That is the kind of
  invariant this repository has been converting into checks, not adding.

## Related

- ADR-0006 — layered authorization; this is the authorization-side counterpart of the tenancy
  question it settled
- ADR-0012 — the tenancy invariants given guards; same argument, different invariant
- `AccessLevelEnforcementTest` — proves the interceptor enforces the annotation
- `AccessLevelInterceptorCoverageTest` — proves the interceptor is reached
