# 0001 — Both delivery pipelines publish to Kafka through a transactional outbox

**Status:** Accepted

## Context

Two independent entry points create work that a worker must later perform over HTTP:
`POST /api/v1/projects/{id}/events` (outgoing) and `POST /ingress/{token}` (incoming).
Both must persist rows (`events` + `deliveries`, or `incoming_events` +
`incoming_forward_attempts`) *and* hand the work to Kafka.

Doing both inside one business transaction has no correct ordering. Publish first and the
transaction may roll back, leaving a Kafka record pointing at a row that does not exist.
Publish last and the broker may be unreachable after the commit, silently dropping work
that the caller was already told was accepted. Neither failure is observable at the call
site, and for a webhook platform "accepted but never delivered" is the one outcome that
destroys trust in the product.

## Decision

Nothing is published to Kafka from inside a business transaction. Both pipelines write an
`outbox_messages` row in the same transaction as their domain rows.
`OutboxPublisherService` is a scheduled poller that claims a batch (`SELECT … FOR UPDATE`,
mark `SENDING`, commit immediately), sends it, and then records the outcome — so a crash
mid-send leaves rows in `SENDING`, recovered after
`outbox.publisher.sending-recovery-seconds`.

The poller is ShedLock-guarded (`outbox-publisher`) so only one API instance drains at a
time, and applies a per-project fairness cap (`outbox.publisher.max-per-project`, default
30) so one noisy project cannot starve the rest of a batch.

## Consequences

- Delivery becomes at-least-once end to end. Consumers must be idempotent; the platform
  sends a stable `Idempotency-Key` header on every attempt so receivers can be too.
- Ingest latency no longer depends on Kafka availability. An outage degrades to queue
  growth, visible as `outbox_queue_depth` and `outbox_oldest_pending_age_seconds`.
- A polling delay is added to the happy path (`outbox.publisher.poll-interval-ms`,
  default 1s). Accepted: a webhook is not a synchronous RPC.
- The outbox table is a hot table and needs its own retention
  (`outbox.publisher.dead-retention-days`) and indexes (`V047`).
- Every new asynchronous side effect has to go through the outbox too, or it silently
  reintroduces the failure mode this ADR exists to prevent — `workflow_trigger_outbox`
  (`V043`) is the second instance of the same pattern.

## Alternatives rejected

- **Publish inside the transaction, rely on Kafka transactions.** Would require a
  Kafka-Postgres XA-style coordination the stack does not have, and still leaves the
  API's own commit outside the broker's transaction.
- **`@TransactionalEventListener(AFTER_COMMIT)` publishing to Kafka.** The gap between
  commit and publish is unrecoverable: a JVM crash there loses the work with no durable
  trace. That is exactly the case the outbox row covers.
- **Debezium / log-based CDC.** Removes the poller, but adds Kafka Connect and a
  replication slot to a product whose main selling point is `docker compose up`. Revisit
  if outbox poll latency ever becomes the dominant cost.
