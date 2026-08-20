# P0-11 — X-Forwarded-For is trusted verbatim, defeating auth rate limiting

- **Status:** IN PROGRESS
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

- [ ] Reproduce first: hit `/api/v1/auth/register` repeatedly with a rotating
      fabricated `X-Forwarded-For` and confirm the rate limiter never engages.
- [ ] Introduce a trusted-proxy configuration (CIDR list, env-driven per the
      repo's `.env.dist` convention) and parse XFF **only** when the peer is a
      trusted proxy. Otherwise use the socket address.
- [ ] When parsing, walk from the right and take the first untrusted hop — not
      `split(",")[0]`.
- [ ] Prefer Spring Boot's `server.forward-headers-strategy` if it fits the
      deployment shape; if you hand-roll, put the logic in **one** helper and
      route every caller through it. Check for other XFF readers first:
      `grep -rn "X-Forwarded-For\|getRemoteAddr" webhook-platform-api/src/main/java`
      (note `ClientIpResolver` already exists under `service/ingress` — reuse or
      unify rather than adding a third implementation).
- [ ] Give `/reset-password` and `/refresh` a limiter dimension that is not
      purely IP — these are the endpoints with no email bucket.
- [ ] Document the required reverse-proxy setup in `.env.dist` and the
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

- [ ] XFF is honoured only from configured trusted proxies; default is to ignore it.
- [ ] One shared resolver, not several.
- [ ] Rate limiting demonstrably engages under the spoofing loop above.
- [ ] Reverse-proxy requirement documented for self-hosters.

## Progress log
