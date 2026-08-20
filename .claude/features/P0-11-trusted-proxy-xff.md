# P0-11 — X-Forwarded-For is trusted verbatim, defeating auth rate limiting

- **Status:** DONE
- **Priority:** P0
- **Branch:** `feature/P0-11-trusted-proxy-xff`
- **Depends on:** nothing
- **Module:** `webhook-platform-api`

## The defect

`AuthController.java:256-262`
```java
String xForwardedFor = request.getHeader("X-Forwarded-For");
if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
    return xForwardedFor.split(",")[0].trim();
}
```
No trusted-proxy list, no `server.forward-headers-strategy` gate. The client
fully controls the rate-limit bucket key used at `AuthController.java:61, 85,
110, 173, 232, 248`. Taking `split(",")[0]` is also backwards — the left-most
entry is the most attacker-controlled hop.

Impact is worst where the *email* half of the limiter is not engaged, because
`AuthRateLimiterService.allowLogin` (lines ~183-192) only adds the email bucket
when a non-blank email is passed:

- `POST /reset-password` — `allowLogin(ip, null)` → unlimited reset-token guessing
- `POST /refresh` — `allowLogin(ip, null)` → unlimited refresh-token guessing
- `POST /register` — `allowRegister(ip)` → unlimited account creation and
  mail-bombing through your SMTP relay

Reset tokens are 32 random bytes so guessing is not practical today; the live
impact is free account creation and using your mail server as a relay.

## Steps

- [x] Reproduce first: hit `/api/v1/auth/register` repeatedly with a rotating
      fabricated `X-Forwarded-For` and confirm the rate limiter never engages.
- [x] Introduce a trusted-proxy configuration (CIDR list, env-driven per the
      repo's `.env.dist` convention) and parse XFF **only** when the peer is a
      trusted proxy. Otherwise use the socket address.
- [x] When parsing, walk from the right and take the first untrusted hop — not
      `split(",")[0]`.
- [x] Prefer Spring Boot's `server.forward-headers-strategy` if it fits the
      deployment shape; if you hand-roll, put the logic in **one** helper and
      route every caller through it. Check for other XFF readers first:
      `grep -rn "X-Forwarded-For\|getRemoteAddr" webhook-platform-api/src/main/java`
      (note `ClientIpResolver` already exists under `service/ingress` — reuse or
      unify rather than adding a third implementation).
- [x] Give `/reset-password` and `/refresh` a limiter dimension that is not
      purely IP — these are the endpoints with no email bucket.
- [x] Document the required reverse-proxy setup in `.env.dist` and the
      self-hosting guide. Getting this wrong in either direction (trusting
      nothing behind a proxy, trusting everything without one) is an operator
      footgun, so the default must be safe: trust nothing unless configured.

## Tests to write

Extend `AuthRateLimiterServiceTest` (exists) and add
`TrustedProxyResolverTest`:

- a spoofed XFF from an untrusted peer is ignored;
- a genuine XFF from a configured trusted proxy is honoured;
- the right-most-untrusted-hop selection is correct for a multi-hop chain;
- rate limiting actually engages for repeated `/register` from one real peer.

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest=AuthRateLimiterServiceTest
mvn test -pl webhook-platform-api -Dtest=TrustedProxyResolverTest
```

Manual:
```bash
make up && make wait-healthy
for i in $(seq 1 50); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8080/api/v1/auth/register \
    -H "X-Forwarded-For: 1.2.3.$i" -H 'Content-Type: application/json' \
    -d '{"email":"a'$i'@x.com","password":"Passw0rd!234"}'
done
# expect 429s to appear; today they do not
```

## Definition of done

- [x] XFF is honoured only from configured trusted proxies; default is to ignore it.
- [x] One shared resolver, not several.
- [x] Rate limiting demonstrably engages under the spoofing loop above (proven at the
      unit level in `AuthRateLimiterServiceTest#rateLimitingEngages_forRepeatedRegisterFromOneRealPeer_despiteSpoofedXff`;
      the live `make up` + curl loop is left for the coordinator, see Progress log).
- [x] Reverse-proxy requirement documented for self-hosters.

## Progress log

**2026-08-20 — DONE**

### Reproduction (before fixing)

Wrote a throwaway reflection-based test that called the pre-fix private
`AuthController.getClientIp` with `remoteAddr="8.8.8.8"` (a random public address,
not any kind of proxy) and header `X-Forwarded-For: 1.2.3.4`. It returned
`"1.2.3.4"` — the attacker-supplied value won over the real peer with zero proxy
gate:

```
$ mvn -pl webhook-platform-api test -Dtest=ScratchReproTest
Tests run: 1, Failures: 0, Errors: 0, Skipped: 0
```

(Assertion was `assertEquals("1.2.3.4", result)` and it passed against the
unmodified code — confirming the defect. That scratch test was deleted once the
fix landed; the permanent regression coverage is `TrustedProxyResolverTest` and
the extended `AuthRateLimiterServiceTest`.)

### What changed

- **`grep -rn "X-Forwarded-For\|getRemoteAddr" webhook-platform-api/src/main/java`**
  found four independent readers: `AuthController.getClientIp` (the one cited in
  the task, no proxy gate at all), `AuditLogAspect.resolveClientIp` (same bug),
  `TestEndpointService.getClientIp` (same bug), and
  `service/ingress/ClientIpResolver` (already had a trusted-proxy gate, but still
  took `split(",")[0]` — the left-most, attacker-controlled hop — once past the
  gate).
- Unified all four into one new class,
  `com.webhook.platform.api.security.TrustedProxyResolver`, replacing (not
  wrapping) the old `service/ingress/ClientIpResolver`, which is deleted.
  - Default trusted-proxy list is now **empty** — trust nothing — where the old
    `ClientIpResolver` shipped a private-range default
    (`127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16`). That default was
    itself the "trusting everything without one" footgun the task warns about,
    so it's gone; the base `docker-compose.yml` dev stack exposes the API
    directly (no proxy in front) so empty is correct there too.
  - `resolve()` only inspects `X-Forwarded-For`/`X-Real-IP` when
    `getRemoteAddr()` matches the configured allowlist; otherwise it returns the
    socket peer untouched, without even reading the header.
  - When trusted, it walks the XFF chain **from the right**, skipping hops that
    are themselves trusted proxies, and returns the first untrusted hop — not
    `split(",")[0]`. Falls back to the left-most entry only if every hop in the
    chain is trusted (fully internal chain).
  - Added a literal-IPv4/IPv6-syntax gate (`isLiteralIpAddress`) in front of
    every `InetAddress.getByName()` call. This matters more after this change
    than before: hop values inside XFF are now fed into the trusted-proxy check
    itself (to decide whether to keep walking left), and unlike `remoteAddr`
    they're attacker-reachable through a legitimate proxy chain — without the
    gate, a crafted non-IP hop could trigger a real DNS lookup (a minor
    SSRF/DoS-adjacent side channel that didn't exist before this fix touched
    that code path).
  - Considered Spring's `server.forward-headers-strategy` instead of a hand-
    rolled resolver; didn't use it because it has no per-caller trusted-proxy
    CIDR allowlist of its own (it either trusts all upstream unconditionally or
    none), and it wouldn't give `AuditLogAspect` / `TestEndpointService` /
    `AuthRateLimiterService` the same value in a way that's independently
    testable the way a plain `@Component` is.
- `AuthController`: injected `TrustedProxyResolver`, `getClientIp` now delegates
  to it. `/refresh` now extracts the refresh token (cookie or body) *before* the
  rate-limit check (previously it rate-limited first and only looked at the
  token afterward) and `/refresh` + `/reset-password` now call a new
  `AuthRateLimiterService.allowTokenAction(ip, token)` instead of
  `allowLogin(ip, null)`.
- `AuthRateLimiterService.allowTokenAction`: same IP-bucket-then-second-bucket
  shape as `allowLogin`, but the second dimension is a SHA-256 hash of the
  presented token (via the existing `CryptoUtils.hashApiKey`, reused rather than
  writing a second hasher) instead of email — refresh/reset-password have no
  email at this point, so before this they had *no* non-IP dimension at all.
  This bounds repeated retries/guesses against one specific token even if spread
  across many real source IPs, the same way the email bucket bounds distributed
  login attempts against one account. `/register` was deliberately left IP-only
  per the task's explicit scope (the "Steps" section names only
  `/refresh`/`/reset-password`).
- `AuditLogAspect` and `TestEndpointService`: now take `TrustedProxyResolver` as
  a constructor dependency (Lombok `@RequiredArgsConstructor` on the latter) and
  delegate instead of re-implementing header parsing.
- `IngressService` / `IngressServiceTest`: updated to the renamed/relocated
  class. One existing assertion,
  `IngressServiceTest.receiveWebhook_xForwardedFor_extractsClientIp`, encoded the
  old left-most-hop behavior (`"203.0.113.50, 70.41.3.18"` expected to resolve to
  `"203.0.113.50"`); corrected the expectation to `"70.41.3.18"` (the right-most,
  actually-observed hop) to match the fixed semantics — this is a real
  behavior fix, not a relaxed test.
- Config: renamed `webhook.incoming.trusted-proxies` /
  `WEBHOOK_INCOMING_TRUSTED_PROXIES` to `webhook.trusted-proxies` /
  `WEBHOOK_TRUSTED_PROXIES` (it now governs auth, audit, and test-endpoint IP
  resolution too, not just ingress) in `application.yml`. It was never actually
  documented in `.env.dist` before this change, so there was no real public
  contract to preserve.
  - `docker-compose.yml` (base dev stack, API exposed directly): defaults the
    var to empty — correct, no proxy in front.
  - `docker-compose.prod.yml` (traffic goes through the bundled UI-nginx proxy,
    confirmed in `webhook-platform-ui/nginx.conf` which sets
    `X-Forwarded-For: $proxy_add_x_forwarded_for`): sets
    `WEBHOOK_TRUSTED_PROXIES=172.16.0.0/12` by default (Docker Compose's default
    bridge network range) so the documented reference production deployment
    keeps working correctly out of the box.
  - Documented in `.env.dist` (new var, wasn't there before) and in
    `docs/SELF_HOSTED_GUIDE.md` (new "Reverse Proxy / Trusted Proxies"
    subsection under §2 Network Requirements, plus a row in the §5 Optional
    Configuration table), explaining both failure directions per the task's
    footgun warning.

### Test output

```
$ mvn test -pl webhook-platform-api -Dtest=AuthRateLimiterServiceTest
Tests run: 9, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS

$ mvn test -pl webhook-platform-api -Dtest=TrustedProxyResolverTest
Tests run: 10, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Also ran the full non-Docker unit suite to check for collateral damage from the
resolver rename/behavior change:

```
$ mvn test -pl webhook-platform-api -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'
Tests run: 308, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

(One pre-existing failure surfaced here first —
`IngressServiceTest.receiveWebhook_xForwardedFor_extractsClientIp` — which was
the left-most-hop test noted above; fixed by correcting its expectation, not by
loosening the resolver.)

`TrustedProxyResolverTest` covers, per the task's list: spoofed XFF from an
untrusted peer ignored (`spoofedXff_fromUntrustedPeer_isIgnored`), genuine XFF
from a configured trusted proxy honoured
(`genuineXff_fromConfiguredTrustedProxy_isHonoured`), right-most-untrusted-hop
selection on a multi-hop chain
(`multiHopChain_returnsRightMostUntrustedHop_notLeftMost`, plus
`multiHopChain_attackerPrependsFakeHops_leftMostIsNotTrusted` for the adversarial
case), and a few extras (empty-default-trusts-nothing, CIDR matching, fully-
trusted-chain fallback, X-Real-IP fallback, non-literal-hop DNS-safety).
`AuthRateLimiterServiceTest` adds `allowTokenAction` coverage (local-fallback
exhaustion, blank-token IP-only fallback, IP bucket blocking despite distinct
tokens per attempt) and
`rateLimitingEngages_forRepeatedRegisterFromOneRealPeer_despiteSpoofedXff`,
which reproduces the task's exact "register spam via rotating spoofed XFF"
scenario end-to-end at the unit level (resolver + rate limiter together,
untrusted peer, fresh fake XFF value every iteration) and asserts a rejection
is eventually seen.

### Deliberately left out

Per instructions, the **manual verification block** (`make up && make
wait-healthy` + the 50-request curl loop against `localhost:8080/api/v1/auth/register`)
was **not run** here — other agents may have the shared docker-compose stack up
concurrently in sibling worktrees, and running it here risked a port collision.
Left for the coordinator to run centrally afterward. Everything else in
"Definition of done" is verified at the unit level as described above.

Also not run: the Testcontainers-backed `*IntegrationTest` suite (e.g.
`AuthIntegrationTest`, `PasswordResetIntegrationTest`) — outside the task's
specified verification commands and unnecessary here since neither test file
touches `X-Forwarded-For`/`getRemoteAddr` (checked by grep), so the resolver
change has no code path to affect them; they get real Spring wiring of the new
`TrustedProxyResolver` `@Component` for free either way.
