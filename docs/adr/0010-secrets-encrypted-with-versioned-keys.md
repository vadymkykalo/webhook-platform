# 0010 — Secrets at rest use AES-256-GCM with versioned keys

**Status:** Accepted

## Context

The platform stores secrets it must be able to *use*, not merely verify: endpoint signing
secrets (needed to compute every outgoing `X-Signature`), incoming source secrets (needed
to verify inbound provider signatures) and destination auth credentials. Hashing is
therefore not an option for any of them.

Operators need to be able to rotate the master key without downtime and without a
big-bang re-encryption of every row.

## Decision

AES-256-GCM, with the key identified by a version stored alongside the ciphertext.
`EncryptionKeyRegistry` resolves a version to a key; `EncryptionKeyRotationService`
re-encrypts rows onto the current version in the background (`V039`). GCM is used for
authenticated encryption — a tampered ciphertext fails to decrypt rather than producing
garbage plaintext.

Nothing in this set is ever persisted in plaintext, and no code path may reach a raw key
directly instead of going through the registry. That last rule is load-bearing: the
delivery dry-run endpoint used `CryptoUtils` with a raw key carrying a shipped development
default, and was blind to key versions entirely, until it was moved onto the registry.

`ProductionSafetyValidator` refuses to start with `APP_ENV=production` if a secret is one
of the values `.env.dist` ships, or if its Shannon-entropy estimate is under 40 bits. It
runs from `@PostConstruct` rather than `ApplicationReadyEvent` — the latter fires after the
connector is already bound, leaving a window in which an insecure configuration is
reachable.

## Consequences

- Rotation is incremental and online. Old ciphertext stays readable for as long as its key
  version remains in the registry.
- **Losing a key version whose rows are not yet re-encrypted makes those secrets
  unrecoverable.** Key material has to be backed up on the same schedule as the database;
  see `docs/runbooks/secret-rotation.md`.
- A key rotated away mid-flight is a real failure mode on the delivery path — the
  concurrency-permit `finally` in `WebhookDeliveryService.attemptDelivery` exists partly
  because `decryptSecret` can throw before the HTTP call is ever made.
- Endpoint secret rotation additionally keeps the previous secret for a grace period
  (`secret_previous_encrypted`, `secret_rotation_grace_period_hours`) so receivers can
  accept either during a rollout.

## Alternatives rejected

- **An external KMS / Vault as the only backend.** Would be a hard dependency for a
  product whose main promise is `docker compose up` with two files. The registry
  abstraction leaves room to add one as an additional key source.
- **A single unversioned master key.** Rotation becomes a full-table re-encryption with no
  way to read anything written before it, i.e. downtime.
- **AES-CBC + separate HMAC.** GCM gives authenticated encryption in one primitive with
  fewer ways to assemble it wrongly.
