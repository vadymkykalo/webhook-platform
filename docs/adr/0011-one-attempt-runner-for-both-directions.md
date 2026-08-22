# 0011 — One Attempt Runner owns the attempt lifecycle for both directions

**Status:** Accepted — not yet implemented

## Context

The Incoming forward pipeline was created by copying the Outgoing delivery pipeline. Both
run the same lifecycle: take a Claim, admit or defer, transform the payload, send one HTTP
request, classify the result, finalise under a fence, and either schedule the next Attempt
or abandon to DLQ.

Because they are two copies, a fix to one is not a fix to the other, and the divergence is
not theoretical:

- Commit `2070d30` hand-ported four separate fixes from Outgoing to Incoming. They landed
  in four different zones — the HTTP send, the finalisation, the retry scheduler and the
  Kafka consumer — so the drift is spread across the whole lifecycle rather than
  concentrated in one place.
- The two deferral backoffs — used when an Attempt is turned away by a rate limit or a
  concurrency cap rather than made — used different curves: Outgoing shifted to `1<<10`
  with ±25% jitter, Incoming to `1<<6` with 50–150% jitter. Nothing intended that.
- Outgoing validated at startup that its Retry Ladder fits inside the escalation hard cap.
  Incoming had no equivalent check.
- Each direction carried its own private copy of the ladder arithmetic, and each answered a
  malformed `retry_delays` by logging a warning and substituting a hardcoded array of its
  own — two arrays that did not agree with each other.

The two directions do genuinely differ, and one difference is load-bearing: **they record
Attempts differently**. Outgoing mutates a single `deliveries` row in place and appends a
log to `delivery_attempts`. Incoming creates one `incoming_forward_attempts` row per
Attempt and inserts a successor. Both shapes are exposed through API DTOs, controllers, UI
pages and usage aggregation, so neither can be migrated onto the other without a breaking
API change and a data migration across two partitioned tables.

## Decision

Introduce an **Attempt Runner**: one module owning what happens during an Attempt and in
what order. Each direction supplies an **Attempt Store** adapter. Two adapters, so the
seam is real rather than hypothetical.

The Runner owns:

- the order of operations, and the fence discipline around them;
- classification of an HTTP result into success, retryable failure, or terminal failure;
- the Retry Ladder — exhaustion and next-Attempt timing — via one shared implementation;
- the rule that a failed payload transformation is retryable and must never let the raw
  payload leave the platform;
- URL validation, performed after the Claim is taken and before any admission permit is
  acquired, failing terminally.

The Attempt Store owns:

- how a Claim is taken, proved and released, behind an **opaque handle**. The Runner never
  inspects it. Outgoing fences on a `claim_token` UUID, Incoming CASes on `started_at`;
  both already work, and unifying them would buy nothing but a migration and a
  rolling-deploy compatibility window.
- how an Attempt is recorded and how a successor is created;
- **admission**, expressed as a third Claim outcome: `Claimed | NotClaimed | Deferred`.

Request construction stays in the adapter — signing, mTLS client selection and Destination
auth headers are honestly different — except the payload transformation itself, which the
Runner performs from a raw payload and template the adapter supplies.

The Kafka consumers keep their own `@KafkaListener` declarations (topics, factory and
group differ) and delegate the backpressure decision to one shared collaborator. The two
retry schedulers stay separate: `RetrySchedulerService` carries an AIMD `RetryGovernor`
with batching that the Incoming scheduler has no counterpart for, so a shared interface
there would sit over an emptiness.

### Ordering is an admission outcome, not a stage

Parking a Delivery for ordering already sets it back to `PENDING`, clears the claim token
and stamps `next_retry_at` — that is precisely "the Claim was released without an Attempt".
So the Ordering Buffer check lives inside the Outgoing Attempt Store's claim, returning
`Deferred`. The Runner never learns the word *ordering*, and Incoming simply never defers
for that reason.

The rejected shape was an optional admission gate collaborator with a no-op passed by
Incoming: one real adapter and one stub is a hypothetical seam. The other rejected shape
left ordering in the Outgoing pipeline outside the Runner, which would have given the same
row two owners of its claimed state.

## Consequences

- A race fixed in the lifecycle is fixed for both directions. That is the whole return on
  this change, and the four hand-ported fixes are the evidence it is owed.
- **The two directions keep different ladder values, and that is deliberate.** An earlier
  draft of this ADR called the difference an oversight and proposed aligning them. That was
  wrong: outgoing's 7 attempts over six tiers to 24h and incoming's 5 over five tiers to 6h
  are each stated identically in three independent places — the Flyway column default, the
  api service that creates the row, and the worker's fallback. Three consistent statements
  are a decision, and aligning them would have changed the delivery promise for every
  existing Destination without anyone asking. What is shared is the *shape* of the policy —
  parsing, tier clamping, jitter, exhaustion, hard-cap fit — in
  `common`'s `RetryLadder`. The values stay data on the row, and the per-direction defaults
  are declared once in `RetryLadderDefaults`.
- Metric names stay exactly as they are — `webhook_delivery_attempts_total` and
  `incoming_forward_attempts_total` — even though the Runner now emits both. Renaming a
  metric family inside a refactor would break dashboards and alert rules, which is the one
  place a refactor must not surprise an operator.
- The Attempt Store interface is the test surface. Lifecycle invariants get one suite
  against a fake store; only what is genuinely direction-specific — signing, ordering, auth
  headers — keeps a direction-specific test.
- Both existing pipeline suites stay green through the move and their now-duplicated halves
  are deleted before merge. `DeliveryEndToEndIntegrationTest` must pass untouched: it
  describes end-to-end behaviour, so if it needs editing, the seam is in the wrong place.
- Both directions land in one pull request. A strangler migration would leave two
  implementations alive, and their coexistence is the defect being repaired.

## Implemented ahead of the Runner

The Retry Ladder was pulled out first, because it is self-contained and because the
inspection above turned up defects that had nothing to do with the Runner:

- `RetryLadder` and `RetryLadderDefaults` in `common`, replacing thirteen scattered string
  literals and both worker fallback arrays.
- No fallback anywhere. A malformed ladder is rejected by the api on create and update with
  a message naming the field and the offending tier, and parsed strictly by the worker.
- `RETRY_LADDER_DEFAULT_DELAYS_SECONDS` and `RETRY_LADDER_DEFAULT_MAX_ATTEMPTS` removed.
  They read as though they set the default ladder; all they ever did was change what the
  startup cap check compared against, so lowering one made the check pass while live rows
  still carried the long ladder. See `UPGRADING.md`.
- The startup cap check now validates both directions against the declared defaults.
- The deferral backoff is shared, so both directions back off on the same curve.
- `SchemaRetryLadderDefaultsTest` fails the build if a Flyway column default drifts from the
  Java constant it mirrors.

## Known gaps this decision deliberately does not close

Both are real and both belong in their own change, because they alter what operators see:

- **Incoming is un-alerted.** `incoming_forward_attempts_total` and
  `incoming_forward_latency_ms` appear in no rule in `deploy/prometheus/alerts.yml`,
  `monitoring/prometheus/alerts.yml` or `prometheusrule.yaml`.
- **Incoming DLQ is invisible.** `DlqMonitoringService` counts only `deliveries` DLQ rows
  and only watches the `deliveries.dlq` topic. A DLQ'd Forward writes its row status and
  nothing else. `KafkaTopics.INCOMING_FORWARD_DLQ` exists and is created by the Makefile
  and docker-compose, but nothing produces a business notification to it — it serves only
  as the listener container's poison-record topic. (`deliveries.dlq` serves both roles, so
  it carries a mix of poison records and `DeliveryMessage` notifications.)

## Alternatives rejected

- **A narrow seam over send-and-classify only.** Of the four hand-ported fixes exactly one
  lived there. The invariant that cost a duplicated successful webhook — *create the
  successor only if the finalisation applied* — is a policy invariant sitting in
  finalisation, and a narrow seam leaves it duplicated.
- **A parity ratchet test instead of a module.** Cheaper, and it freezes the duplication
  permanently rather than repaying it. Reasonable for entity mappings (ADR-0002), wrong
  for behaviour.
- **Unifying the two Attempt record shapes.** Blocked by the public API and UI, as above.
- **An abstract consumer base class.** The `@KafkaListener` declarations have to be written
  per consumer regardless, so inheritance would share only a method body while pulling the
  parent's whole field set into both subclasses.
