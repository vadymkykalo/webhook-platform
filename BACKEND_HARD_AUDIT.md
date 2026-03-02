# Backend Hard Audit — Webhook Platform
**Дата:** Березень 2026 | **Роль:** Principal Backend Engineer | **Ціль:** High-load production readiness

---

## A) Загальна оцінка готовності бекенду (0–10)

| Категорія | Оцінка | Коментар |
|-----------|--------|----------|
| **Scalability** | 7/10 | Kafka + outbox правильні, але outbox publisher — single-threaded polling, concurrency=3 hardcoded, відсутній батчинг DB writes у worker |
| **Reliability** | 7.5/10 | At-least-once через outbox, circuit breaker, graceful shutdown, але є race conditions у status transitions та outbox retry без jitter |
| **Security** | 8.5/10 | AES-GCM, SSRF protection, RBAC, rate limiting, production safety validator — дуже добре; мінорні зауваження |

**Загальна оцінка: 7.5 / 10** — Солідна база, але потребує hardening для millions/day під навантаженням.

---

## 1) Архітектура та runtime model

### 1.1 Карта модулів

```
webhook-platform-api/     — Spring Boot REST API (port 8080)
  ├── controller/          — 14+ REST контролерів (AuthContext-based)
  ├── service/             — EventIngestService, OutboxPublisherService, IngressService,
  │                          ReplayService, DataRetentionService, SchemaRegistryService
  ├── filter/              — CorrelationIdFilter, RequestSizeLimitFilter,
  │                          JwtAuthenticationFilter, ApiKeyAuthenticationFilter
  ├── domain/              — JPA entities + repositories (API-side copies)
  └── config/              — KafkaProducerConfig, SecurityConfig, WebConfig

webhook-platform-worker/  — Spring Boot Kafka consumer (port 8081)
  ├── consumer/            — DeliveryConsumer, IncomingForwardConsumer
  ├── service/             — WebhookDeliveryService (591 LOC), RetrySchedulerService,
  │                          CircuitBreakerService, OrderingBufferService,
  │                          IncomingForwardService, StuckDeliveryRecoveryService
  ├── domain/              — JPA entities + repositories (Worker-side copies)
  └── config/              — KafkaConsumerConfig, KafkaProducerConfig, RedisConfig

webhook-platform-common/  — Shared DTOs, CryptoUtils, WebhookSignatureUtils, UrlValidator, KafkaTopics
```

### 1.2 Потік даних (outgoing)

```
POST /api/v1/events (API Key auth)
  → EventController.ingestEvent()
    → RedisRateLimiterService.tryAcquire(projectId)     [Redis / local fallback]
    → EventIngestService.ingestEvent()                   [TransactionTemplate]
      → findByProjectIdAndIdempotencyKey()               [dedup check]
      → eventRepository.saveAndFlush(event)
      → subscriptionRepository.findByProjectIdAndEnabledTrue()
        → EventTypeMatcher.matches() filter
      → FOR EACH subscription:
          deliveryRepository.save(delivery)
          outboxMessageRepository.save(outboxMessage)    [same TX]

OutboxPublisherService (@Scheduled fixedDelay=1000ms)
  → findPendingBatchForUpdate(PENDING, 100)              [SELECT FOR UPDATE SKIP LOCKED]
  → FOR EACH: kafkaTemplate.send().get(10, SECONDS)      [sync, blocking!]
  → markAsPublished / markAsFailed

DeliveryConsumer (@KafkaListener topics=deliveries.dispatch, concurrency=3)
  → WebhookDeliveryService.processDelivery()
    → deliveryRepository.findById()
    → Circuit breaker check (Resilience4j per endpoint)
    → Rate limit check (Redis per endpoint)
    → Concurrency control (Redis semaphore per endpoint)
    → SSRF URL validation
    → Decrypt secret (AES-GCM)
    → PayloadTransformService.transform() (JSONPath)
    → HMAC-SHA256 signature
    → WebClient.post().block()                           [blocking reactive!]
    → handleResponse → saveAttempt + markAsSuccess / scheduleRetry / DLQ

RetrySchedulerService (@Scheduled fixedDelay=10000ms)
  → findPendingRetriesForUpdate(PENDING, now, 100)       [SELECT FOR UPDATE SKIP LOCKED]
  → kafkaTemplate.send() async → batch confirmation
  → Tiered topics: 1m → 5m → 15m → 1h → 6h → 24h
```

### 1.3 Потік даних (incoming)

```
POST /ingress/{token} (no auth — public endpoint)
  → IngressController → IngressService.receiveWebhook()
    → sourceRepository.findByIngressPathToken()
    → Rate limit per source (Redis)
    → Payload size check
    → Signature verification (Strategy pattern: GitHub/Stripe/Slack/Shopify/GenericHMAC)
    → eventRepository.save(incomingEvent)
    → FOR EACH destination:
        forwardAttemptRepository.save()
        outboxMessageRepository.save()                   [same TX]

→ OutboxPublisher → Kafka incoming.forward.dispatch
→ IncomingForwardConsumer → IncomingForwardService → HTTP POST with auth
```

### 1.4 Async / Background компоненти

| Компонент | Інтервал | Lock | Модуль |
|-----------|----------|------|--------|
| OutboxPublisherService | 1000ms | Нема (ShedLock не знайдено!) | API |
| OutboxPublisherService.retryFailed | 30000ms | Нема | API |
| RetrySchedulerService | 10000ms | ROW-LEVEL (SKIP LOCKED) | Worker |
| StuckDeliveryRecoveryService | 60000ms | Нема | Worker |
| DlqMonitoringService | 60000ms | Нема | Worker |
| DataRetentionService | cron 2 AM | ShedLock | API |
| TestEndpointCleanupService | 3600000ms | — | API |
| IncomingForwardRetryService | 10000ms | — | Worker |

---

## 2) Top 10 P0 Issues — Критичні production blockers

### P0-1. OutboxPublisherService — synchronous Kafka send блокує поллінг (Effort: S)

**Файл:** `webhook-platform-api/.../service/OutboxPublisherService.java:136`
```java
kafkaTemplate.send(record).get(10, TimeUnit.SECONDS);  // BLOCKING!
```

**Проблема:** Кожне повідомлення відправляється синхронно з `.get(10s)`. При batch=100 і затримці Kafka 50ms = **5 секунд** на батч. При Kafka degradation (timeout 10s per message) = **16 хвилин** на батч. Outbox стає bottleneck всієї системи. Нові event'и накопичуються.

**Фікс:** Відправляти всі повідомлення в batch async (як вже зроблено в `RetrySchedulerService`):
```java
Map<UUID, CompletableFuture<SendResult>> futures = new HashMap<>();
for (OutboxMessage msg : batch) {
    futures.put(msg.getId(), kafkaTemplate.send(record));
}
CompletableFuture.allOf(futures.values().toArray(new CompletableFuture[0]))
    .get(30, TimeUnit.SECONDS);
// потім перевірити кожен future
```

---

### P0-2. OutboxPublisherService без distributed lock — дублікати при scale-out API (Effort: S)

**Файл:** `webhook-platform-api/.../service/OutboxPublisherService.java:46-48`

**Проблема:** `@Scheduled` + `@Transactional` — але **немає ShedLock**. Якщо запущено 2+ інстанси API, обидва будуть паралельно поллити outbox. `SELECT FOR UPDATE SKIP LOCKED` запобігає подвійній обробці одного рядка, але **збільшує контенцію** і створює overhead. На відміну від `DataRetentionService`, де ShedLock є.

**Фікс:** Додати `@SchedulerLock(name = "outbox-publisher", lockAtLeastFor = "PT1S", lockAtMostFor = "PT30S")`.

---

### P0-3. Race condition: status transition PENDING → PROCESSING без optimistic lock (Effort: M)

**Файл:** `webhook-platform-worker/.../service/WebhookDeliveryService.java:210-213`
```java
delivery.setStatus(Delivery.DeliveryStatus.PROCESSING);
delivery.setAttemptCount(delivery.getAttemptCount() + 1);
deliveryRepository.save(delivery);
```

**Проблема:** Між `findById()` (рядок 159) і `save()` (рядок 213) немає ні `@Version`, ні `SELECT FOR UPDATE`. При redelivery Kafka (nack/rebalance) два consumer-и можуть паралельно обробити ту саму delivery → **подвійна HTTP-доставка** (double send).

Worker `Delivery` entity **не має `@Version`** поля (файл: `webhook-platform-worker/.../domain/entity/Delivery.java`). Replay session має `version` — deliveries ні.

**Фікс:** Додати `@Version private Long version;` до Worker `Delivery` entity + Flyway migration:
```sql
ALTER TABLE deliveries ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
```
При `OptimisticLockException` — просто пропустити (інший consumer вже обробляє).

---

### P0-4. `spring.json.trusted.packages: "*"` у Worker application.yml (Effort: S)

**Файл:** `webhook-platform-worker/src/main/resources/application.yml:46`
```yaml
spring.json.trusted.packages: "*"
```

**Проблема:** Дозволяє десеріалізацію **будь-якого** Java класу з Kafka. Це класичний вектор Remote Code Execution через deserialization gadget chains. Хоча `KafkaConsumerConfig.java:58` правильно обмежує до `com.webhook.platform.common.dto`, **YAML property має вищий пріоритет** і перезаписує Java config при Spring Boot autoconfiguration.

**Фікс:** Змінити в `application.yml`:
```yaml
spring.json.trusted.packages: "com.webhook.platform.common.dto"
```

---

### P0-5. Outbox retry без jitter → thundering herd при масовому failure (Effort: S)

**Файл:** `webhook-platform-api/.../service/OutboxPublisherService.java:104-106`
```java
private long calculateBackoff(int retryCount) {
    return (long) Math.min(Math.pow(2, retryCount) * 10, 600);
}
```

**Проблема:** Exponential backoff **без jitter**. При масовому Kafka failure (наприклад, broker restart) — всі failed messages матимуть однаковий `lastAttemptAt` + однаковий backoff = всі retry-нуться **одночасно** → thundering herd → Kafka знову перевантажується.

**Фікс:**
```java
private long calculateBackoff(int retryCount) {
    long base = (long) Math.min(Math.pow(2, retryCount) * 10, 600);
    long jitter = ThreadLocalRandom.current().nextLong(0, base / 4 + 1);
    return base + jitter;
}
```

---

### P0-6. Worker Kafka consumer concurrency=3 hardcoded — не масштабується (Effort: S)

**Файл:** `webhook-platform-worker/.../config/KafkaConsumerConfig.java:84`
```java
factory.setConcurrency(3);
```

**Проблема:** Hardcoded `concurrency=3` для **обох** consumer factories. При 12 Kafka partitions (як у `docker-compose`) — **9 partitions залишаються unassigned**. Throughput обмежений 3 threads незалежно від кількості worker instances.

**Фікс:** Винести в конфіг:
```yaml
kafka:
  consumer:
    delivery-concurrency: ${KAFKA_DELIVERY_CONCURRENCY:6}
    incoming-concurrency: ${KAFKA_INCOMING_CONCURRENCY:3}
```

---

### P0-7. `WebClient.block()` на Netty event loop — потенційний deadlock (Effort: M)

**Файл:** `webhook-platform-worker/.../service/WebhookDeliveryService.java:312`
```java
.timeout(Duration.ofSeconds(clampTimeout(delivery.getTimeoutSeconds())))
.block();
```

**Проблема:** `.block()` виконується на thread-і Kafka consumer (не Netty event loop, тому не deadlock у strict sense), але при timeout 60s + concurrency 3 = **максимум 3 паралельні HTTP-запити на весь worker**. При slow endpoints (30s response) — throughput падає до 6 deliveries/хвилину на consumer.

**Фікс (short-term):** Збільшити concurrency (P0-6). **Фікс (medium-term):** Виконувати HTTP delivery в окремому thread pool (`@Async` або `ExecutorService`) щоб не блокувати Kafka consumer thread.

---

### P0-8. Dashboard analytics queries — full table scan без time-bounded index (Effort: S)

**Файл:** `webhook-platform-api/.../repository/DeliveryRepository.java:105-112`
```java
@Query("SELECT CAST(d.status AS text), COUNT(*) FROM deliveries d
        JOIN events e ON d.event_id = e.id
        WHERE e.project_id = :projectId GROUP BY d.status")
```

**Проблема:** `countByProjectIdGroupByStatus` — **unbounded** GROUP BY через ALL deliveries для проекту. Без часового фільтру. При мільйонах deliveries — це seq scan, який може зайняти секунди і блокувати connection pool.

Аналогічно `findEndpointPerformanceByProjectId` (рядки 64-87) робить 4-way JOIN з `PERCENTILE_CONT` — дуже дорогий запит.

**Фікс:** Додати обов'язковий time range filter або materialized view / pre-aggregated stats table.

---

### P0-9. `EventController` — подвійний Redis call на кожен request (Effort: S)

**Файл:** `webhook-platform-api/.../controller/EventController.java:63-65`
```java
RateLimitInfo rateLimitInfo = rateLimiterService.getRateLimitInfo(apiKeyAuth.getProjectId());
if (!rateLimiterService.tryAcquire(apiKeyAuth.getProjectId())) {
```

Потім рядок 89:
```java
RateLimitInfo updatedInfo = rateLimiterService.getRateLimitInfo(apiKeyAuth.getProjectId());
```

**Проблема:** **3 Redis round-trips** на кожен event ingest: `getRateLimitInfo` + `tryAcquire` + `getRateLimitInfo`. При 1000 events/sec = 3000 Redis calls/sec тільки для rate limiting. Кожен `trySetRate()` всередині — ще один Redis call.

**Фікс:** Об'єднати в один метод `tryAcquireWithInfo()` який повертає `RateLimitResult(boolean acquired, RateLimitInfo info)`. Або кешувати info на 1 секунду.

---

### P0-10. Replay `processBatch` зберігає по одному entity — O(n) DB round-trips (Effort: S)

**Файл:** `webhook-platform-api/.../service/ReplayService.java:346-349`
```java
delivery = deliveryRepository.save(delivery);
OutboxMessage outbox = createOutboxMessage(delivery);
outboxMessageRepository.save(outbox);
```

**Проблема:** Всередині `processBatch()` — по 2 DB write на кожну delivery * subscription комбінацію. При replay 10000 events × 5 subscriptions = **100,000 individual INSERT-ів**. Flush тільки в кінці батча (рядки 360-361), але `save()` все одно генерує individual persist calls.

**Фікс:** Накопичувати в List і робити `saveAll()` + `flush()` один раз на batch.

---

## 3) Top 10 P1 Improvements

### P1-1. Worker: відсутній окремий thread pool для HTTP delivery (Effort: M)

Kafka consumer thread блокується на `.block()` HTTP call. Потрібен dedicated `ExecutorService` з configurable pool size для HTTP delivery, щоб consumer threads могли продовжувати poll.

### P1-2. `localWindows` у `RedisRateLimiterService` (Worker) — memory leak (Effort: S)

**Файл:** `webhook-platform-worker/.../service/RedisRateLimiterService.java:30`
```java
private final ConcurrentHashMap<UUID, LocalWindow> localWindows = new ConcurrentHashMap<>();
```
Ніколи не очищується. При великій кількості endpoints — unbounded growth. Аналогічно `localPermits` в `RedisConcurrencyControlService.java:27`. Потрібен TTL-based eviction (Caffeine cache).

### P1-3. `MtlsWebClientFactory` — unbounded cache без eviction (Effort: S)

**Файл:** `webhook-platform-worker/.../service/MtlsWebClientFactory.java:37`
```java
private final Map<UUID, CachedClient> mtlsClientCache = new ConcurrentHashMap<>();
```
Ніколи не evict-ить entries. Кожен mTLS endpoint створює SSL context + WebClient. Потрібен Caffeine cache з max size + TTL.




### P1-4. `new ObjectMapper()` створюється при кожному response (Effort: S)

**Файл:** `webhook-platform-worker/.../service/WebhookDeliveryService.java:541`
```java
return new ObjectMapper().writeValueAsString(headerMap);
```
Також рядок 568:
```java
Map<String, String> headers = new ObjectMapper().readValue(customHeadersJson, Map.class);
```
ObjectMapper — thread-safe, heavy object. Потрібен singleton injection замість `new` на кожен HTTP call.

### P1-5. Відсутній `idempotency_key` index на `deliveries` для Worker lookup (Effort: S)

Worker `Delivery` entity має `idempotencyKey` поле, але у V001 schema немає індексу на `deliveries.idempotency_key`. При replay deduplication — це seq scan.

**Фікс:** `CREATE INDEX idx_deliveries_idempotency_key ON deliveries(idempotency_key) WHERE idempotency_key IS NOT NULL;`

### P1-6. `DeliveryConsumer` слухає тільки `dispatch` topic, retry topics — окремий listener (Effort: M)

**Файл:** `webhook-platform-worker/.../consumer/DeliveryConsumer.java:31`

`consumeDispatch` слухає тільки `DELIVERIES_DISPATCH`. Retry topics (1m, 5m, etc.) потребують окремих `@KafkaListener` або single listener з усіма topics. Зараз retry доставки проходять через `RetrySchedulerService` → Kafka → той самий `DeliveryConsumer`? Потрібно верифікувати що retry topics також consumed.

**UPDATE:** Перевірив — є `consumeRetry` listener нижче у файлі (рядки 61+). Це OK, але обидва мають `concurrency=3` → загальний throughput обмежений.



### P1-7. `StuckDeliveryRecoveryService` — без distributed lock (Effort: S)

**Файл:** `webhook-platform-worker/.../service/StuckDeliveryRecoveryService.java:23-24`

Без ShedLock. При multiple workers — кожен виконує `resetStuckDeliveries` незалежно. `UPDATE` statement idempotent, тому не критично, але зайве навантаження на DB.

### P1-8. `DlqMonitoringService` створює `AdminClient` без закриття (Effort: S)

**Файл:** `webhook-platform-worker/.../service/DlqMonitoringService.java:32`
```java
this.adminClient = AdminClient.create(kafkaAdmin.getConfigurationProperties());
```
`AdminClient` не закривається при shutdown (немає `@PreDestroy` або `implements DisposableBean`). Resource leak.



### P1-9. DB pool sizing: Worker 30 connections може бути недостатньо (Effort: S)

**Файл:** `webhook-platform-worker/src/main/resources/application.yml:22`
```yaml
maximum-pool-size: ${DB_POOL_MAX_SIZE:30}
```

3 Kafka consumer threads + RetryScheduler + StuckDeliveryRecovery + IncomingForwardRetry + DlqMonitoring. Кожен consumer thread робить до ~5 DB calls per delivery (findById, save, saveAttempt, etc.). При burst — pool exhaustion.

### P1-10. Kafka producer у Worker — без `enable.idempotence` (Effort: S)

**Файл:** `webhook-platform-worker/.../config/KafkaProducerConfig.java:29-30`
```java
configProps.put(ProducerConfig.ACKS_CONFIG, "all");
configProps.put(ProducerConfig.RETRIES_CONFIG, 3);
// enable.idempotence MISSING (API має, Worker ні)
```
API producer має `ENABLE_IDEMPOTENCE_CONFIG: true`, Worker — ні. Без idempotence при retry Kafka producer може створити дублікати повідомлень.

---

## 4) Correctness Guarantees & Semantics

### 4.1 Delivery Semantics: At-Least-Once (з нюансами)

| Рівень | Гарантія | Механізм |
|--------|----------|----------|
| API → Kafka | At-least-once | Transactional outbox + `acks=all` + `enable.idempotence` (API) |
| Kafka → Worker | At-least-once | Manual ack, nack on error |
| Worker → Endpoint | At-least-once | Retry policy, **але можливі double sends** (P0-3) |

**Ризик double send:** Без optimistic lock на delivery status transition — два consumer-и можуть паралельно відправити один webhook.

### 4.2 Idempotency Design

| Компонент | Механізм | Оцінка |
|-----------|----------|--------|
| Event ingest | `idempotencyKey` + unique index `(project_id, idempotency_key)` | ✅ Добре |
| Delivery creation | `unique(event_id, endpoint_id, subscription_id)` | ✅ Добре |
| Delivery dedup in worker | Check `status == SUCCESS` before processing | ⚠️ Race window |
| Outbox publish | `SELECT FOR UPDATE SKIP LOCKED` | ✅ Добре |
| Webhook response | `Idempotency-Key` header sent to endpoint | ✅ Добре |

### 4.3 Status Model

```
Delivery lifecycle:
  PENDING → PROCESSING → SUCCESS
                       → PENDING (retry) → ... → DLQ
                       → FAILED (non-retryable)

Outbox lifecycle:
  PENDING → PUBLISHED
          → FAILED (retry up to 5x) → stuck forever (no DLQ!)
```

**Проблема:** Outbox messages з `retryCount >= 5` залишаються в статусі FAILED назавжди (рядок 113: тільки лог, без переходу в DLQ або auto-purge). Потрібен alert або scheduled cleanup.

### 4.4 Ordering Guarantees (FIFO)

Redis-backed ordering buffer (`OrderingBufferService`):
- Track last delivered sequence per endpoint
- Buffer out-of-order deliveries
- Gap timeout: 60s (configurable)

**Ризик:** Gap timeout + retry = sequence може бути доставлена не в порядку якщо previous sequence в DLQ і gap timeout спрацював. Це documented behavior, але потребує моніторингу.

---

## 5) Observability & Operability

### 5.1 Metrics (Prometheus) ✅ Добре

| Metric | Де |
|--------|----|
| `webhook_delivery_attempts_total{result}` | Worker |
| `webhook_delivery_latency_ms{status_class}` | Worker |
| `webhook_dlq_depth` | Worker |
| `webhook_rate_limit_*` | Worker + API |
| `webhook_concurrency_*` | Worker |
| `webhook_ordering_gap_timeout_total` | Worker |
| `incoming_events_received_total` | API |
| `events_ingested_total` | API |
| `replay.*` | API |

**Відсутні:**
- ⚠️ Outbox queue depth / age (найстаріше PENDING повідомлення)
- ⚠️ Outbox publish latency
- ⚠️ Per-tenant delivery rate
- ⚠️ DB connection pool utilization
- ⚠️ Kafka consumer lag

### 5.2 Logging ✅ Добре

- Correlation ID через MDC (`CorrelationIdFilter` → Kafka header → Worker MDC)
- Structured fields: `deliveryId`, `endpointId`, `eventId`, `incomingEventId`

**Відсутні:**
- ⚠️ `projectId` / `organizationId` не в MDC — складно фільтрувати по tenant
- ⚠️ Response body може містити sensitive data (зберігається в `delivery_attempts.response_body` до 100KB)

### 5.3 Health Checks ✅

- Liveness + Readiness probes enabled
- Actuator health з show-details=always (⚠️ потенційно зайве для production — показує internal details)

### 5.4 Config ✅ Добре

- Всі критичні параметри через env vars
- Розумні defaults для development
- `ProductionSafetyValidator` — fail-fast на dev secrets
- `.env.dist` з документацією + production checklist

---

## 6) Deliverables

### D) Quick-Win план

#### Наступні 7 днів (зменшення ризику інцидентів)

| # | Що | P | Effort | Файл |
|---|----|----|--------|------|
| 1 | Змінити `spring.json.trusted.packages: "*"` → `"com.webhook.platform.common.dto"` | P0 | S | `worker/application.yml:46` |
| 2 | Додати ShedLock на `OutboxPublisherService` | P0 | S | `api/.../OutboxPublisherService.java` |
| 3 | Async batch send в `OutboxPublisherService` (як у RetryScheduler) | P0 | S | `api/.../OutboxPublisherService.java` |
| 4 | Додати jitter до outbox backoff | P0 | S | `api/.../OutboxPublisherService.java:104` |
| 5 | Винести `concurrency` у конфіг, збільшити до 6+ | P0 | S | `worker/.../KafkaConsumerConfig.java:84` |
| 6 | Додати `enable.idempotence=true` у Worker producer | P1 | S | `worker/.../KafkaProducerConfig.java` |
| 7 | Замінити `new ObjectMapper()` на injected singleton | P1 | S | `worker/.../WebhookDeliveryService.java:541,568` |

#### Наступні 30 днів (scaling + correctness hardening)

| # | Що | P | Effort |
|---|----|----|--------|
| 8 | Додати `@Version` на `Delivery` entity (Worker) + migration | P0 | M |
| 9 | Окремий thread pool для HTTP delivery (decouple від Kafka consumer) | P1 | M |
| 10 | Time-bounded dashboard queries + materialized aggregates | P0 | M |
| 11 | Об'єднати 3 Redis calls у EventController в один | P0 | S |
| 12 | Batch `saveAll()` у ReplayService.processBatch | P0 | S |
| 13 | Caffeine cache з TTL для `localWindows`, `localPermits`, `mtlsClientCache` | P1 | S |
| 14 | Outbox depth + age metrics (Prometheus gauge) | P1 | S |
| 15 | `projectId` в MDC для tenant-aware logging | P1 | S |
| 16 | AdminClient lifecycle (@PreDestroy close) | P1 | S |
| 17 | `show-details: when-authorized` замість `always` | P1 | S |

### E) Target Backend Architecture для High-Load

```
                    ┌─────────────────────────────────────┐
                    │           API Service (N replicas)    │
                    │  ┌──────────┐  ┌──────────────────┐  │
  Events ──────────►│  │ Rate     │  │ EventIngestService│  │
  (API Key auth)    │  │ Limiter  │  │ (TX: Event +     │  │
                    │  │ (Redis)  │  │  Delivery +      │  │
  Ingress ─────────►│  │          │  │  OutboxMessage)  │  │
  (Signature verify)│  └──────────┘  └──────────────────┘  │
                    │       ┌────────────────────┐          │
                    │       │ OutboxPublisher     │          │
                    │       │ (ShedLock, async    │          │
                    │       │  batch send)        │          │
                    │       └─────────┬──────────┘          │
                    └─────────────────┼─────────────────────┘
                                      │
                    ┌─────────────────▼─────────────────────┐
                    │         Apache Kafka                    │
                    │  deliveries.dispatch (12 partitions)   │
                    │  deliveries.retry.{1m,5m,15m,1h,6h,24h}│
                    │  deliveries.dlq                        │
                    │  incoming.forward.{dispatch,retry}     │
                    │  Key = endpointId (partition affinity)  │
                    └─────────────────┬─────────────────────┘
                                      │
                    ┌─────────────────▼─────────────────────┐
                    │        Worker Service (M replicas)     │
                    │  ┌──────────────────────────────────┐  │
                    │  │ KafkaConsumer (concurrency=N_env) │  │
                    │  │  ↓                                │  │
                    │  │ Delivery Thread Pool (bounded)    │  │
                    │  │  ↓                                │  │
                    │  │ Per-endpoint gates:               │  │
                    │  │  • CircuitBreaker (Resilience4j)  │  │
                    │  │  • RateLimiter (Redis)            │  │
                    │  │  • ConcurrencyControl (Redis sem) │  │
                    │  │  • SSRF Validator                 │  │
                    │  │  ↓                                │  │
                    │  │ WebClient HTTP POST (async pool)  │  │
                    │  │  + HMAC signature                 │  │
                    │  │  + mTLS (optional)                │  │
                    │  │  ↓                                │  │
                    │  │ Result handler:                   │  │
                    │  │  2xx → SUCCESS                    │  │
                    │  │  4xx retryable → PENDING + retry  │  │
                    │  │  other → FAILED / DLQ             │  │
                    │  └──────────────────────────────────┘  │
                    │  ┌──────────────────────────────────┐  │
                    │  │ RetryScheduler (SKIP LOCKED poll) │  │
                    │  │ StuckRecovery (5min threshold)   │  │
                    │  │ OrderingBuffer (Redis ZSET)       │  │
                    │  └──────────────────────────────────┘  │
                    └────────────────────────────────────────┘

Ключові зміни відносно поточного стану:
 1. OutboxPublisher з ShedLock + async batch send
 2. Kafka concurrency env-configurable (= partition count)
 3. Dedicated HTTP thread pool (не блокує consumer threads)
 4. @Version на Delivery entity (optimistic locking)
 5. Time-bounded analytics (materialized або cursor-based)
 6. Per-tenant metrics (projectId в MDC + Prometheus label)
 7. Outbox DLQ policy (alert на retryCount >= 5)
```

**Partition Key Strategy:**
- `endpointId` як Kafka key → delivery до одного endpoint йдуть в один partition → природний per-endpoint ordering
- 12 partitions → до 12 consumer threads при scale-out

**Rate Limiting (multi-tenant isolation):**
- Event ingestion: Redis token bucket per project (вже є)
- Delivery: Redis rate limiter + semaphore per endpoint (вже є)
- **Додати:** Global platform rate limit як safety net

**DLQ Strategy:**
- Kafka DLQ topic для failed deliveries ✅ (вже є)
- **Додати:** Outbox DLQ для messages з retryCount >= 5
- UI: DLQ management page ✅ (вже є)

**Retention:**
- Events/deliveries: application-level (DataRetentionService) ✅
- **Додати:** Table partitioning по `created_at` для events/deliveries при >100M rows

---

*Кінець hard audit report*
