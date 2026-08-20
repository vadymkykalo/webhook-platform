# P0-08 — TestEndpointController has no tenancy check at all

- **Status:** IN PROGRESS
- **Priority:** P0 — cross-tenant data disclosure
- **Branch:** `feature/P0-08-test-endpoint-idor`
- **Depends on:** nothing (P0-13 generalises this; this task fixes the worst instance now)
- **Module:** `webhook-platform-api`

## The defect

`controller/TestEndpointController.java` is the **only** controller in the tree
where not a single method takes an `AuthContext` parameter. Verify:

```bash
grep -n "AuthContext\|@GetMapping\|@PostMapping\|@DeleteMapping\|RequestMapping" \
  webhook-platform-api/src/main/java/com/webhook/platform/api/controller/TestEndpointController.java
```

It is mapped at `/api/v1/projects/{projectId}/test-endpoints` and every handler
passes `projectId` straight from the path to the service. The service filters on
`projectId` only, never on organization:

- `TestEndpointService.java:79` — `findByProjectIdOrderByCreatedAtDesc(projectId)`
- `TestEndpointService.java:86-88` — `findById(id).filter(e -> e.getProjectId().equals(projectId))`

`SecurityConfig.java:77` maps `/api/v1/projects/**` to `.authenticated()`, so the
only requirement is *any* valid JWT or API key from *any* organization.

**Exploit:** register a free account on a shared instance, get a JWT, then
`GET /api/v1/projects/{victimProjectId}/test-endpoints` → take an `id` →
`GET .../{id}/requests`. Captured requests are stored with full headers and
bodies, so this dumps another tenant's raw inbound webhook traffic including
`Authorization` and provider signature headers. `DELETE` gives cross-tenant
destruction on top. `projectId` is a UUID but it appears in every dashboard URL
and docs snippet the victim shares.

## Steps

- [ ] Reproduce first: an integration test where org B's token reads org A's
      test endpoints and captured requests. **See it return 200 with data.**
- [ ] Add `AuthContext auth` to all six handlers and call
      `auth.validateProjectAccess(projectId)`.
- [ ] Thread `organizationId` into `TestEndpointService` and filter on it, using
      the same `validateProjectOwnership(projectId, organizationId)` helper the
      other services already use — see `EndpointService.java:70-78` for the
      established pattern. Do not invent a new one.
- [ ] Apply `@RequireScope` consistently with sibling controllers for the
      mutating handlers.
- [ ] Check `WebhookCaptureController` and `SharedDebugLinkController` for the
      same shape while you are in this area — captured-request data is the
      sensitive asset here, wherever it is exposed.

## Tests to write

Name it with an isolation suffix so it lands in the Docker CI job:
`TestEndpointIsolationTest.java` in `webhook-platform-api/src/test/java/.../`

- org B's JWT gets 403/404 (pick one and be consistent with
  `OrganizationIsolationTest`) on org A's `projectId` for **each** of the six
  endpoints — list them explicitly, do not test one and assume the rest;
- an API key scoped to project X cannot reach project Y in the same org;
- the owning org still gets 200 (guard against over-correcting into a lockout).

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest=TestEndpointIsolationTest   # needs Docker
mvn test -pl webhook-platform-api -Dtest='*IsolationTest,*RbacTest'
```

Manual:
```bash
make up && make wait-healthy
# register two orgs; from org B call org A's test-endpoint URLs; expect denial
```

## Definition of done

- [ ] All six handlers enforce project access.
- [ ] The new isolation test fails against the old code and passes against the new.
- [ ] Adjacent capture-related controllers checked (say what you found).

## Progress log
