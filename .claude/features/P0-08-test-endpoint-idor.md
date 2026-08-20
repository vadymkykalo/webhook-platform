# P0-08 — TestEndpointController has no tenancy check at all

- **Status:** DONE
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

- [x] Reproduce first: an integration test where org B's token reads org A's
      test endpoints and captured requests. **See it return 200 with data.**
- [x] Add `AuthContext auth` to all six handlers and call
      `auth.validateProjectAccess(projectId)`.
- [x] Thread `organizationId` into `TestEndpointService` and filter on it, using
      the same `validateProjectOwnership(projectId, organizationId)` helper the
      other services already use — see `EndpointService.java:70-78` for the
      established pattern. Do not invent a new one.
- [x] Apply `@RequireScope` consistently with sibling controllers for the
      mutating handlers.
- [x] Check `WebhookCaptureController` and `SharedDebugLinkController` for the
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

- [x] All six handlers enforce project access.
- [x] The new isolation test fails against the old code and passes against the new.
- [x] Adjacent capture-related controllers checked (say what you found).

## Progress log

**Fix.** `TestEndpointController` now takes `AuthContext auth` on all six
handlers (`create`, `list`, `get`, `delete`, `getRequests`, `clearRequests`)
and calls `auth.validateProjectAccess(projectId)` on every one (this is the
API-key-scoped-to-project check — no-op for JWT). The three mutating handlers
(`create`, `delete`, `clearRequests`) additionally call
`auth.requireWriteAccess()`, matching the pattern in `EndpointController` /
`SharedDebugLinkController`; `@RequireScope(ApiKeyScope.READ_WRITE)` was
already present on those three and is unchanged. `organizationId` is now
threaded from `AuthContext` into every `TestEndpointService` method, which
gained a `ProjectRepository`-backed `validateProjectOwnership(projectId,
organizationId)` private helper — copied verbatim from the pattern in
`EndpointService.java:70-78` (look up the `Project`, throw `NotFoundException`
if missing, throw `ForbiddenException` if `project.getOrganizationId()`
doesn't match) — and calls it as the first line of `create`, `list`, `get`,
`delete`, `getRequests`, `clearRequests`. `getBySlug` and `captureRequest`
were deliberately left alone: they're keyed by the random 8-char `slug`, not
`projectId`, and are the public capture path (see below), so they have no
tenancy dimension to enforce.

**Adjacent controllers checked:**

- `WebhookCaptureController` (`POST/GET/PUT/PATCH/DELETE /hook/{slug}`) — this
  is the *public* webhook-capture endpoint by design: an external provider
  posts to it with no dashboard credentials, keyed only by the unguessable
  random slug. It doesn't read back or expose another tenant's data (it only
  writes a new `CapturedRequest` row for the slug it's given), and `/hook/**`
  is intentionally whitelisted as public in `SecurityConfig`, same as
  `/ingress/**`. No bug here — the actual data-disclosure surface for captured
  requests is entirely in `TestEndpointController.getRequests`, which is now
  fixed.
- `SharedDebugLinkController` — already correctly wired: every
  project-scoped handler (`createLink`, `listLinksForEvent`, `deleteLink`)
  takes `AuthContext auth`, calls `auth.validateProjectAccess(projectId)` (and
  `requireWriteAccess()` for the mutating ones), and passes
  `auth.organizationId()` into `SharedDebugLinkService`, which checks
  `project.getOrganizationId().equals(organizationId)` before touching
  anything (`SharedDebugLinkService.java` — `createLink`, `listLinks`,
  `listLinksForEvent`, `deleteLink` all do this). The one public handler,
  `GET /api/v1/public/debug/{token}` → `viewPublicLink`, is intentionally
  unauthenticated: it's a share-link keyed by a 32-byte random token and
  returns a PII-masked/sanitized payload (`PiiMaskingService`), which is the
  intended product behavior, not a tenancy bug. No changes made here.

**Reproduce-first.** Wrote `TestEndpointIsolationTest.java` first, then
temporarily reverted `TestEndpointController.java` / `TestEndpointService.java`
to the pre-fix code (via a scoped `git stash` of just those two files) and ran
it: 8 of 14 tests failed, all with `Status expected:<403> but was:<200>` (or
`<204>` for the two DELETE handlers) — i.e. org B's JWT and the
cross-project API key could read/delete org A's test endpoint and its
captured requests. Restored the fix and reran — all 14 pass. See test output
below.

**Incident during reproduce-first (environmental, not code):** `git stash`
uses `refs/stash`, which is shared across all worktrees of this repo (they
share one `.git` dir). A concurrent agent in a sibling worktree also used
`git stash` around the same time, and `git stash pop` on my side popped their
stash entry instead of mine (my `TestEndpointController`/`TestEndpointService`
changes reverted to old code as intended, but the working tree then had
unrelated JWT-token-type changes — `JwtAuthenticationFilter.java`,
`JwtUtil.java`, `AuthService.java`, presumably P0-10's work — applied on top).
I reverted those three files with `git checkout --` (their stash entry,
`54eeb65`, is still recoverable via `git fsck --unreachable` if that agent
needs it — I did not drop it), then rewrote my two files from the known-good
content instead of touching the stash again. Verified `git status`/`git diff`
were clean of anything but my intended changes before proceeding. Flagging
this for the coordinator: **`git stash` is not safe to use across concurrent
agent worktrees in this repo** — worth a note in the working protocol, or
agents should use a throwaway commit (`git commit --no-verify -m wip` then
`git reset HEAD~1` isn't safe either for the same reason if reset is by
message rather than SHA — safest is a plain uncommitted-diff copy to a temp
file, or a real commit + amend) instead of stash for this kind of
temporary-revert-and-restore step.

**Test output — `mvn test -pl webhook-platform-api -Dtest=TestEndpointIsolationTest`:**

```
[INFO] Tests run: 14, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 22.137 s - in com.webhook.platform.api.TestEndpointIsolationTest
[INFO] Results:
[INFO] Tests run: 14, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

(Against the pre-fix code, the same run reported `Tests run: 14, Failures: 8,
Errors: 0` — all 8 failures were the org-B / cross-project-API-key cases
listed above, each `expected:<403> but was:<200>` or `<204>`.)

**Test output — `mvn test -pl webhook-platform-api -Dtest='*IsolationTest,*RbacTest'`:**

```
[INFO] Running com.webhook.platform.api.OrganizationIsolationTest
[INFO] Tests run: 1, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 36.227 s
[INFO] Running com.webhook.platform.api.TestEndpointIsolationTest
[INFO] Tests run: 14, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 15.866 s
[INFO] Running com.webhook.platform.api.EncryptionAdminRbacTest
[INFO] Tests run: 7, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 9.15 s
[INFO] Running com.webhook.platform.api.MembershipRbacTest
[INFO] Tests run: 1, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 9.059 s
[INFO] Tests run: 23, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

**Manual verification (`make up` / docker-compose stack, per the task's
"Manual" block):** deliberately skipped per coordinator instruction — a
concurrent agent (P0-10) is working in a sibling worktree and `make up` would
port-collide. Left for the coordinator to run centrally after merging.

**Left incomplete:** nothing from this task's scope. `getBySlug` in
`TestEndpointService` has no callers anywhere in `src/main` (verified via
grep) — looks like dead code, out of scope for this fix, worth a note for
whoever next touches `TestEndpointService`.
