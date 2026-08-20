# P0-13 — API-key project scoping is enforced inconsistently (systemic)

- **Status:** TODO
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

- [ ] Reproduce first, on the rotate-secret case specifically — it is the most
      damaging and the most convincing.
- [ ] **Do not fix this with ~30 manual insertions.** Enforce it centrally in
      `ScopeEnforcementInterceptor` so any route with a `{projectId}` path
      variable is checked automatically. That is the only version of this fix
      that stays correct as new controllers are added.
- [ ] Provide an explicit, greppable opt-out annotation for the genuine
      exceptions, so "no check here" is a deliberate, reviewable decision rather
      than an omission.
- [ ] Remove the now-redundant per-handler calls, or leave them as harmless
      defence-in-depth — pick one policy and apply it uniformly. Say which.
- [ ] Separately reconsider `rotateSecret` returning the plaintext secret in the
      response body. Even correctly scoped, that is a design worth a second look;
      note your conclusion.
- [ ] Re-run the table above and paste before/after into the log.

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

- [ ] Enforcement is central; a new `{projectId}` controller is protected by default.
- [ ] The structural test exists and fails if someone adds an unprotected route.
- [ ] Before/after coverage table in the log.
- [ ] Full api-module suite green — regressions here are lockouts, so this matters.

## Progress log
