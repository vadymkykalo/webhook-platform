# P0-10 — An access token is accepted as a refresh token

- **Status:** IN PROGRESS
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

- [ ] Reproduce first: log in, take the **access** token, POST it to
      `/api/v1/auth/refresh`, and confirm you get a new token pair.
- [ ] Add an explicit type claim: `.claim("typ","access")` /
      `.claim("typ","refresh")` in `JwtUtil`.
- [ ] Assert the expected type in **both** directions — in
      `AuthService.refreshToken` (must be `refresh`) and in
      `JwtAuthenticationFilter` (must be `access`), replacing the accidental
      NPE-based protection with a deliberate rejection.
- [ ] Plan the rollout: tokens issued before this change have no `typ`. Decide
      whether to treat a missing claim as invalid (forces re-login, cleanest) or
      to grandfather it for one refresh-token lifetime. Write the choice and its
      user impact in the log.
- [ ] Check the CLI/device-code path issues and consumes tokens through the same
      helpers, so it inherits the fix (`DeviceAuthService`) — coordinate with
      P0-12 if both are in flight.
- [ ] Consider adding refresh-token **reuse detection** while you are here: today
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

- [ ] Tokens are type-bound in both directions.
- [ ] Migration/rollout decision recorded, including whether users get logged out.
- [ ] Reuse detection implemented or explicitly deferred with a reason.

## Progress log
