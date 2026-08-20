# P0-37 — Outbox publisher never publishes a single message (native-query syntax error)

- **Status:** TODO
- **Priority:** P0 — the transactional outbox never drains; zero events ever reach Kafka
- **Branch:** `feature/P0-37-outbox-cast-syntax-error`
- **Depends on:** nothing
- **Module:** `webhook-platform-api`

## The defect

Found while running the manual verification for [[P0-02]] (`.claude/features/P0-02-shutdown-message-loss.md`),
not part of the original audit.

`OutboxMessageRepository.java:22` and `:35` (`findPendingBatchForUpdate` /
`findFailedMessagesForRetry`) use a Postgres cast in a native `@Query`:

```java
ROW_NUMBER() OVER (PARTITION BY COALESCE(project_id::text, kafka_key) ORDER BY created_at ASC) AS rn_proj
```

Hibernate's native-query parameter parser scans for `:identifier` tokens to
bind named parameters (`:status`, `:maxPerKey`, ...) and does not recognize
Postgres's `::` cast operator as anything special — it matches `:text` as a
bogus parameter placeholder, strips one colon, and sends Postgres literally
`project_id:text` on the wire. Postgres rejects this:

```
ERROR: syntax error at or near ":"
Position: 244
```

`OutboxPublisherService.publishPendingMessages` (`@Scheduled`, polls every
`outbox.publisher.poll-interval-ms`, default 1000ms) calls
`findPendingBatchForUpdate` every single poll and gets this exception every
single time — logged as `TaskUtils$LoggingErrorHandler - Unexpected error
occurred in scheduled task` and swallowed by Spring's scheduling
infrastructure. **No outbox message is ever selected, so nothing is ever
published to Kafka, on any environment running this code** — every
`/api/v1/projects/{id}/events` call and every `/ingress/{token}` call
succeeds (the row is written inside the business transaction, per
`CLAUDE.md`'s "transactional outbox" design) but the event silently never
leaves the `outbox_messages` table.

## Steps

- [ ] Reproduce first: a repository-level test (real Postgres via
      Testcontainers, following `AbstractIntegrationTest`) that inserts a
      `PENDING` `OutboxMessage` and calls `findPendingBatchForUpdate` —
      assert it does not throw and returns the row. Confirm it fails against
      the current code with the `SQLGrammarException` / `syntax error at or
      near ":"` before touching production code.
- [ ] Fix both native queries. `CAST(project_id AS text)` avoids the `::`
      colon-parsing ambiguity entirely (verified working against a live
      Postgres in the P0-02 session); prefer that over escaping the colon,
      since escaped-colon behavior is Hibernate-version-dependent.
- [ ] Audit the rest of the module for the same `::` pattern inside a
      `nativeQuery = true` `@Query` — this bug class isn't unique to
      `OutboxMessageRepository` if the pattern was copy-pasted anywhere else.

## Tests to write

- New `OutboxMessageRepositoryTest.java` (Testcontainers Postgres, extends
  `AbstractIntegrationTest` or mirrors `DeliveryRepositoryTest`'s
  `@DataJpaTest` + Testcontainers pattern from `webhook-platform-worker`):
  covers `findPendingBatchForUpdate` and `findFailedMessagesForRetry`
  against a real Postgres instance, including the `COALESCE(..., kafka_key)`
  fallback path (a row with `project_id IS NULL`).

## Verification

```bash
mvn test -pl webhook-platform-api -Dtest=OutboxMessageRepositoryTest
```

Manual — this is the one that matters, it's the actual production path:
```bash
make up && make wait-healthy
# POST an event via /api/v1/projects/{id}/events
# assert it is actually delivered to a receiver you control within a few seconds
# check `docker logs` for the api service — no more "syntax error at or near ':'"
```

## Definition of done

- [ ] `OutboxPublisherService`'s scheduled poll no longer throws.
- [ ] A real event sent through the API is actually delivered end to end.
- [ ] `mvn test` green for `webhook-platform-api`.

## Progress log
