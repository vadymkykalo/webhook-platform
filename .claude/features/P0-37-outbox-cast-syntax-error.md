# P0-37 — Outbox publisher never publishes a single message (native-query syntax error)

- **Status:** DONE
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

- [x] Reproduce first: a repository-level test (real Postgres via
      Testcontainers, following `AbstractIntegrationTest`) that inserts a
      `PENDING` `OutboxMessage` and calls `findPendingBatchForUpdate` —
      assert it does not throw and returns the row. Confirm it fails against
      the current code with the `SQLGrammarException` / `syntax error at or
      near ":"` before touching production code.
- [x] Fix both native queries. `CAST(project_id AS text)` avoids the `::`
      colon-parsing ambiguity entirely (verified working against a live
      Postgres in the P0-02 session); prefer that over escaping the colon,
      since escaped-colon behavior is Hibernate-version-dependent.
- [x] Audit the rest of the module for the same `::` pattern inside a
      `nativeQuery = true` `@Query` — this bug class isn't unique to
      `OutboxMessageRepository` if the pattern was copy-pasted anywhere else.

## Tests to write

- [x] New `OutboxMessageRepositoryTest.java` (Testcontainers Postgres, extends
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

- [x] `OutboxPublisherService`'s scheduled poll no longer throws.
- [x] A real event sent through the API is actually delivered end to end.
- [x] `mvn test` green for `webhook-platform-api`.

## Progress log

### Що змінено

- `OutboxMessageRepository.java`: `project_id::text` → `CAST(project_id AS
  text)` в обох нативних запитах (`findPendingBatchForUpdate`,
  `findFailedMessagesForRetry`). `CAST(... AS ...)` не містить символу `:`
  узагалі, тож Hibernate-парсер іменованих параметрів native-запитів не має
  що зіпсувати — на відміну від `\:\:`-екранування, поведінка якого залежить
  від версії Hibernate.
- Аудит: `grep -rnE "[a-zA-Z_]+::[a-zA-Z]"` по `api`/`worker`/`common`/`cli` —
  жодного іншого збігу всередині `nativeQuery = true` (усі інші `::` — це
  Java method references, не SQL).
- Новий тест `OutboxMessageRepositoryTest.java`
  (`webhook-platform-api/src/test/.../OutboxMessageRepositoryTest.java`,
  `extends AbstractIntegrationTest` — реальний Postgres через Testcontainers,
  Flyway-міграції, а не Hibernate `ddl-auto=create`, щоб перевіряти саме
  продакшн-схему): 3 тести — `PENDING` рядок з `project_id`, `PENDING` рядок
  з `project_id IS NULL` (гілка `COALESCE`), `FAILED` рядок нижче
  `maxRetries`.

### Reproduce first — реальний вивід ДО фіксу

```
mvn test -pl webhook-platform-api -Dtest=OutboxMessageRepositoryTest

Tests run: 3, Failures: 0, Errors: 3, Skipped: 0
  findFailedMessagesForRetry_shouldReturnRowBelowMaxRetries » InvalidDataAccessResourceUsage
  findPendingBatchForUpdate_shouldReturnRowWithNullProjectId » InvalidDataAccessResourceUsage
  findPendingBatchForUpdate_shouldReturnRowWithProjectId » InvalidDataAccessResourceUsage
```
Причина у всіх трьох — той самий рядок SQL з реального Postgres-драйвера:
```
Caused by: org.postgresql.util.PSQLException:
ERROR: syntax error at or near ":"
  Position: 244
```
і видно сам зіпсований запит (`project_id:text`, замість `project_id::text`
в джерелі) — саме те, що описано в дефекті.

### Verification (unit + integration)

```
mvn test -pl webhook-platform-api -Dtest=OutboxMessageRepositoryTest
Tests run: 3, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Повний unit suite `webhook-platform-api` (+ `common`):
```
mvn test -pl webhook-platform-api -am -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'
Tests run: 129, Failures: 0, Errors: 0, Skipped: 0   (common)
Tests run: 293, Failures: 0, Errors: 0, Skipped: 0   (api)
BUILD SUCCESS
```
(`OutboxPublisherServiceTest` — існуючий, mock-based — теж зелений, 6/6; він
мокає репозиторій, тож ніколи не міг спіймати цей клас багів, звідси й
потреба саме в repository-тесті.)

### Manual verification — живий стек

`make up` (образи вже частково закешовані з сесії P0-02, підйом швидший).
Проєкт + endpoint на локальний Python-лічильник (`WEBHOOK_ALLOW_PRIVATE_IPS=true`
за замовчуванням), таргет — docker-мережевий gateway.

- 1 smoke-подія + пакет 30 подій через `POST /api/v1/events`.
- `docker logs webhook-platform-api-1` — **0 входжень "syntax error"** (до
  фіксу кожен цикл поллінгу `OutboxPublisherService`, раз на секунду, писав
  цю помилку в лог).
- Лічильник-приймач: **31/31 доставлено** (`received_p037.log`).

Побічно помічена (НЕ пов'язана з цим фіксом, не чіпалась): при завантаженні
повного `@SpringBootTest`-контексту `AbstractIntegrationTest` у логах
з'являється `Unexpected error occurred in scheduled task —
InvalidDataAccessApiUsageException: For queries with named parameters you
need to provide names for method parameters` з `TunnelService.expireStale`
і `DeviceAuthService.expireOldCodes` (відсутній `-parameters` javac флаг або
`@Param` на якихось методах репозиторію). Тести все одно проходять (сама
помилка лише логується, не пробрасується), тому це не блокує P0-37, але це
третя, окрема, невивчена знахідка — залишаю нотатку, не тікет (значно менш
критично: не блокує жодного продакшн-шляху, лише шумить у логах при
scheduled cleanup).

Стек лишив живим для наступної, аналогічної ручної перевірки [[P0-38]] в
цій самій сесії (той самий баг-звіт, той самий проєкт/endpoint) — приберу
його після неї.
