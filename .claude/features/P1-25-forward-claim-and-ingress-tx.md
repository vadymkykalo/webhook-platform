# P1-25 — Incoming-forward claim + IngressService transaction scope

- **Status:** DONE (25a, 25b) — 25c and 25d out of scope for this run, see Progress log
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

- [x] Add a compare-and-set claim on the retry path — e.g.
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

- [x] Move validation, verification and replay-marking **before** the transaction
      opens. The transaction should cover only `IncomingEvent` + forward attempts
      + outbox.
- [x] Make replay marking survive-or-rollback consistent with the write — a
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

- [x] Retry duplicates cannot double-POST.
- [x] Ingress transaction covers only writes; replay markers are consistent with them.
- [ ] Timestamp-less providers have durable replay protection. (25c — out of scope for this run)
- [ ] GitLab actually works; README claim becomes true. (25d — out of scope for this run)

## Progress log

**Scope note:** this run was explicitly assigned only 25a and 25b by the
coordinator ("covers `IncomingForwardService` ... and `IngressService`
transaction scope"). 25c (durable replay protection for timestamp-less
providers) and 25d (GitLab verifier) are real, separate defects in this same
file that were **not** touched in this run — they still need a follow-up task.
Their checkboxes are left unticked above; do not read that as "attempted and
failed", it's "out of assigned scope".

### 25a — CAS fencing token on the retry path

`IncomingForwardMessage` gained a nullable `startedAt` field that doubles as a
fencing token. `IncomingForwardRetryScheduler` now truncates the stamped
`started_at` to microseconds (`Instant.now().truncatedTo(ChronoUnit.MICROS)`)
before persisting it and echoes that exact value into the Kafka message —
truncation matters because Postgres `TIMESTAMP` columns default to
microsecond precision, and comparing a full-nanosecond `Instant` against the
DB-truncated value on claim would spuriously fail to match. A new repository
method, `claimRetryForProcessing(eventId, destinationId, attemptNumber,
expectedStartedAt)`, does `UPDATE ... SET started_at = now() WHERE ...
AND status = 'PROCESSING' AND started_at = :expectedStartedAt` — only the
delivery that still sees the original token can win it. `processForward`'s
`isRetry` branch now CAS-claims on this token before calling
`attemptForward`; a duplicate delivery of the same Kafka record (offset
commit lost on rebalance, ordinary at-least-once redelivery) finds the token
already consumed and returns without dispatching. A message with no token
(rolling-deploy skew, older producer) falls back to the pre-existing
behavior rather than dropping in-flight retries.

Files:
- `webhook-platform-common/src/main/java/com/webhook/platform/common/dto/IncomingForwardMessage.java`
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/service/IncomingForwardRetryScheduler.java`
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/domain/repository/IncomingForwardAttemptRepository.java`
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/service/IncomingForwardService.java`

Reproduced first: added
`duplicateRetryMessage_secondDeliveryFailsClaim_neverEntersDispatch` against
the *unfixed* `IncomingForwardService` (temporarily reverted via `git
checkout <pre-fix-commit> -- IncomingForwardService.java`, keeping the new
DTO/repository additions so it would compile) — it failed with:
```
IncomingForwardServiceTest.duplicateRetryMessage_secondDeliveryFailsClaim_neverEntersDispatch:252
Wanted but not invoked:
attemptRepository.claimRetryForProcessing(...);
However, there were exactly 2 interactions with this mock:
attemptRepository.findByIncomingEventIdAndDestinationIdOrderByAttemptNumberDesc(...)  [x2]
```
confirming both duplicate deliveries reached the dispatch/update path
(double-POST) before the fix. Restored the fix (`git reset --hard`) and the
test passes; also added `retryMessageWithoutFencingToken_legacyProducer_stillDispatches`
covering the null-token backward-compat path.

### 25b — IngressService transaction scope + replay-marker consistency

`IngressService.receiveWebhook` no longer wraps the whole flow in one
transaction. New order: `resolveActiveSource` (token + status) →
`enforceRateLimit` (Redis) → `enforcePayloadSize` → `extractMetadata` →
`verifyAndCheckReplay` (decrypt secret, verify signature, mark replay key as
seen as a side effect of `isReplay`) → verification-mode gate → provider-ID
dedup lookup (plain read) → **only then** `transactionTemplate.execute(...
persistEventAndForwardAttempts ...)`, which is the only part that now opens a
DB transaction and covers exactly `IncomingEvent` + forward attempts +
outbox. Invalid-token, disabled-source, rate-limited, oversized-payload and
failed-verification requests never call `transactionTemplate.execute` at
all now, so they never hold a Hikari connection.

Added `ReplayDetectionService.unmark(sourceId, signature)` (Redis `DEL`).
`receiveWebhook` calls it via `releaseReplayMarkerAfterFailedPersist` in two
places: (1) the `DataIntegrityViolationException` handler, when
`handleDuplicateRace`'s dedup lookup can't resolve to an existing row (a
genuine, unrecoverable loss), and (2) the generic `RuntimeException` catch
for any other failed persist. When the race *does* resolve to an existing
row (the concurrent winner's own transaction already committed), the marker
is correctly left alone — it belongs to that persisted event.
`handleDuplicateRace` was changed to return `null` instead of re-throwing so
the caller can decide whether to release the marker.

Files:
- `webhook-platform-api/src/main/java/com/webhook/platform/api/service/IngressService.java`
- `webhook-platform-api/src/main/java/com/webhook/platform/api/service/verification/ReplayDetectionService.java`

Reproduced first: added 4 new tests, temporarily reverted `IngressService`
to its pre-fix version (keeping the new `ReplayDetectionService.unmark`
method so the suite would compile), and got:
```
IngressServiceTest.receiveWebhook_disabledSource_rejectedWithoutOpeningTransaction: FAILED
  transactionManager.getTransaction(<any>) — Never wanted here, but invoked
IngressServiceTest.receiveWebhook_invalidToken_rejectedWithoutOpeningTransaction: FAILED
  transactionManager.getTransaction(<any>) — Never wanted here, but invoked
IngressServiceTest.receiveWebhook_signatureMismatch_rejectedWithoutOpeningTransaction: FAILED
  transactionManager.getTransaction(<any>) — Never wanted here, but invoked
IngressServiceTest.receiveWebhook_failedPersistWithNoExistingRow_releasesReplayMarker: FAILED
  Wanted but not invoked: replayDetectionService.unmark(sourceId, validHmac)
  However, there was exactly 1 interaction: replayDetectionService.isReplay(...)
Tests run: 29, Failures: 4
```
confirming both consequences described in 25b: a transaction was opened for
requests that never write anything, and the replay marker was never released
after a persist that never committed. Restored the fix and all 4 pass, plus
2 more (`receiveWebhook_duplicateRaceResolvedToExistingRow_doesNotReleaseReplayMarker`,
`receiveWebhook_successfulPersist_doesNotReleaseReplayMarker`) proving the
marker is *not* released when it shouldn't be.

### Verification (run verbatim)

```
$ mvn test -pl webhook-platform-api -Dtest='IngressServiceTest,WebhookVerifierTest'
...
[INFO] Tests run: 29, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 2.323 s - in com.webhook.platform.api.service.IngressServiceTest
[INFO]
[INFO] Results:
[INFO]
[INFO] Tests run: 56, Failures: 0, Errors: 0, Skipped: 0
[INFO]
[INFO] BUILD SUCCESS

$ mvn test -pl webhook-platform-worker -Dtest=IncomingForwardServiceTest
...
[INFO] Tests run: 11, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 7.738 s - in com.webhook.platform.worker.service.IncomingForwardServiceTest
[INFO]
[INFO] Results:
[INFO]
[INFO] Tests run: 11, Failures: 0, Errors: 0, Skipped: 0
[INFO]
[INFO] BUILD SUCCESS
```

Also ran the full non-Docker unit suite for the three touched modules as a
broader regression check (not part of the task's verification block, extra
due diligence since `IncomingForwardMessage` and `ReplayDetectionService` are
shared/widely-referenced types):
```
$ mvn test -pl webhook-platform-common,webhook-platform-worker,webhook-platform-api \
    -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'
...
Webhook Platform Common: Tests run: 147, Failures: 0, Errors: 0, Skipped: 0
Webhook Platform API:    Tests run: 339, Failures: 0, Errors: 0, Skipped: 0
Webhook Platform Worker: Tests run: 80,  Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

Manual verification (`make up && make wait-healthy` + live GitLab source) was
**not** run — it only exercises 25d (GitLab verifier), which is out of scope
for this run.

### Left out / not done in this run

- **25c** (durable replay protection for timestamp-less providers) — not
  started. Needs a persistent dedup store keyed on provider event ID with a
  retention window, per the task's own suggestion (`ProviderEventIdExtractor`
  already exists). Out of scope for this run.
- **25d** (GitLab verifier) — not started. `WebhookVerifierFactory` still maps
  `GITLAB` to `GitHubVerifier`; GitLab webhooks are still rejected unless the
  source is set to `VerificationMode.NONE`. Out of scope for this run.

Both are self-contained enough to run as a direct follow-up on top of this
branch without touching 25a/25b's files again.
