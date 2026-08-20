# P0-09 — Any registered user can rotate every tenant's encryption keys

- **Status:** DONE
- **Priority:** P0 — platform-wide denial of service
- **Branch:** `feature/P0-09-encryption-admin-authz`
- **Depends on:** nothing
- **Module:** `webhook-platform-api`

## The defect

`EncryptionAdminController.java:38` gates the rotate endpoint on
`auth.requireOwnerAccess()`. That resolves to:

`security/RbacUtil.java`
```java
public static void requireOwnerAccess(MembershipRole role) {
    if (role != MembershipRole.OWNER) {
        throw new ForbiddenException("Only owners can perform this action");
    }
}
```
A pure role check with **no organization context**. And `AuthService.register`
makes every self-registering user `MembershipRole.OWNER` of their own new org
(verified around lines 95-108).

The operation itself is cluster-wide — `EncryptionKeyRotationService` lines
103, 171, 211 all use `findAll(PageRequest…)` with **no organization predicate**,
re-encrypting every tenant's endpoint signing secrets and provider HMAC secrets.

**Exploit:** anyone who signs up on a shared instance can
`POST /api/v1/admin/encryption/rotate` and force a full-table re-encryption of
all tenants' secrets. Partial failure is tolerated (`result.errors()`), so a
half-failed rotation leaves other tenants' secrets undecryptable → platform-wide
delivery outage. `GET /status` additionally leaks the deployment's active key
version to any registered user.

## Steps

- [x] Reproduce first: register a fresh user, call the rotate endpoint, watch it
      succeed. **This is the whole bug in one request.**
- [x] Recognise the category: these are **operator** endpoints, not tenant
      endpoints. `MembershipRole.OWNER` is the wrong axis entirely.
- [x] Pick a mechanism and implement it. Options, in rough order of preference:
      a dedicated platform-admin authority independent of org membership; or
      binding these routes to the management port / an operator credential
      separate from user auth. State the choice and reasoning in the log.
- [x] Apply to **both** `/rotate` and `/status` — the status leak is smaller but
      it is the same authorization mistake.
- [x] Sweep for the same pattern elsewhere:
      `grep -rn "requireOwnerAccess" webhook-platform-api/src/main/java`
      and for each hit decide whether it is genuinely org-scoped or is another
      platform-global operation wearing tenant clothes. Record the list.
- [x] While here: partial rotation failure leaving secrets undecryptable is its
      own hazard. At minimum make it loudly observable (counter + non-200);
      note in the log if a proper transactional/resumable design is needed later.

## Tests to write

`EncryptionAdminRbacTest.java` (RbacTest suffix → Docker CI job):

- a plain registered user (OWNER of their own org) gets 403 on `/rotate` and `/status`;
- a platform admin (however you modelled it) gets 200;
- rotation still works end-to-end for the authorised principal — extend the
  existing `EncryptionKeyRotationServiceTest` rather than duplicating it.

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest=EncryptionAdminRbacTest        # needs Docker
mvn test -pl webhook-platform-api -Dtest=EncryptionKeyRotationServiceTest
```

Manual:
```bash
make up && make wait-healthy
# register a normal user, obtain JWT, POST /api/v1/admin/encryption/rotate
# expect 403
```

## Definition of done

- [x] Rotation and status are unreachable by ordinary tenant users.
- [x] The `requireOwnerAccess` sweep is done and its findings listed in the log.
- [x] Existing rotation tests still pass for the authorised path.

## Progress log

**Reproduction (before fixing).** Registered a fresh user via
`POST /api/v1/auth/register` (making them `MembershipRole.OWNER` of their own
new org, per `AuthService.register`), then called
`POST /api/v1/admin/encryption/rotate` with their JWT. Confirmed via a real
MockMvc/Testcontainers run against the unmodified controller: **HTTP 200**,
rotation executed
(`RotationResult[targetVersion=1, endpointsRotated=0, ..., errors=0]`).
Concretely: `git stash push` on just `EncryptionAdminController.java` +
`SecurityConfig.java` (keeping the new test), ran
`EncryptionAdminRbacTest#plainUserForbiddenOnRotate` — it failed with
`Status expected:<403> but was:<200>`, i.e. the plain OWNER-of-their-own-org
user reached and completed a cluster-wide rotation. `git stash pop` restored
the fix, after which the same test passes. This is the exploit from the task,
confirmed live, not just read from the source.

**Mechanism chosen: a dedicated platform-admin operator credential, decoupled
from any user/org auth — not a "platform-admin authority on a user account".**

Concretely:
- `PlatformAdminAuthenticationFilter` (new) reads `X-Platform-Admin-Token`
  and, on a constant-time (`MessageDigest.isEqual`) match against
  `platform.admin.token` (env `PLATFORM_ADMIN_TOKEN`), installs a
  `PlatformAdminAuthenticationToken` (new) carrying only the `PLATFORM_ADMIN`
  authority — principal is a fixed `"platform-admin"` string, no user id, no
  org id.
- `SecurityConfig` now requires `.requestMatchers("/api/v1/admin/**").hasAuthority("PLATFORM_ADMIN")`,
  matched *before* the generic `authenticated()` rules, and registers the new
  filter alongside the JWT/API-key filters.
- `JwtAuthenticationToken` / `ApiKeyAuthenticationToken` are constructed with
  `Collections.emptyList()` authorities (confirmed by reading both), so no
  tenant JWT or API key can ever satisfy `hasAuthority("PLATFORM_ADMIN")` —
  there is no code path from "OWNER of org X" to this authority.
- `EncryptionAdminController` no longer takes an `AuthContext` param or calls
  `requireOwnerAccess()` at all; authorization is enforced entirely by
  `SecurityConfig` before the request reaches the controller.
- Fail-closed by design: if `PLATFORM_ADMIN_TOKEN` is unset/blank (the
  `.env.dist` default), the filter never authenticates anyone, so the admin
  endpoints are unreachable by construction until an operator explicitly sets
  the secret. Documented in `.env.dist`, wired through `docker-compose.yml`
  (`PLATFORM_ADMIN_TOKEN: ${PLATFORM_ADMIN_TOKEN:-}` — optional, unlike
  `JWT_SECRET`/`WEBHOOK_ENCRYPTION_KEY` which are `:?...must be set`) and
  `application.yml` (`platform.admin.token: ${PLATFORM_ADMIN_TOKEN:}`).

**Why this over the other two options in the task:**
- *Dedicated platform-admin authority on the existing JWT/membership model*
  would mean adding a role/flag to `User`/`MembershipRole` and threading it
  through registration, JWT claims (`JwtAuthenticationFilter` currently reads
  `organizationId` + `role` straight off the token — an operator flag would
  have to ride along or fork into a second token type), login, and
  `AuthContext`. That's a materially bigger, riskier change (schema
  migration, JWT shape change, more surface for the same class of bug to
  reappear) for a handful of operator-only endpoints, and it still couples
  "I am a cluster operator" to "I am a registered tenant user," which is the
  wrong coupling per the task's own diagnosis.
- *Binding to a separate management port* isn't available cheaply here:
  actuator already runs on the *same* port as the app (`/actuator/**` is
  matched inside the single `SecurityConfig` chain, `application.yml` has no
  `management.server.port`), so "bind to the management port" would first
  require standing up a second port/listener — new infrastructure, not a
  reuse of something that exists.
- An independent shared-secret header is the smallest change that fully
  satisfies "independent of org membership," is fail-closed by default, and
  mirrors an existing pattern in this codebase (constant-time secret
  comparison — see `WebhookSignatureUtils.constantTimeEquals`,
  `GitHubVerifier`/`StripeVerifier`/`SlackVerifier`/`ShopifyVerifier`/`GenericHmacVerifier`
  all use `MessageDigest.isEqual` for HMAC checks). Documented as a Swagger
  security scheme (`platformAdminToken` in `OpenApiConfig`) so this isn't a
  hidden/undocumented backdoor.
- Left for a follow-up (not done here, out of scope for this task): a
  production-safety check (`ProductionSafetyValidator`) that warns/fails if
  `PLATFORM_ADMIN_TOKEN` is a placeholder in `APP_ENV=production`. Skipped
  deliberately — failing startup on a *missing* value would be safe (endpoint
  stays disabled) but I did not want to add an untested hard-fail path to
  `ProductionSafetyValidator` in this change; flagging for whoever picks this
  up next.

**`requireOwnerAccess` sweep** (`grep -rn "requireOwnerAccess" webhook-platform-api/src/main/java`):

| File:line | Scoped to | Verdict |
|---|---|---|
| `EncryptionAdminController.java:38,72` | nothing — cluster-wide `EncryptionKeyRotationService.findAll()` | **Wrong axis — fixed in this task** |
| `BillingController.java:96,111,167,180,188` | all five calls read `auth.organizationId()` from the same request's JWT and act only on that org (`billingService.assignPlan(auth.organizationId(), ...)`, `.createCheckoutSession(auth.organizationId(), ...)`, etc.) | Genuinely org-scoped — OWNER-of-my-own-org is exactly the right check for "can I change my own org's plan/billing." No change needed. |
| `OrganizationController.java:62` (`PUT /{orgId}`) | `organizationService.updateOrganization(orgId, auth.organizationId(), ...)` — service throws `ForbiddenException` if `orgId != auth.organizationId()` | Correctly org-scoped once combined with the service-layer path-vs-token check. Note: unlike `.../export` and the `DELETE`, this handler has no *explicit* `if (!orgId.equals(auth.organizationId()))` guard directly in the controller before calling the service — it relies on `OrganizationService.updateOrganization` doing it. Functionally correct today (verified the service check exists), but it's an inconsistency worth tightening in a follow-up so all three org-scoped handlers guard the same way at the same layer. Not a `requireOwnerAccess`-axis bug, so left alone here. |
| `OrganizationController.java:78` (`GET /{orgId}/export`) | explicit `if (!orgId.equals(auth.organizationId())) throw Forbidden` right after `requireOwnerAccess()` | Genuinely org-scoped. No change needed. |
| `OrganizationController.java:98` (`DELETE /{orgId}`) | same explicit guard pattern as export | Genuinely org-scoped. No change needed. |

Conclusion: **`EncryptionAdminController` was the only misuse** of
`requireOwnerAccess()` as a stand-in for a platform-operator check. Every
other call site is legitimately asking "is this JWT's user OWNER of the org
this same JWT is scoped to," which is what the helper is for.

**Partial-rotation-failure observability.** `EncryptionKeyRotationService`
now takes a `MeterRegistry` and registers
`encryption_rotation_partial_failures_total` (a `Counter`, incremented by
`result.errors()` — not just a boolean flag — each time `rotateAll()`
finishes with `errors() > 0`), plus an `ERROR`-level log with the count and
target version. `EncryptionAdminController.rotateEncryptionKeys()` now
returns **HTTP 207 (Multi-Status)** instead of 200 when `errors() > 0` (200
is reserved for a clean rotation); 409 for lock conflicts is unchanged. A
proper transactional/resumable rotation (e.g. retry only the failed rows, or
abort-and-rollback the whole run) is *not* implemented — flagging as a
follow-up, since fixing that changes `EncryptionKeyRotationService`'s
core batching/error-handling design (currently: continue past failures,
report a count) and is out of scope for an authz task.

**Files changed:**
- `webhook-platform-api/src/main/java/com/webhook/platform/api/security/PlatformAdminAuthenticationToken.java` (new)
- `webhook-platform-api/src/main/java/com/webhook/platform/api/security/PlatformAdminAuthenticationFilter.java` (new)
- `webhook-platform-api/src/main/java/com/webhook/platform/api/config/SecurityConfig.java`
- `webhook-platform-api/src/main/java/com/webhook/platform/api/config/OpenApiConfig.java` (Swagger security scheme)
- `webhook-platform-api/src/main/java/com/webhook/platform/api/controller/EncryptionAdminController.java`
- `webhook-platform-api/src/main/java/com/webhook/platform/api/service/EncryptionKeyRotationService.java`
- `webhook-platform-api/src/main/resources/application.yml`
- `.env.dist`, `docker-compose.yml`
- `webhook-platform-api/src/test/java/com/webhook/platform/api/AbstractIntegrationTest.java` (adds
  `platform.admin.token` test property + shared `PLATFORM_ADMIN_TEST_TOKEN`)
- `webhook-platform-api/src/test/java/com/webhook/platform/api/EncryptionAdminRbacTest.java` (new)
- `webhook-platform-api/src/test/java/com/webhook/platform/api/service/EncryptionKeyRotationServiceTest.java`
  (constructor now takes `MeterRegistry`; added
  `partialFailureIncrementsCounter` test)

**Test output.**

`mvn test -pl webhook-platform-api -Dtest=EncryptionAdminRbacTest -DfailIfNoTests=false`:
```
Tests run: 7, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```
Covers: plain OWNER-of-own-org gets 403 on `/rotate` and on `/status`;
fully unauthenticated gets 4xx on both; a wrong admin token is rejected the
same as no token; platform admin gets 200 on `/status`; platform admin gets
200 on `/rotate` and it runs end-to-end for real (real Postgres via
Testcontainers, real ShedLock lock acquisition, real
`EncryptionKeyRotationService`, no mocks) without ever presenting a JWT; and
an OWNER's valid JWT plus a *wrong* admin-token header still gets 403 (no
privilege stacking between the two auth mechanisms).

`mvn test -pl webhook-platform-api -Dtest=EncryptionKeyRotationServiceTest -DfailIfNoTests=false`:
```
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```
**Caveat found while verifying, unrelated to this task's fix:** this repo's
pinned `maven-surefire-plugin:2.22.2` only picks up the one `@Test` directly
on `EncryptionKeyRotationServiceTest` when filtered by bare class name —
it silently skips every `@Nested` class's tests (9 of the file's 10 `@Test`
methods, including the new `partialFailureIncrementsCounter`). Confirmed by
running with the nested-class pattern instead:
`mvn test -pl webhook-platform-api -Dtest='EncryptionKeyRotationServiceTest,EncryptionKeyRotationServiceTest$*' -DfailIfNoTests=false`
→ `Tests run: 10, Failures: 0, Errors: 0, Skipped: 0, BUILD SUCCESS`. All 10
pass, including the new counter test. Pasting both outputs here since the
literal command from this task's Verification block is misleading on its
own — noting this as a pre-existing tooling gap (not introduced by this
change; CI's full-suite invocation isn't filtered by single class name so it
isn't affected) worth a follow-up ticket against the surefire config.

**Regression check beyond the task's own verification block.** Since
`SecurityConfig` is shared infrastructure for every authenticated route, ran
the full Docker-backed RBAC/integration suite for the module:
`mvn test -pl webhook-platform-api -Dtest='*RbacTest,*IntegrationTest' -DfailIfNoTests=false`
→ `Tests run: 148 (across all matching classes), 3 failures`, all three in
`AuthContextIntegrationTest` (`apiKey_auditLog_forbidden`,
`apiKey_auditLogExport_forbidden`, `jwt_auditLog`, all `/api/v1/audit-log*`,
expecting 403/200 but getting 400). Verified these are **pre-existing and
unrelated**: re-ran `AuthContextIntegrationTest` alone with this task's
changes fully stashed (back to the `develop` merge-base) — same 3 failures,
same assertions, same line numbers. Not touched by this change; not fixed
here (out of scope — audit-log feature, not encryption admin authz).
`EncryptionAdminRbacTest` itself was part of this `*RbacTest,*IntegrationTest`
run too and passed within it.

**Manual verification:** skipped per instructions — the `make up` /
docker-compose stack step uses fixed host ports and other agents may be
running it concurrently in sibling worktrees. Left for the coordinator to
run centrally: register a normal user, obtain a JWT, `POST
/api/v1/admin/encryption/rotate` with that JWT only → expect 403; repeat with
`X-Platform-Admin-Token: $PLATFORM_ADMIN_TOKEN` (once set in `.env`) → expect
200.

**Left incomplete / deliberately deferred (all called out above too):**
1. `ProductionSafetyValidator` doesn't yet flag a missing/placeholder
   `PLATFORM_ADMIN_TOKEN` in production — safe by default (fail-closed), but
   not actively alerted on at startup.
2. `OrganizationController.updateOrganization`'s org-match check lives only
   in the service layer, not mirrored in the controller like its sibling
   endpoints — inconsistent, not incorrect; found during the sweep, not
   fixed (different bug class than this task's).
3. Rotation partial failures are now loudly observable (counter + 207) but
   still not transactional/resumable — a half-failed rotation still leaves
   some rows on the old key version; a real fix needs a redesign of
   `EncryptionKeyRotationService`'s batching, tracked as a follow-up.
4. The `maven-surefire-plugin:2.22.2` nested-class filtering gap noted above
   is a pre-existing repo-wide tooling issue, not fixed here.
