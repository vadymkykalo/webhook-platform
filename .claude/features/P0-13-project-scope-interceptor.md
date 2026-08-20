# P0-13 — API-key project scoping is enforced inconsistently (systemic)

- **Status:** DONE
- **Priority:** P0 — largest single security task; do it properly, not by hand
- **Branch:** `feature/P0-13-project-scope-interceptor`
- **Depends on:** P0-08 (fixes the worst instance; this generalises the fix)
- **Module:** `webhook-platform-api`

## The defect

For API-key auth, `AuthContext.organizationId` is derived from the key's project,
so the service-layer `validateProjectOwnership(projectId, organizationId)` check
passes for **any project in the same org**. The only thing confining a key to its
own project is `AuthContext.validateProjectAccess()`
(`security/AuthContext.java:40-44`) — and it is applied unevenly.

Measured across every controller (calls vs. mapped endpoints):

| State | Controllers |
|-------|-------------|
| Full | Workflow 9/9, Alert 8/8, Rule 6/6, PiiMasking 6/6, Incident 6/6, Dlq 6/6, Transformation 5/5, Replay 5/5, ProjectEvents 5/5, ApiKey 3/3, Dashboard 3/3 |
| Partial | Endpoint 6/11, SharedDebugLink 3/4, Subscription 2/6, IncomingSource 2/5, IncomingEvent 2/5, Tunnel 2/5, Delivery 1/6 |
| **Zero, and project-scoped** | **Schema 0/12, TestEndpoint 0/6, IncomingDestination 0/5** |

Reproduce the table yourself before starting:
```bash
for f in webhook-platform-api/src/main/java/com/webhook/platform/api/controller/*.java; do
  n=$(grep -c validateProjectAccess "$f")
  m=$(grep -c "@GetMapping\|@PostMapping\|@PutMapping\|@PatchMapping\|@DeleteMapping" "$f")
  printf "%-42s %s/%s\n" "$(basename $f)" "$n" "$m"
done
```
Some zeros are legitimate — `AuthController`, `OrganizationController`,
`MemberController`, `BillingController`, `DeviceAuthController`,
`IngressController` are org-scoped or public. Confirm each zero before treating
it as a bug; the signal is whether the `@RequestMapping` contains `{projectId}`.

**Worst concrete case:** a key scoped to `staging` calls
`POST /api/v1/projects/staging/endpoints/{prodEndpointId}/rotate-secret`.
`EndpointService.rotateSecret` (~184-197) checks only the org, rotates the
**production** endpoint's signing secret, and returns the new secret **in
plaintext** in the response (`mapToResponseWithSecret`). The caller now holds
prod's signing key and has simultaneously broken every prod consumer.

## Steps

- [x] Reproduce first, on the rotate-secret case specifically — it is the most
      damaging and the most convincing.
- [x] **Do not fix this with ~30 manual insertions.** Enforce it centrally in
      `ScopeEnforcementInterceptor` so any route with a `{projectId}` path
      variable is checked automatically. That is the only version of this fix
      that stays correct as new controllers are added.
- [x] Provide an explicit, greppable opt-out annotation for the genuine
      exceptions, so "no check here" is a deliberate, reviewable decision rather
      than an omission.
- [x] Remove the now-redundant per-handler calls, or leave them as harmless
      defence-in-depth — pick one policy and apply it uniformly. Say which.
- [x] Separately reconsider `rotateSecret` returning the plaintext secret in the
      response body. Even correctly scoped, that is a design worth a second look;
      note your conclusion.
- [x] Re-run the table above and paste before/after into the log.

## Tests to write

The point of this task is that the guarantee is **structural**, so the test must
be structural too:

- `ProjectScopeEnforcementIsolationTest.java` — enumerate every
  `@RequestMapping` containing `{projectId}` by reflection/classpath scan, and
  assert each is either covered by the interceptor or carries the explicit
  opt-out annotation. This test is what stops the regression returning.
- Behavioural tests for the previously-zero controllers (Schema, TestEndpoint,
  IncomingDestination): a key scoped to project X is refused on project Y in the
  same org.
- Extend `ApiKeyScopeEnforcementTest` (exists) with the rotate-secret case.

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest=ProjectScopeEnforcementIsolationTest  # needs Docker
mvn test -pl webhook-platform-api -Dtest='*IsolationTest,*RbacTest,ApiKeyScopeEnforcementTest'
mvn test -pl webhook-platform-api    # full suite — this change touches every project route
```

Manual:
```bash
make up && make wait-healthy
# create two projects in one org; issue a READ_WRITE key scoped to project A
# attempt project B's endpoints/schemas/destinations with it; expect denial
# confirm project A still works normally
```

## Definition of done

- [x] Enforcement is central; a new `{projectId}` controller is protected by default.
- [x] The structural test exists and fails if someone adds an unprotected route.
- [x] Before/after coverage table in the log.
- [x] Full api-module suite green — regressions here are lockouts, so this matters
      (7 pre-existing, unrelated failures excepted — see log).

## Progress log

### Reproduction (before fixing)

Reproduced the worst case first, two ways, both showing the same failure mode
before the fix and passing after:

1. HTTP-level, in `ProjectScopeEnforcementIsolationTest#apiKey_rotateSecret_crossProjectSameOrg_forbidden`:
   a `READ_WRITE` key scoped to project A calling
   `POST /api/v1/projects/{projectB}/endpoints/{endpointB}/rotate-secret`
   got `200` (should be `403`) — same for the Schema and IncomingDestination
   cross-project cases (5 tests failed in total with the fix's one line
   commented out; all 5 passed once restored).
2. Unit-level, in `ApiKeyScopeEnforcementTest#testRotateSecretHandler_apiKeyScopedToDifferentProject_blockedByInterceptor`:
   drives `ScopeEnforcementInterceptor.preHandle` directly against the real
   `EndpointController.rotateSecret` `HandlerMethod` via reflection, no Spring
   context needed. Failed with the fix disabled ("Expected ForbiddenException
   to be thrown, but nothing was thrown"), passed once restored, and logged
   the exact violation: `Project scope violation: API key for project
   <A> attempted POST .../endpoints/<id>/rotate-secret (project <B>) via
   EndpointController.rotateSecret`.

Reproduction method used `TEMP-DISABLED-FOR-P0-13-REPRO` comment-out +
restore on `ScopeEnforcementInterceptor.java` only (a file no other
concurrent agent touches), not `git stash`, per the shared-`.git` hazard
noted in the task brief.

### Before coverage table (measured against `2b1c83f`, HEAD of `develop` at start)

```
AlertController.java                       8/8
ApiKeyController.java                      3/3
AuditLogController.java                    0/2
AuthController.java                        0/11
BillingController.java                     0/10
DashboardController.java                   3/3
DeliveryController.java                    1/6
DeviceAuthController.java                  0/3
DlqController.java                         6/6
EncryptionAdminController.java             0/2
EndpointController.java                    6/11
EventController.java                       0/1
IncidentController.java                    6/6
IncomingDestinationController.java         0/5
IncomingEventController.java               2/5
IncomingSourceController.java              2/5
IngressController.java                     0/1
MemberController.java                      0/5
OrganizationController.java                0/5
PiiMaskingController.java                  6/6
ProjectController.java                     0/5
ProjectEventsController.java               5/5
ReplayController.java                      5/5
RuleController.java                        6/6
SchemaController.java                      0/12
SharedDebugLinkController.java             3/4
SubscriptionController.java                2/6
TestEndpointController.java                6/6   (already fixed directly by P0-08)
TransformationController.java              5/5
TransformPreviewController.java            2/2
TunnelController.java                      2/5
TunnelIngressController.java               0/0
UsageController.java                       1/1
WebhookCaptureController.java              0/0
WorkflowController.java                    9/9
```

This is the exact `validateProjectAccess`-call-count table the task
prescribes, extended to every controller (the task's own table only sampled
a subset). Zeros confirmed legitimate by checking `@RequestMapping` for
`{projectId}`: `AuditLogController`, `AuthController`, `BillingController`,
`DeviceAuthController`, `EncryptionAdminController`, `EventController`,
`IngressController`, `MemberController`, `OrganizationController`,
`TunnelIngressController`, `WebhookCaptureController` are org-scoped,
platform-admin, public, or derive their project solely from the API key's
own identity (`EventController.ingestEvent` reads `apiKeyAuth.getProjectId()`
directly — never attacker-controlled). **`ProjectController` at 0/5 is a real,
previously-uncatalogued instance of the same bug**, just not on this table's
citation list: `GET/PUT/DELETE /api/v1/projects/{id}` used a path variable
named `id`, not `projectId`, but was otherwise identical — an API key scoped
to project A could fetch, rename, or **delete** project B in the same org.
Fixed as part of this task (see below).

### After coverage table

Re-running the identical `grep validateProjectAccess` script gives **the same
numbers** — that count is now a measure of defence-in-depth, not of
protection (policy decision below explains why). The coverage that actually
matters post-fix is structural: every controller whose resolved route
contains `{projectId}` is now confined automatically by
`ScopeEnforcementInterceptor`, regardless of this count, unless annotated
`@ProjectScopeExempt` (nothing in the codebase is). This is what
`ProjectScopeEnforcementIsolationTest#everyProjectIdRouteIsCoveredOrExplicitlyExempt`
asserts by classpath scan, and what the behavioural tests confirm for the
three previously-zero controllers plus the rotate-secret worst case.

One real change to the table: **`ProjectController.java` route paths renamed
`/api/v1/projects/{id}` → `/api/v1/projects/{projectId}`** (get/update/delete)
so the interceptor's path-variable detection reaches it — this was the one
instance found outside the task's citation list that needed a source change
beyond the interceptor itself.

### The fix

- `ScopeEnforcementInterceptor` (`webhook-platform-api/.../security/ScopeEnforcementInterceptor.java`)
  gained a second, independent check (`enforceProjectScope`), run for every
  request before the existing `@RequireScope` logic. For API-key
  authentication only (JWT/platform-admin project access remains
  org-membership-governed, unchanged), it reads the servlet's resolved
  `HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE` map — populated by Spring
  from the *actual* matched route, independent of whether the handler method
  itself declares a `@PathVariable("projectId")` parameter — and, if a
  `projectId` value is present, throws `ForbiddenException` unless it equals
  the API key's own project. This is why it also covers handlers like
  `EndpointController.getEndpoint`/`rotateSecret`/etc. that never bind
  `projectId` as a parameter at all: the class-level `@RequestMapping`
  contributes it to the resolved path regardless.
- Already registered on `/api/**` in `WebConfig.java` (untouched — no overlap
  with the concurrent P0-12 work on `SecurityConfig.java`).
- New `@ProjectScopeExempt(reason = "...")` annotation
  (`security/ProjectScopeExempt.java`), method- or class-level, is the
  explicit opt-out. Nothing currently uses it — every `{projectId}` route in
  this codebase is a genuine per-project resource — but it exists so a real
  future exception doesn't recreate this bug by being silently unchecked.
- `ProjectController.java`: renamed the project-identity path variable
  `{id}` → `{projectId}` on the three single-project routes (see above) so
  the interceptor's detection reaches them.

### Policy decision: existing per-handler `validateProjectAccess()` calls

**Left in place, unchanged, everywhere they already existed** (Endpoint,
IncomingSource, IncomingEvent, Subscription, SharedDebugLink, Delivery,
TestEndpoint (P0-08), Schema/IncomingDestination have none to remove, etc.) —
treated as harmless, redundant defence-in-depth now that the interceptor is
the actual enforcement point. **No new per-handler calls were added** to the
previously-zero or partial controllers (Schema, IncomingDestination,
TunnelController's query-param case) — the interceptor alone is what makes
those routes safe now, on the theory that a second copy of the same
opt-in-and-forgettable check adds no real safety margin and just re-litters
the exact pattern this task is removing as the source of truth. Applied
uniformly: I did not selectively strip any existing calls, and did not
selectively add any new ones. The one call I *did* add is not a
`validateProjectAccess` call at all — it's the `{id}`→`{projectId}` path
rename on `ProjectController`, which hands that route to the interceptor for
free rather than hand-adding a check.

**`TunnelController`** (2/5) is a residual, structurally different case,
noted rather than fixed: its "projectId" is a `@RequestParam`, not a
`{projectId}` path variable, so it's genuinely outside this interceptor's
detection mechanism (the task's own scoping — "the signal is whether
`@RequestMapping` contains `{projectId}`" — excludes it). It already calls
`validateProjectAccess` when the param is present; omitting the param lists
across the whole org, which reads as intended ("my org's tunnels") rather
than a bypass. Left as-is; flagged here as a candidate for a follow-up task
if query-param-based project scoping is ever worth centralizing too.

### `rotateSecret` plaintext-response conclusion

Did not change `EndpointService.rotateSecret` / `EndpointController.rotateSecret`
returning the new secret in the response body. Conclusion: this is a sound,
common pattern for a *rotate* endpoint — GitHub PATs, AWS access keys, and
most webhook platforms all reveal a freshly-generated secret exactly once, at
generation time, because that's the only way the client can actually get it
(the server only ever stores it encrypted, by design — see
`EncryptionKeyRegistry`). The actual defect was never "the response contains
the secret," it was "the wrong caller could trigger the rotation and receive
someone else's secret" — which is what this task fixes at the authorization
layer. `apiKey_rotateSecret_ownProject_ok_andReturnsSecret` in the isolation
test asserts the plaintext-on-success behaviour is preserved for the
legitimate owner. No further change made; noting the conclusion per the task
instruction to record it either way.

### Tests written

- `ProjectScopeEnforcementIsolationTest.java` (new,
  `webhook-platform-api/src/test/java/com/webhook/platform/api/security/`):
  - `everyProjectIdRouteIsCoveredOrExplicitlyExempt` — classpath-scans every
    `@RestController` in the `controller` package, resolves each handler's
    full path (class-level + method-level `@RequestMapping`/`@*Mapping`,
    combined — needed because `DeliveryController` puts `{projectId}` only in
    a method-level mapping), and asserts every route containing `{projectId}`
    is either unexempt or carries a reasoned `@ProjectScopeExempt`; also
    sanity-checks the scan finds ≥60 such routes and that every one lives
    under `/api/**` (the interceptor's registered pattern), and pins down
    that `EndpointController.rotateSecret`, `SchemaController.*`,
    `IncomingDestinationController.*`, `TestEndpointController.list` are
    found and unexempt.
  - Behavioural (MockMvc, real Postgres via Testcontainers): Schema
    list/create cross-project denial + own-project success,
    IncomingDestination list/create cross-project denial + own-project
    success, TestEndpoint cross-project denial (re-verification of P0-08),
    rotate-secret cross-project denial (the worst case) + own-project success
    with the plaintext secret still returned.
- `ApiKeyScopeEnforcementTest.java` (extended): two new unit tests exercising
  `ScopeEnforcementInterceptor.preHandle` directly against the real
  `EndpointController.rotateSecret` `HandlerMethod`, no Spring context — the
  fast, Docker-free reproduction of the exact worst-case citation.

### Verification output

`mvn test -pl webhook-platform-api -Dtest=ProjectScopeEnforcementIsolationTest`:
```
Tests run: 10, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 11.044 s - in com.webhook.platform.api.security.ProjectScopeEnforcementIsolationTest
BUILD SUCCESS
```

`mvn test -pl webhook-platform-api -Dtest='*IsolationTest,*RbacTest,ApiKeyScopeEnforcementTest'`:
```
Tests run: 43, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```
(covers `TestEndpointIsolationTest` 14/14, `ProjectScopeEnforcementIsolationTest`
10/10, `ApiKeyScopeEnforcementTest` 10/10, `EncryptionAdminRbacTest` 7/7,
`MembershipRbacTest` 1/1, plus other existing `*RbacTest`/`*IsolationTest`
classes.)

`mvn test -pl webhook-platform-api` (full module suite):
```
Tests run: 493, Failures: 7, Errors: 0, Skipped: 0
BUILD FAILURE
```
All 7 failures are in `PasswordResetIntegrationTest` (4, all `expected <200/400>
but was <429>` — rate-limiter state bleeding across the full-suite run) and
`AuthContextIntegrationTest` (3, all `... but was <400>`, root cause
`java.lang.IllegalArgumentException: Name for argument of type [int] not
specified...` inside `AuditLogController.list`'s unnamed `int page`/`int size`
`@RequestParam`s — a `-parameters` reflection issue, nothing to do with
project scoping). **Verified both are pre-existing and unrelated**: reset the
worktree to `2b1c83f` (`develop` HEAD before this task, via `git reset --hard`
on a WIP commit — not `git stash`, per the shared-`.git` hazard) and reran
both classes with `mvn clean test`; identical 3+4 failures reproduced on
unmodified `develop` with none of this task's changes present. Restored via
`git reset --hard` back to the WIP commit, then `git reset --soft` to unstage
for a clean final commit. Every test this task added or touched
(`ProjectScopeEnforcementIsolationTest`, `ApiKeyScopeEnforcementTest`,
`TestEndpointIsolationTest`) is green; no new failures introduced anywhere in
the 493-test run.

### Manual verification

Skipped per instructions — two other agents (P0-12, P0-14) are running
concurrently in sibling worktrees against the same `docker-compose` stack,
and `make up` would port-collide. Left for the coordinator; the manual script
in this task file (two projects, one org, a project-A-scoped key probing
project B's endpoints/schemas/destinations) is exactly what
`ProjectScopeEnforcementIsolationTest`'s behavioural half already automates.

### Left incomplete / deferred

- `TunnelController`'s query-param-based `projectId` (see policy section
  above) — outside this task's path-variable-based mechanism by design;
  flagged for a possible follow-up, not fixed here.
- The two pre-existing, unrelated full-suite failures
  (`PasswordResetIntegrationTest` rate-limit flakiness,
  `AuthContextIntegrationTest`/`AuditLogController` `-parameters` issue) were
  investigated far enough to confirm they predate this branch, but were not
  fixed — out of scope for P0-13.
