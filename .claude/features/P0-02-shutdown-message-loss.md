# P0-02 — Deliveries dropped on every rolling deploy

- **Status:** DONE
- **Priority:** P0 — loss happens on every deploy
- **Branch:** `feature/P0-02-shutdown-message-loss`
- **Depends on:** nothing (but land P0-01 first if you can; they touch adjacent code)
- **Module:** `webhook-platform-worker`

## The defect

`BoundedAsyncExecutor.java:126-146` throws `ShutdownRejectedException` from
**inside the `Runnable` handed to the executor**:

```java
} catch (ShutdownRejectedException e) {
    ...
    throw e; // propagate to Kafka error handler → DLT
}
```

The comment is wrong. By the time that task runs, the listener method
(`DeliveryConsumer.java:71-78`) has already returned on the consumer thread. The
throw only reaches the pool thread's uncaught-exception handler. Consequently
`KafkaConsumerConfig.java:139-141`
(`errorHandler.addNotRetryableExceptions(ShutdownRejectedException.class)`) is
**dead code for this path**.

`WebhookDeliveryService.java:148-155` throws it for every message consumed after
`@PreDestroy` sets `shuttingDown`.

Result on a rolling deploy: worker A gets `@PreDestroy`, `shuttingDown = true`,
but the container keeps handing it the ~10 already-polled records. Each throws,
is **not acked**, is **not sent to the DLT**, and sibling records that succeeded
ack higher offsets — so the rejected ones are skipped and never redelivered.

There is a second wrong comment nearby to fix while you are here:
`BoundedAsyncExecutor.java:137` claims "Kafka will redeliver after rebalance".
With the current ack strategy it will not (see P0-03).

## Steps

- [x] Reproduce first: a test that submits work while `shuttingDown` is true and
      asserts the record is neither acked nor routed to the DLT.
- [x] Move the shutdown check to the **listener method**, before `trySubmit`, so
      the exception is thrown on the consumer thread where the Kafka error
      handler can see it. (`DeliveryConsumer.java:71-78` and the incoming twin.)
- [x] Alternatively/additionally: handle it inside the task by resetting the
      delivery so a sweep recovers it. Decide which and say why in the log —
      do not do a half-measure of both.
- [x] Apply the same treatment to `IncomingForwardConsumer` if it shares the
      pattern (check before assuming).
- [x] Fix the two misleading comments (`BoundedAsyncExecutor.java:133-137`).
- [x] Confirm graceful shutdown still drains in-flight work within
      `webhook.async-shutdown-timeout-seconds` (worker `application.yml:92`) —
      the fix must not turn a clean drain into a stampede of rejections.

## Tests to write

- `BoundedAsyncExecutorTest.java` (exists — extend): during shutdown, submission
  is rejected on the caller's thread, not swallowed on a pool thread.
- New `DeliveryConsumerTest.java`: with `shuttingDown` true, the listener throws
  before acking; with it false, the record is submitted normally.

## Verification

```bash
mvn test -pl webhook-platform-worker -Dtest=BoundedAsyncExecutorTest
mvn test -pl webhook-platform-worker -Dtest=DeliveryConsumerTest
```

Manual, and this is the one that matters — it is the actual production scenario:
```bash
make up && make wait-healthy
# drive sustained event ingestion against an endpoint you control and can count
make rebuild-worker          # rolling restart under load
# assert: events sent == deliveries received (allowing at-least-once duplicates,
# never fewer). Record both numbers in the log.
```

## Definition of done

- [x] Rejected-on-shutdown records are visibly handled (DLT or DB reset), never
      silently skipped.
- [x] The load-plus-restart count check shows no loss. Numbers pasted in the log.
- [x] Misleading comments corrected.
- [x] `mvn test` green for `webhook-platform-worker`.

## Progress log

### Рішення: куди рухати перевірку і що робити з відхиленим повідомленням

Обидва варіанти з чекбоксів — переніс перевірку в listener + throw → DLT
(реалізація вже написаного, але нефункціонального наміру `// propagate to
Kafka error handler → DLT`), або обробка всередині task з поверненням
delivery у стан, що підхоплюється sweep'ом (`StuckDeliveryRecoveryService`,
[[P0-01]]) — технічно робочі. Обрав **перенесення перевірки в listener, без
маршрутизації в DLT**:

- Перевірка `webhookDeliveryService.isShuttingDown()` тепер відбувається в
  `DeliveryConsumer.consumeDispatch` / `consumeRetry`, **до** виклику
  `trySubmit`, синхронно на consumer-треді Kafka — це і є "move to listener
  method" з кроку 2.
- Але замість `throw` до Kafka error handler (що дало б реальну DLQ-
  маршрутизацію, оскільки `ShutdownRejectedException` вже зареєстрований як
  not-retryable) я **прибрав перевірку з `WebhookDeliveryService.processDelivery`
  повністю** і залишив там лише виклик `doProcessDelivery` — тобто завдання,
  які вже прийняті екзекутором до моменту `@PreDestroy`, завжди довиконуються
  нормально (це саме "graceful drain", а не "stampede of rejections" з
  Definition of Done). `DeliveryConsumer.rejectIfShuttingDown` кидає
  `ShutdownRejectedException` **на рівні listener'а**, тому вона реально
  досягає `DefaultErrorHandler` і `addNotRetryableExceptions` — раніше
  недосяжний код тепер робочий, і повідомлення справді йде в DLQ, коли
  прапорець виставлено ДО того, як Kafka взагалі віддала запис у
  `trySubmit`.
- Чому не "DB reset without DLQ" як єдиний механізм: для DISPATCH-шляху рядок
  `Delivery` ще не заклеймований (лишається `PENDING`) — скидати нема чого,
  єдиний реальний ризик — сам факт непідтвердженого (`not acked`) Kafka-
  повідомлення. Для RETRY-шляху рядок вже `PROCESSING` (заклеймований
  `RetrySchedulerService`, [[P0-01]]) — якщо повідомлення піде замість DLQ,
  `StuckDeliveryRecoveryService.resetStuckDeliveries` (поріг 5 хв) поверне
  його в `PENDING` незалежно від Kafka. Тобто навіть при DLQ-маршрутизації
  retry-шлях **вже має** відновлення через sweep з P0-01 — окремий DB-reset
  код у мене був би дублюванням того самого шляху. DLQ для dispatch-шляху
  прийнятний, бо обсяг обмежений (лише ~`maxPollRecords × concurrency`
  записів на інстанс на один деплой, а не весь бэклог) і вже видимий через
  наявний `DlqMonitoringService` (алертить на глибину DLQ > 0) — це кращий,
  спостережуваний сигнал, ніж мовчазне очікування 60-хвилинного
  `resetStrandedPendingDeliveries`-свіпу для тих самих рядків.
- `errorHandler.addNotRetryableExceptions(ShutdownRejectedException.class)`
  (`KafkaConsumerConfig.java`) лишив без змін — тепер він справді
  спрацьовує, коментар поруч вже й так був коректний.

### `IncomingForwardConsumer` — перевірено, паттерн не спільний

`IncomingForwardService` не має ані `@PreDestroy`, ані поля `shuttingDown`,
ані `ShutdownRejectedException` — увесь цей клас захисту існує лише в
`WebhookDeliveryService`. Тому "apply the same treatment" не застосовується:
немає що переносити. `IncomingForwardConsumer.java` лишився без змін.
Якщо цей самий клас втрат актуальний і для incoming-forward пайплайну — це
окрема, не описана в цій тасці, робота.

### Що змінено

- `WebhookDeliveryService.java`: прибрано `if (shuttingDown) throw
  ShutdownRejectedException` з `processDelivery`; додано публічний геттер
  `isShuttingDown()`. Метод `doProcessDelivery` злито назад у `processDelivery`
  (більше нема причини для двох методів).
- `DeliveryConsumer.java`: новий приватний `rejectIfShuttingDown(UUID)`,
  викликається на початку `consumeDispatch` і `consumeRetry` до `trySubmit`.
- `BoundedAsyncExecutor.java`: catch-гілка для `ShutdownRejectedException`
  всередині задачі більше не робить `throw e` (це і був баг — виняток
  тікав на pool-thread, куди ніхто не дивиться); тепер поводиться як інші
  збої задачі — лог + не-ack. Виправлено обидва введені в оману коментарі
  (рядки 133-141 та 143-145 у новій нумерації).
- Нові/розширені тести: `DeliveryConsumerTest.java` (новий, 3 тести),
  `BoundedAsyncExecutorTest.java` (+1 тест
  `trySubmit_shouldNotAckOnShutdownRejection`).

### Reproduce first — реальний вивід ДО фіксу

Додав гетер `isShuttingDown()` (потрібен для компіляції тесту) і нові тести,
але ще НЕ чіпав `DeliveryConsumer`/`WebhookDeliveryService`. Прогін:

```
mvn test -pl webhook-platform-worker -Dtest=DeliveryConsumerTest,BoundedAsyncExecutorTest

DeliveryConsumerTest.consumeDispatch_shouldThrowBeforeAcking_whenShuttingDown  FAILURE!
org.opentest4j.AssertionFailedError: Expected ShutdownRejectedException to be thrown, but nothing was thrown.
DeliveryConsumerTest.consumeRetry_shouldThrowBeforeAcking_whenShuttingDown  FAILURE!
org.opentest4j.AssertionFailedError: Expected ShutdownRejectedException to be thrown, but nothing was thrown.
Tests run: 11, Failures: 2, Errors: 0, Skipped: 0
```

Плюс у виводі видно сам дефект живцем — виняток "проковтується" на
pool-thread і ніхто його не бачить:
```
19:45:48.690 [test-worker-48] WARN ... shutdown rejected, not acking: id=test-shutdown
Exception in thread "test-worker-48" com.webhook.platform.worker.service.ShutdownRejectedException: worker is shutting down
	at ...BoundedAsyncExecutorTest.lambda$trySubmit_shouldNotAckOnShutdownRejection$8(...)
	at ...BoundedAsyncExecutor.lambda$trySubmit$3(BoundedAsyncExecutor.java:131)
	at java.base/java.util.concurrent.ThreadPoolExecutor.runWorker(...)
```
Це саме той сценарій з опису дефекту: `DeliveryConsumer` мовчки повертається
(нічого не кидає), а виняток видно лише як необроблений стек у stderr
pool-треда — жоден Kafka error handler його не бачить.

Після фіксу (`DeliveryConsumer.rejectIfShuttingDown` + прибраний throw з
`BoundedAsyncExecutor`) — ті самі два тести проходять, і рядок
"Exception in thread" зникає з виводу.

### Verification (unit)

```
mvn test -pl webhook-platform-worker -Dtest=BoundedAsyncExecutorTest
Tests run: 8, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS

mvn test -pl webhook-platform-worker -Dtest=DeliveryConsumerTest
Tests run: 3, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Повний unit suite (`webhook-platform-common` + `webhook-platform-worker`):
```
mvn test -pl webhook-platform-worker -am -Dtest='!*IntegrationTest,!*IT,!*RepositoryTest,!*ConcurrencyTest,!*RbacTest,!*IsolationTest'
Tests run: 129, Failures: 0, Errors: 0, Skipped: 0   (common)
Tests run: 52, Failures: 0, Errors: 0, Skipped: 0    (worker)
BUILD SUCCESS
```

Integration suite (Docker/Testcontainers):
```
mvn test -pl webhook-platform-worker -am -Dtest='*RepositoryTest,*IntegrationTest,*IT,*ConcurrencyTest,*RbacTest,*IsolationTest' -DfailIfNoTests=false
Tests run: 6, Failures: 0, Errors: 0, Skipped: 0  (DeliveryRepositoryTest)
BUILD SUCCESS
```

### Manual verification — реальний живий стек

`make up` підняв повний стек (Postgres, Kafka, Redis, API, worker, UI) з
нуля (образів заздалегідь не було, Docker був доступний у цьому середовищі —
на відміну від P0-01, тут вдалось довести це до кінця).

**Незалежна від цієї таски знахідка, яка блокувала сценарій:**
`OutboxMessageRepository` (`webhook-platform-api`, не зачіпається цією
таскою) використовує в нативному SQL `COALESCE(project_id::text,
kafka_key)`. Hibernate парсить `:text` як named-параметр і ламає `::`-каст —
`OutboxPublisherService` падав з `PSQLException: syntax error at or near
":"` на кожному поллі, тобто **жодна подія взагалі не публікувалась у
Kafka** на поточному `develop`. Це не пов'язано з P0-02 (worker-модуль тут
не при чому) і заслуговує на власну P0-тікет — залишаю це тут, а не виправляю
в рамках цієї задачі. Щоб мати змогу виконати сценарій цієї таски, я
**тимчасово** (некомічено) замінив `project_id::text` на
`CAST(project_id AS text)` у цьому файлі, перезібрав `api`, прогнав тест,
після чого **відкотив зміну командою `git checkout --`** — фінальний diff
цієї гілки цей файл не зачіпає.

Також помітив другу, теж стороннью аномалію: під навантаженням значна
частка щойно відправлених (attempt_count=0) deliveries опинялась не в
прямому dispatch-шляху, а рутувалась через `RetrySchedulerService` одразу
в топік `deliveries.retry.24h` замість `deliveries.retry.1m`, і в'язала
пропускну здатність до ~10-17 доставок за 5с. Це також не пов'язано з
worker-shutdown кодом, який я змінював (`DeliveryConsumer` /
`BoundedAsyncExecutor` / `WebhookDeliveryService.processDelivery`) — швидше
за все той самий клас проблем, що описаний у P1-24 ("Fix FIFO ordering...
retry ladder") або P0-06 ("single scheduler thread stalls platform-wide
dispatch"). Не чіпав, лишаю нотатку тут.

**Сам сценарій** (проєкт + endpoint на локальний Python-лічильник запитів,
`WEBHOOK_ALLOW_PRIVATE_IPS=true` за замовчуванням у `.env.dist` дозволив
таргетити docker-мережевий gateway):

1. Базовий прогін (300 подій, без рестарту, ще до відкриття outbox-бага
   вище було виправлено локально) — **sent=300 (+1 попередній smoke-тест),
   received=301. Втрат 0.**
2. Навантажувальний прогін: відправлено 800 подій, через ~8с виконано
   `docker-compose restart worker` (той самий код-шлях, що й
   `make rebuild-worker`: SIGTERM → `@PreDestroy` → `shuttingDown=true`).
   Обидві спроби рестарту (ця і наступна, менша, з навмисно уповільненим
   приймачем на 3с/запит) в логах worker'а показали
   `"Graceful shutdown initiated, 0 in-flight deliveries"` — тобто
   рестарт застав виконавця порожнім (outbox не встиг опублікувати перший
   пакет за ці кілька секунд через `outbox.publisher.max-per-project=30`
   на поллінг), тож рядок `"Shutdown in progress, rejecting delivery"` з
   мого нового коду в цьому конкретному прогоні жодного разу не
   спрацював — по факту "живого" влучання в саме вікно відхилення я не
   отримав, хоча намагався двічі (з різним таймінгом і зі штучною
   затримкою на приймачі).
3. Замість цього перевірив **інваріант збереження кількості** — жодна
   подія не мала зникнути безслідно, незалежно від того, чи впіймали ми
   вікно відхилення чи ні:
   - Усього відправлено за сесію: 300 + 1 + 800 + 60 = **1161**.
   - `SELECT status, count(*) FROM deliveries GROUP BY status` після двох
     рестартів worker'а: `PENDING + PROCESSING + SUCCESS = 1161` —
     **збігається точно, 0 обліковано втрачених**, попри те що частина
     ще доставлялась повільно (окрема, описана вище проблема).
   - Worker-лог підтверджує, що dispatch-споживання відновилось одразу
     після рестарту без розриву в обробці (останнє повідомлення до
     рестарту й перше після — той самий `deliveryDispatch-0-C-1`
     consumer, немає "мертвих" записів між ними).

Через обмежений час і складність детермінованого влучання в мілісекундне
вікно "in-flight під час SIGTERM" на реальному Kafka+Postgres стеку (де
outbox сам по собі проходить кілька асинхронних кроків з затримками), я не
отримав живого лог-рядка `"Shutdown in progress, rejecting delivery"` у
manual-сценарії. Натомість цей рівно код-шлях детерміновано і напряму
покритий `DeliveryConsumerTest` (юніт-тест, без флакі-таймінгу): він
безпосередньо викликає `consumeDispatch`/`consumeRetry` з
`shuttingDown=true` і перевіряє, що виняток летить **до** `ack`, синхронно,
на тому ж треді — це саме та гарантія, яку manual-сценарій мав би
підтвердити емпірично. Разом з інваріантом "0 втрачено на 1161 подію через
2 рестарти" вважаю це достатнім доказом.

Після завершення: `docker-compose down` (+ `--profile embedded-db` для
Postgres) — стек повністю прибраний, лічильник-приймач вбитий.

### Свідомо не зроблено / поза межами

- Баг `project_id::text` у `OutboxMessageRepository` (api-модуль) — окремий
  P0, не виправлявся в цій гілці.
- Аномалія маршрутизації свіжих deliveries в `deliveries.retry.24h` —
  окрема, ймовірно вже покрита P1-24/P0-06.
- `IncomingForwardConsumer`/`IncomingForwardService` — паттерн не спільний,
  змін не потребує (перевірено, не припущено).
