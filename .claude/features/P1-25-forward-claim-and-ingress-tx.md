# P1-25 — Incoming-forward claim + IngressService transaction scope

- **Status:** IN PROGRESS
- **Priority:** P1
- **Branch:** `feature/P1-25-forward-claim-and-ingress-tx`
- **Depends on:** nothing
- **Module:** `webhook-platform-worker`, `webhook-platform-api`

## 25a — Duplicate Kafka delivery causes a duplicate POST

`IncomingForwardService.java:175-178` — the `else if (isRetry)` branch takes
`attemptNumber` from the message and calls `attemptForward` directly. The comment
at ~158-160 says "No re-claim needed" because the scheduler already set
`PROCESSING`.

That reasoning holds only if the record is delivered exactly once. It is not:
`IncomingForwardRetryScheduler` publishes the retry, the offset commit is lost on
a rebalance (ordinary at-least-once), the record is re-consumed, and **both copies
POST to the destination**. The outgoing path is immune because it always goes
through `claimForProcessingAndReturn` (`WebhookDeliveryService.java:160`).

Mitigated only by the `Idempotency-Key` header, which the destination may ignore.

- [ ] Add a compare-and-set claim on the retry path — e.g.
      `WHERE status='PROCESSING' AND started_at = :expected` — or claim on the
      consumer side the way the dispatch path does. Prefer making it match the
      outgoing path rather than inventing a third pattern.

## 25b — IngressService holds a transaction across verification and Redis

`IngressService.java:103` wraps the **entire** `doReceiveWebhook` in a
transaction: token lookup, Redis rate limit (~137), payload size check, secret
decryption and signature verification (~169-180), Redis replay detection (~186),
and only then the writes (~236, ~290-291).

Two consequences:

- A burst of invalid-token or rate-limited requests each holds a Hikari
  connection (API pool = 30) for the duration of two Redis round trips — for
  requests that never write anything. That is a cheap DoS on your connection pool.
- `replayDetectionService.isReplay` marks the signature as seen, and then the
  transaction can roll back on the duplicate-race path (~106-126). The provider's
  legitimate re-send is then rejected as a replay attack **and the event is lost**.

- [ ] Move validation, verification and replay-marking **before** the transaction
      opens. The transaction should cover only `IncomingEvent` + forward attempts
      + outbox.
- [ ] Make replay marking survive-or-rollback consistent with the write — a
      signature must not be burned for an event that was never persisted.

## 25c — Replay protection expires before the signature does

`ReplayDetectionService.java:21` — `REPLAY_CACHE_TTL = 5 minutes`, keyed on the
signature. Stripe and Slack enforce their own 300s timestamp tolerance so their
windows match. But **GitHub/GitLab, Shopify and generic HMAC sign only the body**
— the signature never expires. Once the Redis key ages out at T+5min, a captured
request replays successfully forever.

- [ ] For signature schemes with no embedded timestamp, dedupe on the provider
      event ID — `ProviderEventIdExtractor` already exists — with a retention
      window matching your idempotency guarantee, and persist it rather than
      relying on a 5-minute Redis TTL.

## 25d — GitLab sources are wired to the GitHub verifier

`WebhookVerifierFactory.java:50` — `case GITHUB, GITLAB -> new GitHubVerifier();`

GitLab does not send `X-Hub-Signature-256`; it sends a plain shared secret in
`X-Gitlab-Token`. `GitHubVerifier` fails closed on the missing header, so this is
not directly exploitable — but **every GitLab webhook is rejected**, and the only
way a user can make GitLab work is to set `VerificationMode.NONE`, converting a
config bug into an unauthenticated ingress endpoint. The README advertises GitLab
support.

- [ ] Implement `GitLabVerifier` doing a constant-time compare of `X-Gitlab-Token`
      (use `MessageDigest.isEqual`, as every other verifier in this package does).
- [ ] Register it in `WebhookVerifierFactory`.

## Tests to write

- Extend `IncomingForwardServiceTest`: a duplicated retry message results in
  exactly one POST.
- Extend `IngressServiceTest` (699 LOC, the largest test in the repo — follow its
  conventions): a rolled-back ingest does not burn the replay marker; an invalid
  token is rejected without opening a transaction.
- Extend `WebhookVerifierTest`: GitLab accepts a valid `X-Gitlab-Token` and
  rejects a wrong one; a captured GitHub signature is rejected on replay beyond
  the dedupe window.

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest='IngressServiceTest,WebhookVerifierTest'
mvn test -pl webhook-platform-worker -Dtest=IncomingForwardServiceTest
```

Manual:
```bash
make up && make wait-healthy
# create a GITLAB incoming source, send a request with X-Gitlab-Token
# expect 202, not 401
```

## Definition of done

- [ ] Retry duplicates cannot double-POST.
- [ ] Ingress transaction covers only writes; replay markers are consistent with them.
- [ ] Timestamp-less providers have durable replay protection.
- [ ] GitLab actually works; README claim becomes true.

## Progress log
