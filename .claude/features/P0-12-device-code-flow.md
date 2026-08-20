# P0-12 — Device-code flow grants a role from the wrong membership

- **Status:** TODO
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

- [ ] Reproduce first: a user with two memberships and differing roles; approve
      a device code for the low-privilege org; assert the minted token carries
      the wrong role. **See the escalation.**
- [ ] Use `findByUserIdAndOrganizationId(code.getUserId(), code.getOrganizationId())`
      and fail closed if no membership exists for that org.
- [ ] Make the approved code single-use: a terminal `CONSUMED` status set inside
      a writable transaction on the first successful poll, with a proper
      compare-and-set so two concurrent polls cannot both win.
- [ ] Rate-limit `/api/v1/auth/device/token` (and the verification endpoint)
      — reuse `AuthRateLimiterService` rather than adding a parallel limiter.
      Coordinate with P0-11, which is reworking how the client IP is derived.
- [ ] Re-check device-code entropy and expiry while you are in the file; note
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

- [ ] Role and organization in a device-issued token always come from the same membership.
- [ ] Approved codes are single-use under concurrency.
- [ ] The poll endpoint is rate-limited.

## Progress log
