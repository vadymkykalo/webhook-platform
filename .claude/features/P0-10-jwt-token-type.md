# P0-10 — An access token is accepted as a refresh token

- **Status:** DONE
- **Priority:** P0 — a short leak becomes a permanent session
- **Branch:** `feature/P0-10-jwt-token-type`
- **Depends on:** nothing
- **Module:** `webhook-platform-api`

## The defect

`JwtUtil.java:43-57` (`generateAccessToken`) and `JwtUtil.java:59-67`
(`generateRefreshToken`) sign with the **same key**, both set
`subject = userId` and a `jti`, and **neither sets a token-type claim**.

`AuthService.refreshToken` (lines ~145-155) validates signature, expiry and the
blacklist, then goes straight to `jwtUtil.getUserIdFromToken(refreshToken)`.
It never checks that the token it was handed is actually a refresh token.

**Exploit:** a leaked 15-minute access token (XSS, a log line, a proxy capture,
a Referer header) is POSTed to the unauthenticated `/api/v1/auth/refresh` and
exchanged for a fresh access token **plus a new 7-day refresh token** — renewable
indefinitely. A brief leak becomes a permanent session.

The reverse direction is safe only by accident: `JwtAuthenticationFilter.java:57`
reads `organizationId` and NPEs on a refresh token, swallowed at line 71. Do not
rely on that — make it explicit.

## Steps

- [x] Reproduce first: log in, take the **access** token, POST it to
      `/api/v1/auth/refresh`, and confirm you get a new token pair.
- [x] Add an explicit type claim: `.claim("typ","access")` /
      `.claim("typ","refresh")` in `JwtUtil`.
- [x] Assert the expected type in **both** directions — in
      `AuthService.refreshToken` (must be `refresh`) and in
      `JwtAuthenticationFilter` (must be `access`), replacing the accidental
      NPE-based protection with a deliberate rejection.
- [x] Plan the rollout: tokens issued before this change have no `typ`. Decide
      whether to treat a missing claim as invalid (forces re-login, cleanest) or
      to grandfather it for one refresh-token lifetime. Write the choice and its
      user impact in the log.
- [x] Check the CLI/device-code path issues and consumes tokens through the same
      helpers, so it inherits the fix (`DeviceAuthService`) — coordinate with
      P0-12 if both are in flight.
- [x] Consider adding refresh-token **reuse detection** while you are here: today
      replaying an already-rotated refresh token just returns 401
      (`AuthService.java:151-153`) instead of revoking the token family via the
      available `tokenBlacklistService.revokeAllUserTokens`. A stolen-then-rotated
      token is silently tolerated. Do it or explicitly defer it in the log.

## Tests to write

Extend `AuthIntegrationTest.java` (exists):

- an access token POSTed to `/auth/refresh` is rejected;
- a refresh token presented as a bearer credential is rejected;
- the normal login → refresh → access cycle still works;
- (if implemented) replaying a rotated refresh token revokes the family.

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest=AuthIntegrationTest   # needs Docker
mvn test -pl webhook-platform-api -Dtest='*IntegrationTest'
```

Manual:
```bash
make up && make wait-healthy
# login via UI, grab the access token from devtools, curl it to /auth/refresh
# expect 401
```

## Definition of done

- [x] Tokens are type-bound in both directions.
- [x] Migration/rollout decision recorded, including whether users get logged out.
- [x] Reuse detection implemented or explicitly deferred with a reason.

## Progress log

**2026-08-21 — done.**

### What changed

- `JwtUtil.java`: `generateAccessToken` now stamps `.claim("typ", TOKEN_TYPE_ACCESS)`
  ("access") and `generateRefreshToken` stamps `.claim("typ", TOKEN_TYPE_REFRESH)`
  ("refresh"). Added `getTokenType(String token)` and public constants
  `TOKEN_TYPE_ACCESS` / `TOKEN_TYPE_REFRESH` so both consumers assert against the
  same literal instead of duplicating the string.
- `AuthService.refreshToken`: after the existing signature/expiry check, now
  requires `typ == "refresh"` and rejects anything else (including a missing
  claim) with 401 "Invalid or expired refresh token" — this is what closes the
  exploit (an access token, or the reverse, can no longer be exchanged at
  `/auth/refresh`).
- `JwtAuthenticationFilter.java`: now requires `typ == "access"` on any bearer
  token before it is allowed to authenticate a request, replacing the previous
  accidental protection (an NPE reading `organizationId` off a refresh token,
  silently swallowed by the outer catch). A refresh token, or a pre-fix token
  with no `typ` claim, is now deliberately rejected with a debug log line
  instead of relying on a downstream crash.
- `DeviceAuthService` (CLI/device-code flow) issues tokens via
  `jwtUtil.generateAccessToken` / `generateRefreshToken` and never parses/
  validates them itself, so it inherits the fix automatically — no changes
  needed there. Confirmed via `grep` that `AuthService` and
  `JwtAuthenticationFilter` are the only two consumers of
  `getUserIdFromToken`/`validateToken` on the main src tree.

### Rollout decision

**Missing `typ` claim is treated as invalid (not "access" and not "refresh"),
not grandfathered.** Concretely:
- `AuthService.refreshToken` requires `typ == "refresh"` — a pre-fix refresh
  token (no `typ`) fails this check exactly like an access token would.
- `JwtAuthenticationFilter` requires `typ == "access"` — a pre-fix access token
  (no `typ`) fails this check too.

**User impact:** every token issued before this deploy — both outstanding
access tokens (≤15 min TTL) and outstanding refresh tokens (≤7 day TTL) —
stops working the moment this ships. Every logged-in user is forced to log in
again; there is no silent one-refresh grace period. This was chosen over
grandfathering because: (1) the whole point of this fix is that token identity
can no longer be inferred from context, so accepting "no claim" as "any type"
for even one more refresh cycle re-opens the exact hole the task describes;
(2) access tokens already expire in ≤15 minutes, so the forced-logout blast
radius for *those* is bounded and short regardless; (3) refresh tokens are
long-lived (7 days) and are exactly the artifact an attacker would replay, so
grandfathering them for "one more lifetime" would hand a leaked pre-fix
refresh token a final, fully-privileged renewal window right as the fix ships
— the opposite of what P0-10 is for. Net effect: a one-time forced re-login
for all active sessions at deploy time, then normal behavior going forward.

### Reuse-detection decision

**Implemented.** `AuthService.refreshToken` now extracts `userId` before the
blacklist check, and if the presented refresh token's `jti` is already
blacklisted (i.e. it was already rotated away by a prior refresh, or revoked
via logout), it calls `tokenBlacklistService.revokeAllUserTokens(userId)`
before returning 401. This sets the user's revocation epoch
(`TokenBlacklistService.revokeAllUserTokens` → `jwt:epoch:<userId>`), which
`JwtAuthenticationFilter` and `AuthService.refreshToken` both already consult
via `isTokenRevokedByEpoch` — so every other access/refresh token the user
currently holds (not just the replayed one) stops working on its next use.
Rationale: replay of an already-rotated refresh token is the textbook signal
of a stolen refresh token racing the legitimate client's rotation, so the
right response is "kill the whole session family and force re-login," not "401
this one request and let the rest of the family keep working." Tradeoff
accepted: this is a blunt instrument (it also revokes sessions on other
devices), but for a security-critical replay signal that's the intended
behavior, and it reuses an existing primitive (`revokeAllUserTokens`) rather
than adding new state.

### Tests added (`AuthIntegrationTest.java`)

- `testAccessTokenRejectedByRefreshEndpoint` — reproduces the CVE, then (with
  the fix) asserts 401 when an access token is POSTed to `/auth/refresh`.
- `testRefreshTokenRejectedAsBearerCredential` — asserts a refresh token
  presented as `Authorization: Bearer` gets 401 from a protected endpoint.
- `testLoginRefreshAccessCycleStillWorks` — asserts the legitimate
  login → refresh → access cycle is unaffected by the fix.
- `testReplayingRotatedRefreshTokenRevokesTokenFamily` — stubs
  `tokenBlacklistService.isBlacklisted` for the token's `jti` to simulate an
  already-rotated-away token being replayed, then verifies
  `revokeAllUserTokens(userId)` is invoked (the mocked `TokenBlacklistService`
  in `AbstractIntegrationTest` means this is driven with Mockito rather than
  real Redis state, consistent with the rest of the test class).

**Reproduction confirmed against pre-fix code** by temporarily stashing the
three source changes (keeping the new tests) and running
`testAccessTokenRejectedByRefreshEndpoint` and
`testReplayingRotatedRefreshTokenRevokesTokenFamily`: both failed exactly as
the defect describes — the access token got a 200 with a fresh token pair, and
replaying a rotated refresh token 401'd without calling
`revokeAllUserTokens`. Restored the fix afterward and re-ran to confirm green
(see test output below).

### Test output

`mvn test -pl webhook-platform-api -Dtest=AuthIntegrationTest`:
```
Tests run: 6, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 27.08 s - in com.webhook.platform.api.AuthIntegrationTest
BUILD SUCCESS
```

`mvn test -pl webhook-platform-api -Dtest='*IntegrationTest'`:
```
Tests run: 144, Failures: 7, Errors: 0, Skipped: 0
BUILD FAILURE
```
The 7 failures are all in `PasswordResetIntegrationTest` (4: unexpected 429s
from the rate limiter) and `AuthContextIntegrationTest` (3: audit-log 400 vs
403/200 mismatches) — **neither touches JWT token types or the refresh flow**.
Confirmed pre-existing and unrelated to this change: stashed the three P0-10
source edits (reverting to unfixed `develop` baseline, keeping only the new
test file stashed too) and re-ran `PasswordResetIntegrationTest` and
`AuthContextIntegrationTest` directly — identical 7 failures, identical
messages, on baseline code with none of this task's changes applied. Restored
the fix afterward (`git stash pop`, verified via `grep` that
`TOKEN_TYPE_ACCESS`/`TOKEN_TYPE_REFRESH`/`revokeAllUserTokens` are present in
the three source files and the four new test methods are present in
`AuthIntegrationTest.java`). Not fixed here — out of scope for P0-10; worth a
follow-up ticket.

### Manual verification

Skipped per coordinator instruction: P0-08 is running concurrently in a
sibling worktree and `make up`/docker-compose would port-collide. Left for the
coordinator to run centrally afterward (`make up && make wait-healthy`, then
confirm a captured access token 401s at `/auth/refresh` via curl/devtools, per
the Manual block above).

### Left incomplete / follow-ups

- Nothing in this task's scope is incomplete.
- Pre-existing, unrelated `PasswordResetIntegrationTest` / `AuthContextIntegrationTest`
  failures (see Test output above) were observed and confirmed pre-existing —
  flagging for a separate ticket rather than fixing here.
