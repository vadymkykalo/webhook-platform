# P0-14 — Plaintext reset tokens, a logged temp password, unsafe shipped defaults

- **Status:** IN PROGRESS
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

- [ ] Store `CryptoUtils.hashApiKey(token)`, look up by hash, for both reset and
      verification tokens.
- [ ] Write a migration for existing rows. Existing plaintext tokens cannot be
      hashed retroactively in a useful way — invalidate them and say so in the log
      (pending resets will need re-requesting; that is the correct trade).

## 14b — Temporary password written to the log

`MembershipService.java:91` — the only TODO in the entire Java codebase, and it
is a security one:
```java
// TODO: send temp password via email instead of logging
log.info("Created new user for invite: userId={}, email={}", saved.getId(), request.getEmail());
```

- [ ] Read the surrounding block and confirm what actually reaches the log today.
- [ ] Ensure the temporary password never reaches logs at any level.
- [ ] Route it through `EmailService` like the other credential flows, or drop
      the temp password entirely in favour of the existing invite-token flow —
      the latter is probably better; decide and record why.

## 14c — Shipped defaults are unsafe and the guard fires too late

`.env.dist:23` `APP_ENV=development` and `.env.dist:236`
`WEBHOOK_ALLOW_PRIVATE_IPS=true`. Both validators are no-ops outside production
(`ProductionSafetyValidator.java:52-55`, `SecurityConfigValidator.java:116`).

A self-hoster who copies `.env.dist` → `.env`, runs `make up` and points a domain
at it gets a platform where **any registered user can create an endpoint at
`http://169.254.169.254/…` and read the response**.

- [ ] Flip `.env.dist` to `WEBHOOK_ALLOW_PRIVATE_IPS=false`. Local development
      that needs private IPs should opt in explicitly.
- [ ] Move `ProductionSafetyValidator` from `ApplicationReadyEvent` (line ~50) to
      `@PostConstruct` or an `EnvironmentPostProcessor` — today it validates
      **after** the connector is bound and serving, so there is a live window on
      an insecure config. `SecurityConfigValidator` already does this correctly;
      copy that.
- [ ] Strengthen the check: it is a fixed substring denylist
      (`ProductionSafetyValidator.java:22-30, 85-91`), so
      `JWT_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` passes. Add a
      "must not equal the value in `.env.dist`" comparison plus an entropy floor,
      and extend coverage to `POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
      `MINIO_ROOT_PASSWORD`, and `CORS_ALLOWED_ORIGINS` still being localhost.

## 14d — SSRF denylist gaps

`UrlValidator.isPrivateIPv4` (lines ~96-125) covers `10/8`, `172.16/12`,
`192.168/16`, `169.254/16`, `127/8`, `0/8` but **not** `100.64.0.0/10` (CGNAT —
in-cluster traffic on EKS/GKE, and Alibaba's metadata service at
`100.100.100.200`), `192.0.0.0/24`, `198.18.0.0/15`, `224.0.0.0/4`, `240.0.0.0/4`.
`BLOCKED_HOSTS` (lines ~18-21) covers only AWS/GCP metadata.

- [ ] Add the missing CIDRs and the Azure/Alibaba/Oracle metadata addresses.
- [ ] Consider inverting to an allowlist of globally-routable unicast space —
      more robust, and note the trade-off for self-hosters who legitimately
      forward to internal services (that is what `WEBHOOK_ALLOW_PRIVATE_IPS` and
      the allowed-hosts list are for).

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

- [ ] 14a, 14b, 14c, 14d each ticked, with a note per item.
- [ ] `ProductionSafetyValidator` has tests for the first time.
- [ ] A fresh `.env.dist` copy is safe by default.

## Progress log
