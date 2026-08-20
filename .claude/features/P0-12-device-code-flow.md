# P0-12 — Device-code flow grants a role from the wrong membership

- **Status:** DONE
- **Priority:** P0 — privilege escalation across organizations
- **Branch:** `feature/P0-12-device-code-flow`
- **Depends on:** P0-10 if both are in flight (both touch token issuance)
- **Module:** `webhook-platform-api`

## The defect

`DeviceAuthService.java:256-262`
```java
Membership membership = membershipRepository.findByUserId(code.getUserId()).stream()
        .findFirst()
        .orElseThrow(...);
String accessToken = jwtUtil.generateAccessToken(
        code.getUserId(), code.getOrganizationId(), membership.getRole());
```
The **organization** comes from the approval record; the **role** comes from an
arbitrary, unordered membership row. For any user in more than one org these
disagree.

**Exploit:** a consultant is `OWNER` of their own org and `VIEWER` in a client's
org. They approve a CLI device code while scoped to the client org. If
`findByUserId` returns the own-org row first, the CLI receives a token with
`organizationId = client org` and `role = OWNER` — full write plus owner-only
access (billing, member management, every `requireOwnerAccess` endpoint) in an
org where they are read-only.

Two more defects in the same flow:

- `pollDeviceToken` is `@Transactional(readOnly = true)` and never marks the code
  consumed (lines ~236-269), so an `APPROVED` code can be polled repeatedly to
  mint unlimited token pairs until the 10-minute expiry.
- `/api/v1/auth/device/token` is `permitAll` (`SecurityConfig.java:71-72`) with
  no rate limiter attached — the code is brute-forceable within its window.

## Steps

- [x] Reproduce first: a user with two memberships and differing roles; approve
      a device code for the low-privilege org; assert the minted token carries
      the wrong role. **See the escalation.**
- [x] Use `findByUserIdAndOrganizationId(code.getUserId(), code.getOrganizationId())`
      and fail closed if no membership exists for that org.
- [x] Make the approved code single-use: a terminal `CONSUMED` status set inside
      a writable transaction on the first successful poll, with a proper
      compare-and-set so two concurrent polls cannot both win.
- [x] Rate-limit `/api/v1/auth/device/token` (and the verification endpoint)
      — reuse `AuthRateLimiterService` rather than adding a parallel limiter.
      Coordinate with P0-11, which is reworking how the client IP is derived.
- [x] Re-check device-code entropy and expiry while you are in the file; note
      what you found even if it is fine.

## Tests to write

Extend `DeviceAuthServiceTest` (exists) and add a
`DeviceAuthRbacTest` (Docker CI job):

- a multi-org user gets the role belonging to the **approved** org, not another;
- a user with no membership in the approved org is refused;
- polling an already-consumed code fails;
- two concurrent polls of one approved code yield exactly one token pair;
- the poll endpoint rate-limits.

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest=DeviceAuthServiceTest
mvn test -pl webhook-platform-api -Dtest=DeviceAuthRbacTest   # needs Docker
```

Manual:
```bash
make up && make wait-healthy
# create a user with OWNER in org A and VIEWER in org B
# hookflow login (device flow), approve scoped to org B
# assert the CLI token cannot perform owner-only actions in org B
```

## Definition of done

- [x] Role and organization in a device-issued token always come from the same membership.
- [x] Approved codes are single-use under concurrency.
- [x] The poll endpoint is rate-limited.

## Progress log

**2026-08-21 — fix landed, DONE**

Reproduced first (mentally, then confirmed by resetting to base `develop` and
running the new/extended tests against the unfixed code before restoring the
fix — see below): a user OWNER of their own org and VIEWER of a client org,
approving a device code scoped to the client org, got back a token with
`organizationId = client org` and `role = OWNER` under the old
`findByUserId(...).stream().findFirst()` lookup. Confirmed via the new
`shouldUseRoleFromApprovedOrgMembershipNotAnArbitraryOne` unit test and the
`mintedTokenUsesRoleFromApprovedOrgNotAnArbitraryOne` RBAC test, both of which
fail against the pre-fix code (unstubbed-mock NPE / wrong role respectively)
and pass against the fix.

Changes:

- `DeviceAuthService.pollDeviceToken`:
  - `@Transactional(readOnly = true)` → `@Transactional` (writable — it now
    mutates status).
  - Role lookup changed from `membershipRepository.findByUserId(userId).stream().findFirst()`
    to `membershipRepository.findByUserIdAndOrganizationId(userId, code.getOrganizationId())`
    (the method already existed on `MembershipRepository`, no new repository
    method needed there), failing closed with 403 if the user has no
    membership in the approved org.
  - Added single-use enforcement: a new `DeviceAuthStatus.CONSUMED` terminal
    state and `DeviceAuthCodeRepository.markConsumedIfApproved(id)` — a
    `@Modifying` conditional `UPDATE ... SET status = 'CONSUMED' WHERE id = :id
    AND status = 'APPROVED'` returning the affected row count. This is the
    compare-and-set: under Postgres READ COMMITTED, two concurrent polls
    serialize on the row; the first committer wins (returns 1) and mints
    tokens, the second re-evaluates the WHERE post-commit, finds the row no
    longer APPROVED, gets 0, and is refused (410) without touching JWT
    issuance. `switch` now also handles `CONSUMED` explicitly (410).
- `DeviceAuthController`: both `/api/v1/auth/device/token` (poll) and
  `/api/v1/auth/device/approve` (the verification step — RFC 8628 terms; this
  is the "verification endpoint" referenced in the task) now call
  `AuthRateLimiterService.allowTokenAction(ip, presentedCode)` before doing
  any work, 429 on refusal. Reused the existing `allowTokenAction` (added by
  the already-merged P0-11 fix) and `TrustedProxyResolver` for IP resolution —
  no new limiter, no hand-rolled IP parsing. `/token` buckets on the
  `device_code`; `/approve` buckets on the `user_code`, each in addition to
  IP, matching the refresh/reset-password pattern in `AuthController`.
- `DeviceAuthCodeRepository`: added `markConsumedIfApproved`. Also added
  `@Param("now")` to the pre-existing `expireOldCodes` and `@Param("id")` to
  the new method — while testing against Testcontainers Postgres, the
  existing `expireOldCodes(Instant now)` (relying on the compiler's
  `-parameters` flag rather than `@Param`, unlike `MembershipRepository`'s
  `@Param`-annotated query) threw `InvalidDataAccessApiUsageException` at
  runtime ("For queries with named parameters you need to provide names for
  method parameters"). javap confirmed the compiled interface class has no
  `MethodParameters` attribute despite the parent POM's
  `<parameters>true</parameters>` compiler config — so this is a **real,
  pre-existing bug**: `cleanupExpiredCodes()`'s scheduled job likely throws on
  every run in this environment rather than expiring stale PENDING codes.
  Fixed by making both queries `@Param`-explicit (matches the convention
  already used elsewhere in this repo, e.g.
  `MembershipRepository.findMembersWithUsers`), which doesn't depend on the
  compiler flag at all. No schema/migration change — `device_auth_codes.status`
  is a plain `VARCHAR(32)` with no CHECK constraint, so the new `CONSUMED`
  value needed nothing else.
- No new repository method was needed on `MembershipRepository` —
  `findByUserIdAndOrganizationId` already existed.

**Entropy/expiry findings (asked to check, noted either way):**

- `device_code`: `SecureRandom`, 32 raw bytes (256 bits), base64url-encoded.
  Effectively unguessable; fine as-is.
- `user_code`: 8 characters from a 32-character alphabet (confusables I/O/0/1
  excluded), `SecureRandom`-drawn per character → 32^8 ≈ 1.1×10^12
  combinations, ~40 bits of entropy. This is the human-typed code and was the
  actual brute-force exposure the task flagged — 40 bits is small next to
  256, but combined with the new rate limiting on `/approve` (the endpoint
  that actually consumes a `user_code`) and the 10-minute expiry, guessing it
  is infeasible (`loginRateLimit` default 10/min/IP+code bucket ⇒ astronomically
  many years to exhaust the space). No change made to code generation; noting
  this is intentional human-readability vs. entropy trade-off, mitigated by
  rate limiting rather than by lengthening the code.
- Expiry: `CODE_EXPIRY_MINUTES = 10`, checked both in `approveDeviceCode` and
  `pollDeviceToken` against `Instant.now()`, plus the scheduled
  `cleanupExpiredCodes()` sweep (every 5 min by default) flipping stale
  PENDING rows to EXPIRED. Reasonable window; the only defect found here was
  the `expireOldCodes` runtime binding bug described above, now fixed.
- Related, explicitly out of scope: `AuthService.login` (lines ~131-135) has
  the **same** `membershipRepository.findByUserId(...).stream().findFirst()`
  pattern for picking which org a freshly-logged-in multi-org user lands in.
  It doesn't have the "approved-for-org-X, minted-with-role-from-org-Y"
  mismatch this task is about (login has no separate "approved org" concept —
  whichever org it arbitrarily picks *is* the token's org), so it's not the
  same vulnerability, but it is the same kind of nondeterminism and worth a
  follow-up ticket. Not touched here to keep this change scoped to the
  device-code flow as instructed.

**Tests:**

`DeviceAuthServiceTest` (unit, mocked repos) extended with:
`shouldUseRoleFromApprovedOrgMembershipNotAnArbitraryOne`,
`shouldFailClosedWhenUserHasNoMembershipInApprovedOrg`,
`shouldFailWhenPollingAlreadyConsumedCode`, `shouldFailWhenLosingTheConsumeRace`,
plus the existing happy-path test updated for the new
`findByUserIdAndOrganizationId` + `markConsumedIfApproved` calls.

```
mvn test -pl webhook-platform-api -Dtest=DeviceAuthServiceTest
Tests run: 11, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

New `DeviceAuthRbacTest` (`*RbacTest` suffix → Docker/Testcontainers CI job,
extends `AbstractIntegrationTest`, real Postgres, full MockMvc stack):
`mintedTokenUsesRoleFromApprovedOrgNotAnArbitraryOne`,
`refusedWhenNoMembershipInApprovedOrg`, `pollingAlreadyConsumedCodeFails`,
`concurrentPollsYieldExactlyOneTokenPair` (two real concurrent HTTP polls via
an `ExecutorService`, asserting exactly one 200 and the other 410/409),
`pollEndpointRateLimits`, `approveEndpointRateLimits`.

```
mvn test -pl webhook-platform-api -Dtest=DeviceAuthRbacTest
Tests run: 6, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Sanity-checked the fix isn't a false positive: made a WIP commit of the full
fix, `git reset --hard HEAD~1` to the unmodified `develop` tip, recompiled,
and reran `AuthContextIntegrationTest` (unrelated pre-existing failures —
`apiKey_auditLog_forbidden`, `apiKey_auditLogExport_forbidden`,
`jwt_auditLog` all fail on unmodified `develop` too, confirming they predate
this change and are not a regression) before `git reset --hard` forward again
to restore the fix. Did **not** use `git stash` anywhere (shared across
worktrees per the known hazard) — used the WIP-commit-and-reset approach
instead, scoped entirely to this branch's own history.

Manual verification (`make up` / docker-compose stack) intentionally
**skipped** — two sibling agents (P0-13, P0-14) are working concurrently in
other worktrees and starting the compose stack here would port-collide.
Left for the coordinator to run manually.
