# 0004 — A delivery row is owned by a claim token, not by its status

**Status:** Accepted

## Context

A delivery is claimed by flipping `status` to `PROCESSING`, and every finalizer
(`markAsSuccess`, `markAsFailed`, `scheduleRetry`) re-reads the row before writing and
guards on it still being `PROCESSING`.

That guard is not sufficient. `StuckDeliveryRecoveryService` sweeps rows that have been
`PROCESSING` past a threshold and returns them to `PENDING`, at which point a different
attempt can claim the same row and set it to `PROCESSING` again. The original attempt —
slow, not dead — then returns from its HTTP call, sees `PROCESSING`, and finalizes a row it
no longer owns. The attempt that actually holds the claim proceeds to deliver as well, and
the receiver sees the webhook twice.

The same shape appeared independently on the incoming side, where
`IncomingForwardAttempt` has no `@Version` at all, so nothing surfaced the conflicting
write.

## Decision

`deliveries.claim_token` (`V055`) holds a UUID stamped at claim time.
`claimForProcessingAndReturn` performs the claim and read as one `UPDATE … RETURNING`, and
every finalizer compares the token on the freshly-read row against the token the attempt
holds (`stillHoldsClaim`). A mismatch means the row was reclaimed; the late attempt logs
and does nothing.

The incoming pipeline mirrors this: `claimRetryForProcessing` CASes on `started_at`, and
`updateAttempt` refuses a row that is no longer `PROCESSING` and reports whether it
applied, so callers create the `PENDING` successor only when it did.

## Consequences

- Both null tokens is treated as a match, on purpose. During a rolling deploy, rows
  claimed by a pre-`V055` instance carry no token; rejecting them would strand every
  in-flight delivery of the older instances until the stuck sweep caught up. What is
  rejected is the *mismatch* — a row carrying a token the attempt does not hold.
- Every new write path to a claimed row must go through the same check. The retry
  scheduler learned this the hard way: its Phase 3 re-saved successfully dispatched rows
  over what the consumer had already written, which also reset the field the fencing CAS
  depends on.
- `StuckDeliveryRecoveryService`'s threshold can now be made aggressive without risking
  duplicate delivery, because a reclaimed row is safe by construction rather than by
  timing.

## Alternatives rejected

- **`@Version` optimistic locking alone.** It detects the conflict at flush time, but the
  loser's exception surfaces as a failed delivery rather than as "somebody else owns
  this". It also does not help the incoming attempt rows, which are inserted rather than
  updated in the contended path.
- **Hold a row lock for the duration of the HTTP call.** Ties a Postgres connection to a
  destination's response time; a slow endpoint would exhaust the pool.
