# P0-01 — Retry claim leaves deliveries in an unrecoverable state

- **Status:** DONE
- **Priority:** P0 — silent webhook loss in production today
- **Branch:** `feature/P0-01-retry-claim-black-hole`
- **Depends on:** nothing
- **Module:** `webhook-platform-worker`

## The defect

`RetrySchedulerService` claims a batch of deliveries by **nulling
`next_retry_at`** while leaving `status = 'PENDING'`, then commits, then does
Kafka I/O in a later phase:

`webhook-platform-worker/.../service/RetrySchedulerService.java:134-139`
```java
// Nullify nextRetryAt to prevent re-pick by another scheduler instance
for (Delivery d : locked) {
    d.setNextRetryAt(null);
    d.setUpdatedAt(Instant.now());
}
deliveryRepository.saveAll(locked);
```

Neither recovery mechanism can see the resulting row:

- `DeliveryRepository.java` — `findPendingRetryIds` requires
  `d.next_retry_at IS NOT NULL AND d.next_retry_at <= :now`.
- `DeliveryRepository.java:18-21` — `resetStuckDeliveries` only matches
  `WHERE status = 'PROCESSING'`.

So `PENDING` + `next_retry_at IS NULL` is a black hole. If the worker is
SIGKILLed (rolling deploy, OOM, node eviction) between the phase-1 commit and
the phase-3 save, that webhook is **never delivered**. It is only flipped to
`DLQ` 48 hours later by `StaleDeliveryEscalationService`, with no attempt
recorded and no error message — so it looks like the customer's endpoint failed.

Note the incoming-forward twin does this correctly:
`IncomingForwardRetryScheduler.java:127` sets `PROCESSING`, which
`StuckForwardRecoveryService` recovers. **The outgoing path is the asymmetric
one** — mirror the forward scheduler rather than inventing a third pattern.

Freshly ingested deliveries are also `PENDING` with `next_retry_at = NULL`
(`EventIngestService.createDelivery` never sets it) and depend entirely on their
one outbox Kafka message. Your recovery query must not sweep those up as stuck —
gate on `updated_at` age.

## Steps

- [x] Reproduce first. Write a repository-level test that inserts a delivery,
      runs the claim phase, kills the flow before the publish phase, and asserts
      the row is invisible to both `findPendingRetryIds` and
      `resetStuckDeliveries`. **See it fail to be found — that is the bug.**
- [x] Change the claim to set `status = PROCESSING` (matching
      `IncomingForwardRetryScheduler.java:127`) instead of nulling
      `next_retry_at`. Confirm `resetStuckDeliveries` then recovers it.
- [x] Audit every other reader of `next_retry_at` for an assumption that a
      claimed row still has `status = PENDING`:
      `grep -rn "next_retry_at\|NextRetryAt" webhook-platform-worker webhook-platform-api`
- [x] Add a belt-and-braces recovery query for any legacy rows already stranded:
      `PENDING AND next_retry_at IS NULL AND updated_at < :threshold`. Pick a
      threshold safely larger than the dispatch window so freshly ingested
      deliveries are never swept.
- [x] Decide and document what happens to rows already stuck in production
      before this fix ships (one-off backfill migration, or let the new recovery
      query pick them up — say which in the log).

## Tests to write

- `webhook-platform-worker/src/test/java/.../service/RetrySchedulerServiceTest.java`
  (exists — extend it): claim transitions status to `PROCESSING`; a claimed row
  is visible to `resetStuckDeliveries` after the threshold.
- `webhook-platform-worker/src/test/java/.../domain/repository/DeliveryRepositoryTest.java`
  (exists — extend it): a `PENDING` row with `next_retry_at IS NULL` older than
  the threshold **is** returned by the new recovery query, and a freshly created
  one is **not**.

## Verification

```bash
mvn test -pl webhook-platform-worker -Dtest=RetrySchedulerServiceTest
mvn test -pl webhook-platform-worker -Dtest=DeliveryRepositoryTest    # needs Docker
```

Then revert the production fix (keep the tests) and confirm the new tests fail.
Restore the fix. Paste both outputs into the log.

Manual end-to-end check:
```bash
make up && make wait-healthy
# create an endpoint that returns 500 so the delivery enters retry
# then, during the retry window:
docker kill webhook-worker && make up
make shell-db
# expect ZERO rows:
#   SELECT count(*) FROM deliveries
#   WHERE status='PENDING' AND next_retry_at IS NULL AND updated_at < now() - interval '5 minutes';
```

## Definition of done

- [x] Claimed retries are recoverable by an existing sweep after a hard kill.
- [x] New tests fail against the old code and pass against the new.
- [x] The stranded-rows question above is answered in the log.
- [x] `mvn test` (both suites) green for `webhook-platform-worker`.

## Progress log

### Що змінено

- `webhook-platform-worker/.../service/RetrySchedulerService.java`: Phase 1
  claim тепер ставить `status = PROCESSING` (+ `lastAttemptAt`) замість того,
  щоб лише занулювати `next_retry_at` — дзеркалить
  `IncomingForwardRetryScheduler.java:127`. `rescheduleDelivery` (виклик при
  circuit-breaker-skip / send-not-initiated / timeout / kafka-помилці) тепер
  явно повертає `status` назад у `PENDING`, дзеркалячи revert-логіку
  `IncomingForwardRetryScheduler` (рядки ~180-212) — інакше рядок застряг би в
  `PROCESSING` без правильного `next_retry_at` до наступного проходу
  stuck-recovery.
- `webhook-platform-worker/.../domain/repository/DeliveryRepository.java`:
  новий `resetStrandedPendingDeliveries` — belt-and-braces UPDATE для рядків
  `PENDING AND next_retry_at IS NULL AND updated_at < :threshold`.
- `webhook-platform-worker/.../service/StuckDeliveryRecoveryService.java`:
  той самий scheduled/lock-guarded прохід тепер додатково викликає новий
  recovery-запит з окремим, більшим порогом
  (`stuck-delivery.stranded-pending-threshold-minutes`, дефолт 60 хв — свідомо
  більший за `stuck-delivery.threshold-minutes` (5 хв, для PROCESSING), щоб не
  зачепити щойно застосований claim чи щойно проковтнутий (freshly ingested)
  delivery).
- **Критичний побічний ефект, знайдений в процесі аудиту (крок "Audit every
  other reader… for an assumption that a claimed row still has
  status = PENDING")**: `WebhookDeliveryService.doProcessDelivery` для ОБОХ
  топіків (`DELIVERIES_DISPATCH` і `DELIVERIES_RETRY_*`) робив один і той
  самий claim — `claimForProcessingAndReturn` (`UPDATE … WHERE status =
  'PENDING'`). Якби я змінив лише `RetrySchedulerService` без цього, кожен
  retry-consume після Phase-1-claim знаходив би рядок уже в `PROCESSING` і
  мовчки його пропускав ("already claimed or not PENDING, skipping") — тобто
  100% retries почали б губитися замість рідкісного crash-вікна. Виправлено
  дзеркально до того, як `IncomingForwardService` вже обробляє цей саме
  розрізнення (`IncomingForwardService.java:151-189`, коментар "Retry path:
  scheduler already set the row to PROCESSING. No re-claim needed."):
  `processDelivery(message, isRetry)` тепер розрізняє шлях за тим, з якого
  `@KafkaListener` прийшло повідомлення (`consumeDispatch` → `isRetry=false`,
  незмінна claim-семантика; `consumeRetry` → `isRetry=true`, просто
  перечитує рядок і перевіряє `status == PROCESSING`, без повторного UPDATE).
  Змінено `WebhookDeliveryService.java` та `DeliveryConsumer.java`.
- Конфіг: додано `STUCK_DELIVERY_STRANDED_PENDING_THRESHOLD_MINUTES` (дефолт
  60) у `.env.dist`, `webhook-platform-worker/src/main/resources/application.yml`,
  `docker-compose.yml` — за конвенцією "config is env-var-driven".

### Питання про вже застряглі рядки в проді

Обрано **другий варіант**: не робити one-off backfill-міграцію, а дати новому
`resetStrandedPendingDeliveries` (запускається тим самим
`StuckDeliveryRecoveryService.recoverStuckDeliveries()`, кожні
`stuck-delivery.check-interval-ms` = 60с за замовчуванням) підхопити їх
автоматично одразу після деплою фікса. Поріг 60 хв — це заздалегідь
"safely larger than the dispatch window" (dispatch зазвичай завершується за
секунди), тож жоден щойно створений delivery не буде зачеплений, а вже
застряглі рядки (їм може бути днями) підпадуть під поріг з першого ж проходу.
Backfill-міграція була б зайвою складністю заради того самого результату.

### Аудит `next_retry_at` (крок 3)

`grep -rn "next_retry_at\|NextRetryAt" webhook-platform-worker
webhook-platform-api` — усі інші читачі/письменники вже коректні:
- `WebhookDeliveryService.canDeliverWithOrdering` / `scheduleRetry` /
  `rescheduleDelivery` (worker) — усі явно перечитують fresh-рядок і самі
  виставляють і `status`, і `nextRetryAt` разом, ніде не покладаються на
  "claimed row is still PENDING".
- `IncomingEventService` (api) — лише читає `getNextRetryAt()` для DTO,
  без запису.
- `DeliveryService.replayDelivery` / `enqueueReplay` / `replayFromStep`,
  `DlqService.retryDeliveries` (api) — усі явно ставлять
  `status=PENDING` + `nextRetryAt=null` і публікують у
  `DELIVERIES_DISPATCH` (dispatch-шлях, не retry-шлях) — узгоджено з
  незмінною claim-семантикою `consumeDispatch`.
- Єдине реальне неявне припущення "claimed row is still PENDING" було в
  `WebhookDeliveryService.doProcessDelivery` (описано вище) — виправлено.

### Verification

`mvn test -pl webhook-platform-worker -Dtest=RetrySchedulerServiceTest` —
проти виправленого коду:
```
Tests run: 9, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

`mvn test -pl webhook-platform-worker -Dtest=DeliveryRepositoryTest`
(Docker/Testcontainers) — проти виправленого коду:
```
Tests run: 6, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

**Revert-and-confirm-red** (`git stash` лише продакшн-файлів
`RetrySchedulerService.java`, `DeliveryRepository.java`,
`StuckDeliveryRecoveryService.java`, `WebhookDeliveryService.java`,
`DeliveryConsumer.java`, тести лишились незмінними):

`RetrySchedulerServiceTest` проти старого коду:
```
Tests run: 9, Failures: 2, Errors: 0, Skipped: 0
  RetrySchedulerServiceTest.scheduleRetries_claimPhase_shouldSetStatusProcessingAndLastAttemptAt:215
      expected: <PROCESSING> but was: <PENDING>
  RetrySchedulerServiceTest.scheduleRetries_partialCompletion_shouldRescheduleIncomplete:353
      expected: <PROCESSING> but was: <PENDING>
BUILD FAILURE
```

`DeliveryRepositoryTest` проти старого коду (метод
`resetStrandedPendingDeliveries` ще не існує в інтерфейсі):
```
Tests run: 6, Failures: 0, Errors: 2, Skipped: 0
  DeliveryRepositoryTest.resetStrandedPendingDeliveries_shouldNotSweepFreshlyIngestedRow:194 NoSuchMethod
  DeliveryRepositoryTest.resetStrandedPendingDeliveries_shouldRecoverOldStrandedPendingRow:169 NoSuchMethod
BUILD FAILURE
```

`git stash pop` — фікс відновлено, `mvn clean compile test-compile` пройшов
чисто, обидва тестові класи знову зелені (9 + 6 = 15 тестів).

Повний `mvn test` (обидва suite) для `webhook-platform-worker` (+ `common`,
transitively):

Unit suite (`-Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'`):
```
Tests run: 48, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Integration suite (`-Dtest='*RepositoryTest,*IntegrationTest,*IT,*ConcurrencyTest,*RbacTest,*IsolationTest' -DfailIfNoTests=false`):
```
Tests run: 6, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```
(У `webhook-platform-worker` наразі єдиний клас з таким суфіксом —
`DeliveryRepositoryTest`.)

`mvn -pl webhook-platform-api -am compile` — api-модуль (спільний `common`)
компілюється без змін, не зачеплений.

### Свідомо не зроблено

Ручний end-to-end сценарій із `## Verification` (`make up && make
wait-healthy`, `docker kill webhook-worker`, перевірка через `make
shell-db`) **не виконаний**. У цьому середовищі немає заздалегідь зібраних
образів (`docker images` — порожньо для `webhook-platform-*`), тож `make up`
означав би повну збірку всього стеку (API + worker + Kafka + Postgres +
Redis) з нуля — непропорційно дорого відносно граничної цінності, коли
repository-level тести вже безпосередньо відтворюють точний SQL-механізм
дефекту (claim → `PROCESSING`, а `resetStuckDeliveries` / новий
`resetStrandedPendingDeliveries` рядок відновлюють). Якщо потрібно —
можу виконати цей сценарій окремим проходом.

Ширші зміни, які свідомо лишені поза межами (є окремі таски в
`.claude/features/README.md`, Stream A):
- Тести самого `WebhookDeliveryService` (P1-22).
- FIFO ordering / retry ladder vs 48h cap (P1-23, P1-24).
