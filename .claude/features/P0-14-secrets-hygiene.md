# P0-14 — Plaintext reset tokens, a logged temp password, unsafe shipped defaults

- **Status:** DONE
- **Priority:** P0
- **Branch:** `feature/P0-14-secrets-hygiene`
- **Depends on:** nothing
- **Module:** `webhook-platform-api`, repo config

Four small, independent fixes grouped because they are all "secrets handled
carelessly" and all touch adjacent code. Tick them off individually.

## 14a — Reset and verification tokens stored in plaintext

`AuthService.java:266` — `user.setPasswordResetToken(resetToken)` and `:277`
`userRepository.findByPasswordResetToken(token)`; same pattern for email
verification at `:83`.

The codebase already knows the right pattern and applies it elsewhere:
`MembershipService.java:100-101` stores `CryptoUtils.hashApiKey(inviteToken)` and
looks up by hash. Any read-only DB exposure — a leaked `make backup-db` dump, a
read replica, a slow-query log — yields live account-takeover tokens.

- [x] Store `CryptoUtils.hashApiKey(token)`, look up by hash, for both reset and
      verification tokens.
- [x] Write a migration for existing rows. Existing plaintext tokens cannot be
      hashed retroactively in a useful way — invalidate them and say so in the log
      (pending resets will need re-requesting; that is the correct trade).

**Note (14a):** `AuthService.java` now generates the plaintext token only to email it
(`emailService.sendVerificationEmail` / `sendPasswordResetEmail`) and stores
`CryptoUtils.hashApiKey(token)` in `verificationToken` / `passwordResetToken`; lookups
(`verifyEmail`, `resetPassword`) hash the incoming token before querying. Repository
method names (`findByVerificationToken`, `findByPasswordResetToken`) are unchanged —
only what's stored/queried changed. Re-read the current `AuthService.java` first per
the task brief: P0-10's `refreshToken()` change is untouched, no conflict.
Migration `V050__hash_reset_and_verification_tokens.sql` NULLs out every existing
`password_reset_token`/`verification_token` (+ their expiry columns) — logged in the
migration's own comment and here in the Progress log below, since a Flyway SQL
migration has no app-level logger to write to at deploy time. Pending resets/verifications
issued before this migration must be re-requested.

## 14b — Temporary password written to the log

`MembershipService.java:91` — the only TODO in the entire Java codebase, and it
is a security one:
```java
// TODO: send temp password via email instead of logging
log.info("Created new user for invite: userId={}, email={}", saved.getId(), request.getEmail());
```

- [x] Read the surrounding block and confirm what actually reaches the log today.
- [x] Ensure the temporary password never reaches logs at any level.
- [x] Route it through `EmailService` like the other credential flows, or drop
      the temp password entirely in favour of the existing invite-token flow —
      the latter is probably better; decide and record why.

**Note (14b):** Confirmed first — the existing `log.info("Created new user for
invite: userId={}, email={}", ...)` call never actually interpolated `tempPass`;
the TODO was accurate about the *intent* but the literal secret wasn't already
leaking into that line. The real defect is that the password was generated,
bcrypt-hashed into the user row, and then **never delivered anywhere** — no
email, no log (rightly) — so the invited user had no way to learn it and the
account was unusable until a `forgotPassword` flow existed.
**Decision: route it through `EmailService`, not drop it.** Considered dropping
it in favor of having `acceptInvite` also do first-time password setup, but that
needs a new *unauthenticated* endpoint (today's `POST .../accept-invite` requires
an existing JWT via `auth.requireUserId()`), which is a real endpoint/authn-surface
change — bigger than this hygiene batch and better scoped as its own follow-up.
Added `EmailService.sendTemporaryPasswordEmail(to, tempPassword)`, called from
`MembershipService.addMember`'s new-user branch. Unlike the other `send*Email`
methods, its dev-mode (`app.email.enabled=false`) fallback path deliberately does
**not** log the password (the other methods log their token/URL in that fallback,
which is fine for a short-lived single-use reset/verification token but not for a
full, non-expiring password) — it logs only that delivery was skipped and points
at `forgot-password` as the dev-mode workaround, which works now that 14a makes
that flow's stored token safe. Verified via a new Logback-`ListAppender` test in
`InviteTokenLeakTest` that no log event contains the generated temp password.

## 14c — Shipped defaults are unsafe and the guard fires too late

`.env.dist:23` `APP_ENV=development` and `.env.dist:236`
`WEBHOOK_ALLOW_PRIVATE_IPS=true`. Both validators are no-ops outside production
(`ProductionSafetyValidator.java:52-55`, `SecurityConfigValidator.java:116`).

A self-hoster who copies `.env.dist` → `.env`, runs `make up` and points a domain
at it gets a platform where **any registered user can create an endpoint at
`http://169.254.169.254/…` and read the response**.

- [x] Flip `.env.dist` to `WEBHOOK_ALLOW_PRIVATE_IPS=false`. Local development
      that needs private IPs should opt in explicitly.
- [x] Move `ProductionSafetyValidator` from `ApplicationReadyEvent` (line ~50) to
      `@PostConstruct` or an `EnvironmentPostProcessor` — today it validates
      **after** the connector is bound and serving, so there is a live window on
      an insecure config. `SecurityConfigValidator` already does this correctly;
      copy that.
- [x] Strengthen the check: it is a fixed substring denylist
      (`ProductionSafetyValidator.java:22-30, 85-91`), so
      `JWT_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` passes. Add a
      "must not equal the value in `.env.dist`" comparison plus an entropy floor,
      and extend coverage to `POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
      `MINIO_ROOT_PASSWORD`, and `CORS_ALLOWED_ORIGINS` still being localhost.

**Note (14c):** `.env.dist` now ships `WEBHOOK_ALLOW_PRIVATE_IPS=false` (with a
comment on why); also flipped `docker-compose.yml`'s two `${WEBHOOK_ALLOW_PRIVATE_IPS:-true}`
fallbacks to `:-false` for defense-in-depth in case a hand-edited `.env` drops the
line entirely (`make up` always seeds `.env` from the now-fixed `.env.dist` though,
so this is a belt-and-suspenders change, not the primary fix).
`ProductionSafetyValidator.validateProductionConfig()` moved from
`@EventListener(ApplicationReadyEvent.class)` to `@PostConstruct`, matching
`SecurityConfigValidator`. Redundant-checks policy: both validators still check
`WEBHOOK_ALLOW_PRIVATE_IPS` independently — left as-is (pre-existing pattern, not
something this task asked to dedupe; they run at the same lifecycle point now so
there's no ordering hazard between them).
Strengthened checks, in order per secret: (1) existing substring-placeholder
denylist, (2) exact-equality against the literal value shipped in `.env.dist`
(`SHIPPED_DEFAULTS` map), (3) a Shannon-entropy floor (40 bits, comfortably below
any real `generateSecureToken()`-style secret, comfortably above a repeated
character or short word) — this is what actually catches
`JWT_SECRET=aaaa...a`. Extended coverage: `POSTGRES_PASSWORD` is checked via the
`DB_PASSWORD` env var instead — that's what's actually forwarded into the API
container and used to authenticate (`POSTGRES_PASSWORD` itself only reaches the
`postgres` container, sets its bootstrap password, and both ship the same
`.env.dist` default, so checking `DB_PASSWORD` covers the same footgun without
adding a new secret to the API's environment). `REDIS_PASSWORD` was already
forwarded. `MINIO_ROOT_PASSWORD` is not consumed by the app (MinIO is
"optional/future" per `.env.dist`) but is now forwarded into the `api` service's
environment in `docker-compose.yml` purely so this check can see it — a blank
value (MinIO not deployed) is not flagged, only a non-blank value equal to /
as weak as the shipped default is. `CORS_ALLOWED_ORIGINS` is flagged if it still
contains `localhost`/`127.0.0.1`.

## 14d — SSRF denylist gaps

`UrlValidator.isPrivateIPv4` (lines ~96-125) covers `10/8`, `172.16/12`,
`192.168/16`, `169.254/16`, `127/8`, `0/8` but **not** `100.64.0.0/10` (CGNAT —
in-cluster traffic on EKS/GKE, and Alibaba's metadata service at
`100.100.100.200`), `192.0.0.0/24`, `198.18.0.0/15`, `224.0.0.0/4`, `240.0.0.0/4`.
`BLOCKED_HOSTS` (lines ~18-21) covers only AWS/GCP metadata.

- [x] Add the missing CIDRs and the Azure/Alibaba/Oracle metadata addresses.
- [x] Consider inverting to an allowlist of globally-routable unicast space —
      more robust, and note the trade-off for self-hosters who legitimately
      forward to internal services (that is what `WEBHOOK_ALLOW_PRIVATE_IPS` and
      the allowed-hosts list are for).

**Note (14d):** Added `100.64.0.0/10` (CGNAT), `192.0.0.0/24` (IETF protocol
assignments), `198.18.0.0/15` (benchmarking), `224.0.0.0/4` (multicast), and
`240.0.0.0/4` (reserved + broadcast) to `isPrivateIPv4`, each with a boundary-tested
comment. `100.100.100.200` (Alibaba metadata) is covered by the new CGNAT range
*and* added explicitly to `BLOCKED_HOSTS`, since `BLOCKED_HOSTS` is checked before
the `allowedHosts` bypass in `validateWebhookUrl` — i.e. it's a hard block that
can't be defeated by adding the host to an org's allow-list, unlike the general
private-IP CIDR checks. Azure and Oracle Cloud (OCI) both serve their metadata at
the same well-known `169.254.169.254` AWS/GCP already block, so no new entry was
needed for them — documented that in a `BLOCKED_HOSTS` comment so it's not missed
on a future audit.
**Allowlist trade-off (considered, not implemented):** kept the denylist rather
than inverting to "globally-routable unicast space only". Recorded the reasoning
as a class-level Javadoc on `UrlValidator`: an allowlist needs to track IANA
carving new ranges out of previously-reserved space (this denylist only grows in
the rarer direction — new *special-purpose* allocations), and a webhook-delivery
hot path is a risky place to introduce false-positive rejections of
legitimate-but-newly-routable targets. The self-hoster need an allowlist would
serve — deliberately forwarding to an internal service — is already met by
`WEBHOOK_ALLOW_PRIVATE_IPS` + the per-endpoint allowed-hosts list. Revisit as a
dedicated follow-up if the denylist keeps needing new entries.

## Tests to write

- Extend `PasswordResetIntegrationTest` (exists): the DB column holds a hash, not
  the token; the flow still works end to end.
- Extend `InviteTokenLeakTest` (exists) to cover the temp-password path.
- New `ProductionSafetyValidatorTest` — currently this class has **no tests at
  all**, which is ironic for the component that gates unsafe production config.
  Cover: dev secrets rejected, low-entropy secrets rejected, unchanged
  `.env.dist` values rejected, valid config accepted.
- Extend `UrlValidatorTest` (exists) with each newly blocked range, including
  `100.100.100.200`.

## Verification

```bash
mvn test -pl webhook-platform-common -Dtest=UrlValidatorTest
mvn test -pl webhook-platform-api -Dtest=ProductionSafetyValidatorTest
mvn test -pl webhook-platform-api -Dtest='PasswordResetIntegrationTest,InviteTokenLeakTest'  # Docker
```

Manual:
```bash
cp .env.dist .env && make up && make wait-healthy
# attempt to create an endpoint at http://169.254.169.254/latest/meta-data/
# expect rejection with the shipped defaults
make shell-db   # confirm password_reset_token column holds a hash
```

## Definition of done

- [x] 14a, 14b, 14c, 14d each ticked, with a note per item.
- [x] `ProductionSafetyValidator` has tests for the first time.
- [x] A fresh `.env.dist` copy is safe by default.

## Progress log

**2026-08-21 — feature/P0-14-secrets-hygiene**

Branched from `develop` at `2b1c83f` (Merge feature/P0-10-jwt-token-type into
develop) — the tip at the time this worktree's own branch history had drifted
from (see branch note below). All four sub-fixes landed; see the per-item notes
above for what changed and the decisions made.

Files touched:
- `webhook-platform-api/src/main/java/com/webhook/platform/api/service/AuthService.java` (14a)
- `webhook-platform-api/src/main/resources/db/migration/V050__hash_reset_and_verification_tokens.sql` (14a, new)
- `webhook-platform-api/src/test/java/com/webhook/platform/api/PasswordResetIntegrationTest.java` (14a)
- `webhook-platform-api/src/test/java/com/webhook/platform/api/AuthIntegrationTest.java` (14a — its
  existing `testRegisterLoginAndGetCurrentUser` read the verification token straight off the
  `User` row, which broke once that column holds a hash; fixed the same way as
  `PasswordResetIntegrationTest`, by mocking `EmailService` and capturing the plaintext token)
- `webhook-platform-api/src/main/java/com/webhook/platform/api/service/MembershipService.java` (14b)
- `webhook-platform-api/src/main/java/com/webhook/platform/api/service/EmailService.java` (14b)
- `webhook-platform-api/src/test/java/com/webhook/platform/api/security/InviteTokenLeakTest.java` (14b)
- `.env.dist` (14c)
- `docker-compose.yml` (14c — `WEBHOOK_ALLOW_PRIVATE_IPS` fallback defaults, `MINIO_ROOT_PASSWORD`
  forwarded to `api` for the validator)
- `webhook-platform-api/src/main/java/com/webhook/platform/api/config/ProductionSafetyValidator.java` (14c)
- `webhook-platform-api/src/test/java/com/webhook/platform/api/config/ProductionSafetyValidatorTest.java` (14c, new)
- `webhook-platform-common/src/main/java/com/webhook/platform/common/security/UrlValidator.java` (14d)
- `webhook-platform-common/src/test/java/com/webhook/platform/common/security/UrlValidatorTest.java` (14d)
- `webhook-platform-api/src/test/java/com/webhook/platform/api/AbstractIntegrationTest.java` — one
  extra stub, `authRateLimiterService.allowTokenAction(...) -> true`. Pre-existing gap unrelated to
  P0-14: `allowTokenAction` backs `/auth/forgot-password` and `/auth/reset-password`'s rate checks
  but was never stubbed here, so every call in `PasswordResetIntegrationTest` was getting a
  spurious 429 from Mockito's default `false` return — deterministically, not flaky, and reproducible
  before any of my other changes (confirmed via `git log -p` that `allowTokenAction` was added to
  `AuthRateLimiterService` after `AbstractIntegrationTest`'s mock setup was last touched). Fixed it
  since without it `PasswordResetIntegrationTest` can't run at all, let alone prove the 14a fix.

Verification commands (all run with Docker available; `PasswordResetIntegrationTest` and
`InviteTokenLeakTest` use Testcontainers Postgres):

```
$ mvn test -pl webhook-platform-common -Dtest=UrlValidatorTest
Tests run: 34, Failures: 0, Errors: 0, Skipped: 0

$ mvn test -pl webhook-platform-api -Dtest=ProductionSafetyValidatorTest
Tests run: 16, Failures: 0, Errors: 0, Skipped: 0

$ mvn test -pl webhook-platform-api -Dtest='PasswordResetIntegrationTest,InviteTokenLeakTest'
Tests run: 12, Failures: 0, Errors: 0, Skipped: 0
```

Also ran for regression coverage (not required by the verification block, but touched by 14a/14b):
`AuthIntegrationTest` (6/6 pass), `AcceptInviteSecurityIntegrationTest` +
`MembershipRbacTest` (5/5 pass), plus `mvn test-compile` across
common/api/worker to confirm no other reader of `getVerificationToken()` /
`getPasswordResetToken()` or of `MembershipService`'s constructor was left broken.

No rate-limiter 429 flakiness recurred once the `allowTokenAction` stub above was
added (checked both standalone and combined runs of the Docker-backed tests).

**Skipped per instructions:** the "Manual" verification block (`make up` /
docker-compose stack, `make shell-db`) — left for the coordinator; two sibling
agents (P0-12, P0-13) are running concurrently in other worktrees and starting
the compose stack here would port-collide.

**Not done / explicitly out of scope, recorded for a follow-up:**
- `webhook-platform-worker` has its own `ProductionSafetyValidator.java` (a
  separate class from the one this task's line references point at, which is the
  `api` module's copy — task `Module:` field also scopes this to
  `webhook-platform-api`). Not touched; worth a look in a future pass if the
  worker ships secrets of its own that need the same treatment.
- 14b's "drop the temp password" alternative (self-service password setup via an
  unauthenticated invite-token endpoint) was considered and explicitly not done —
  see the 14b note above for why.
