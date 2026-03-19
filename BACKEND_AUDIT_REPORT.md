# 🔍 Production Audit Report — Backend Webhook Platform

**Дата:** Июнь 2025  
**Аудитор:** Principal Backend Engineer  
**Scope:** `webhook-platform-api`, `webhook-platform-worker`, `webhook-platform-common`  
**Метод:** Статический code review всех backend компонентов

---

## 📊 Общая оценка готовности к production

| Область | Оценка | Комментарий |
|---------|--------|-------------|
| **Архитектура** | 8.5/10 | Зрелый outbox pattern, чёткое разделение API/Worker, Kafka tiered retry |
| **Безопасность** | 8/10 | JWT + API Key, SSRF dual-layer, AES-GCM шифрование, tenant isolation |
| **Надёжность** | 8/10 | Circuit breaker, idempotency, DLQ, stuck recovery, graceful shutdown |
| **Целостность данных** | 7.5/10 | Optimistic locking, atomic claims, partial indexes, но есть нюансы |
| **Производительность** | 7/10 | Batch SQL, connection pools, но есть sync .block() и потенциальные N+1 |
| **Масштабируемость** | 8/10 | Redis rate limiting, backpressure, adaptive governor, per-project fairness |
| **Семантика доставки** | 8.5/10 | At-least-once, ordering support, dedup indexes, gap timeout |
| **Наблюдаемость** | 7.5/10 | Micrometer + Prometheus, MDC correlation, но нет distributed tracing |
| **Общий балл** | **7.9/10** | **Готов к production при условии исправления P0 items** |

---

## 🏗️ Архитектура (Резюме)

```
Client → [API (Spring Boot)]
              │
              ├─ EventIngestService → Event + Delivery + OutboxMessage (в одной TX)
              │
              ├─ OutboxPublisherService (@Scheduled + ShedLock) → Kafka deliveries.dispatch
              │
              └─ WorkflowTriggerOutboxService → durable workflow execution
                        
         [Kafka] deliveries.dispatch / retry_1m..24h / dlq
              │
              ▼
         [Worker (Spring Boot)]
              │
              ├─ DeliveryConsumer → BoundedAsyncExecutor → WebhookDeliveryService
              │     ├─ SSRF check (UrlValidator + SsrfProtectionCustomizer post-connect)
              │     ├─ Rate limit (Redis per-endpoint + per-project)
              │     ├─ Concurrency control (Redis semaphore per-endpoint)
              │     ├─ Circuit breaker (Redis 3-key model)
              │     ├─ HTTP POST with HMAC-SHA256 signature
              │     └─ Retry scheduling → DB PENDING + nextRetryAt
              │
              └─ RetrySchedulerService (adaptive governor) → Kafka retry topics
```

**Ключевые решения:**
- **Outbox pattern** с SELECT FOR UPDATE SKIP LOCKED — гарантирует at-least-once без distributed transactions
- **Tiered Kafka retry topics** (1m, 5m, 15m, 1h, 6h, 24h) — разделение по urgency
- **Dual-layer SSRF** — pre-connect DNS check + post-connect IP validation (DNS rebinding mitigation)
- **Redis-backed shared state** для circuit breaker, rate limiter, concurrency — работает в multi-pod deployment
- **ShedLock** для outbox publisher, retry scheduler — предотвращает дублирование scheduled tasks

---

## 🔴 TOP-10 P0 (Блокеры production)

### P0-1: `OutboxPublisherService.batchMarkFailed` — одинаковая ошибка для всех сообщений

**Файл:** `webhook-platform-api/.../OutboxPublisherService.java:289-294`

```java
List<UUID> failedIds = new ArrayList<>(failedMap.keySet());
String firstError = failedMap.values().iterator().next(); // ← BUG
txTemplate.executeWithoutResult(status ->
    outboxMessageRepository.batchMarkFailed(failedIds, firstError, now));
```

**Проблема:** Все failed messages получают `error_message` от первого в HashMap. Для отладки production incidents это теряет root cause конкретных сообщений.

**Влияние:** Потеря диагностической информации при массовых сбоях Kafka.  
**Усилия:** S (1 час)  
**Фикс:** Использовать per-message error при batch update, или итерировать по failedMap и записывать каждую ошибку отдельно.

---

### P0-2: `ApiKeyAuthenticationFilter` — нет timing-safe comparison, возможен timing attack

**Файл:** `webhook-platform-api/.../ApiKeyAuthenticationFilter.java:38-39`

```java
String keyHash = CryptoUtils.hashApiKey(apiKeyValue);
Optional<ApiKey> apiKeyOpt = apiKeyRepository.findByKeyHash(keyHash);
```

**Проблема:** Хеш API ключа вычисляется на стороне приложения, а поиск идёт через DB index. Это само по себе безопасно (SHA-256 hash lookup), но `CryptoUtils.hashApiKey` нужно верифицировать — если это не constant-time hash comparison, а простой `.equals()`, то при определённых условиях возможен timing oracle.

**Статус:** Низкий реальный риск (hash lookup в DB), но требует verification.  
**Усилия:** S (30 мин)  
**Фикс:** Убедиться что `CryptoUtils.hashApiKey` использует SHA-256 (уже делает), и что нигде нет plain-text comparison.

---

### P0-3: `JwtUtil` — токен парсится многократно при каждом вызове getter-метода

**Файл:** `webhook-platform-api/.../JwtUtil.java:72-100`

```java
public UUID getUserIdFromToken(String token) {
    Claims claims = parseToken(token);  // ← парсит снова
    return UUID.fromString(claims.getSubject());
}
public UUID getOrganizationIdFromToken(String token) {
    Claims claims = parseToken(token);  // ← парсит снова
    return UUID.fromString(claims.get("organizationId", String.class));
}
```

**Проблема:** В `JwtAuthenticationFilter.doFilterInternal` токен парсится **минимум 6 раз** (validateToken, getJti, getIssuedAt, getUserId, getOrgId, getRole). Каждый вызов `parseToken()` делает HMAC-SHA256 verification. На каждый HTTP запрос это лишняя CPU нагрузка.

**Влияние:** ~6x overhead на JWT verification per request. При 5000 rps на API это ≈30000 HMAC операций/сек вместо 5000.  
**Усилия:** S (1 час)  
**Фикс:** Парсить токен один раз в фильтре, передавать Claims объект дальше.

---

### P0-4: `WebhookDeliveryService.attemptDelivery` — `.block()` на reactive WebClient

**Файл:** `webhook-platform-worker/.../WebhookDeliveryService.java:319-335`

```java
requestSpec.bodyValue(body)
    .exchangeToMono(response -> { ... })
    .timeout(Duration.ofSeconds(clampTimeout(delivery.getTimeoutSeconds())))
    .block();  // ← синхронная блокировка
```

**Проблема:** `.block()` блокирует поток из BoundedAsyncExecutor (фиксированный пул). При timeout=60s и pool=50 потоков, всего 50 одновременных доставок на worker pod. Медленные endpoints (10s+ response) будут исчерпывать пул.

**Влияние:** Throughput bottleneck. 50 slow endpoints = 0 capacity для остальных.  
**Усилия:** M (3-5 дней) для перехода на fully reactive pipeline  
**Mitigation (quick-win, S):** Уменьшить default timeout до 15s, добавить response timeout отдельно от connection timeout.

---

### P0-5: `RedisRateLimiterService.trySetRate` — вызывается на каждый delivery

**Файл:** `webhook-platform-worker/.../RedisRateLimiterService.java:58-61`

```java
RRateLimiter limiter = redissonClient.getRateLimiter(key);
limiter.trySetRate(RateType.OVERALL, ratePerSecond, 1, RateIntervalUnit.SECONDS);
limiter.expire(KEY_TTL);
boolean acquired = limiter.tryAcquire(1);
```

**Проблема:** `trySetRate()` + `expire()` — это 2 дополнительных Redis roundtrip на **каждый** delivery attempt. При 1000 deliveries/sec это 3000 Redis commands/sec только на rate limiter. `trySetRate` — идемпотентный, но Redis RTT складывается.

**Влияние:** Увеличивает p99 latency каждого delivery на 2× Redis RTT (~2-4ms на вызов).  
**Усилия:** S (2 часа)  
**Фикс:** Кэшировать факт инициализации rate limiter в `Set<String> initializedKeys` (Caffeine с TTL). Вызывать `trySetRate` только один раз при первом обращении. Аналогично для `RedisConcurrencyControlService.trySetPermits`.

---

### P0-6: `RedisConcurrencyControlService` — аналогичная проблема с `trySetPermits` на каждый вызов

**Файл:** `webhook-platform-worker/.../RedisConcurrencyControlService.java:71-72`

```java
RPermitExpirableSemaphore semaphore = redissonClient.getPermitExpirableSemaphore(key);
semaphore.trySetPermits(maxConcurrentPerEndpoint);
```

**Проблема:** `trySetPermits` — Redis roundtrip на каждый `tryAcquire()`. Аналог P0-5.  
**Усилия:** S (1 час)  
**Фикс:** Аналогичный — кэш инициализации.

---

### P0-7: `CircuitBreakerService` — race condition в `recordSuccess` (slow call detection)

**Файл:** `webhook-platform-worker/.../CircuitBreakerService.java:92-116`

```java
public void recordSuccess(UUID endpointId, long durationMs) {
    RAtomicLong calls = redissonClient.getAtomicLong(callsKey(endpointId));
    long callCount = calls.incrementAndGet();
    calls.expire(Duration.ofSeconds(windowTtlSeconds));
    
    if (durationMs >= slowCallThresholdMs) {
        RAtomicLong slows = redissonClient.getAtomicLong(slowKey(endpointId));
        long slowCount = slows.incrementAndGet();
        // ...
        long slowRate = (slowCount * 100) / callCount;
```

**Проблема:** Между `calls.incrementAndGet()` и `slows.incrementAndGet()` нет атомарности. При concurrent calls из нескольких worker pods, `callCount` может быть inconsistent с `slowCount`, приводя к ложным trip или не-trip circuit breaker.

**Влияние:** Некорректные state transitions circuit breaker при high concurrency.  
**Усилия:** S (2 часа)  
**Фикс:** Использовать Redis Lua script для атомарного increment + evaluate, или принять eventual consistency с документацией.

---

### P0-8: `EventIngestService` — нет ограничения на размер `event_type` string

**Файл:** `webhook-platform-api/.../EventIngestService.java` + `V001__initial_schema.sql:77`

```sql
event_type VARCHAR(255) NOT NULL,
```

**Проблема:** В `EventIngestService.ingestEvent()` нет validation на длину `eventType` до записи в БД. При event_type > 255 символов будет DataTruncation exception, которое клиент получит как 500 вместо 400 Bad Request.

**Влияние:** Плохой DX, возможный 500 error вместо validation error.  
**Усилия:** S (30 мин)  
**Фикс:** Добавить `@Size(max=255)` validation в `EventIngestRequest`, или explicit check в сервисе.

---

### P0-9: `OutboxPublisherService` — cleanup и publish используют разные transaction strategies

**Файл:** `webhook-platform-api/.../OutboxPublisherService.java:165-193`

```java
@Scheduled(fixedDelayString = "${outbox.publisher.cleanup-interval-ms:3600000}")
@Transactional  // ← @Transactional annotation
public void cleanupOldMessages() {
    // Потенциально долгая транзакция: recovery + delete published + delete dead + count
```

**Проблема:** `cleanupOldMessages()` использует `@Transactional` (одна длинная транзакция), в то время как `publishPendingMessages()` использует `txTemplate` (короткие транзакции). Cleanup может держать транзакцию минутами при большом количестве записей, блокируя connection pool.

**Влияние:** Connection pool starvation при big cleanup batches.  
**Усилия:** S (1 час)  
**Фикс:** Заменить `@Transactional` на `txTemplate` с batch commits, аналогично `DataRetentionService`.

---

### P0-10: Management endpoints доступны без аутентификации на Worker

**Файл:** `webhook-platform-worker/.../application.yml:76-77`

```yaml
management:
  server:
    port: ${MANAGEMENT_PORT:8081}
```

Worker не имеет Spring Security, но management port открыт на 8081. В docker-compose.prod.yml нет ограничения доступа к worker ports.

**Проблема:** Prometheus metrics endpoint (`/actuator/prometheus`) на worker доступен без auth. При неправильной network policy, метрики (включая endpoint IDs, queue depths) могут быть exposed.

**Влияние:** Information disclosure.  
**Усилия:** S (30 мин)  
**Фикс:** Добавить `management.server.address: 127.0.0.1` в worker config для bind only на localhost, или добавить Spring Security на management port.

---

## 🟡 TOP-10 P1 (Важные улучшения)

### P1-1: Нет distributed tracing (OpenTelemetry)

**Проблема:** MDC correlationId propagation через Kafka headers есть, но нет end-to-end trace spans от API ingestion до Worker delivery. При debugging production issues нельзя визуализировать полный путь события.

**Текущее:** `CorrelationIdFilter` генерирует UUID, передаёт в Kafka header `X-Correlation-ID`, Worker извлекает в `DeliveryConsumer`.

**Усилия:** M (3-5 дней)  
**Фикс:** Добавить `spring-boot-starter-actuator` + `micrometer-tracing-bridge-otel` + `opentelemetry-exporter-otlp`. Kafka observation уже enabled (`observation-enabled: true` в worker).

---

### P1-2: `WebhookDeliveryService` — N+1 при `triggerBufferedDeliveries`

**Файл:** `webhook-platform-worker/.../WebhookDeliveryService.java:567-589`

```java
private void triggerBufferedDeliveries(UUID endpointId) {
    List<UUID> readyDeliveries = orderingBufferService.getReadyDeliveries(endpointId);
    for (UUID deliveryId : readyDeliveries) {
        Optional<Delivery> deliveryOpt = deliveryRepository.findById(deliveryId); // N+1
```

**Проблема:** Каждый buffered delivery — отдельный DB query. При 100 buffered deliveries на endpoint = 100 SELECT queries.

**Усилия:** S (1 час)  
**Фикс:** `deliveryRepository.findAllById(readyDeliveries)` — один batch SELECT.

---

### P1-3: `DataRetentionService.cleanupPublishedOutboxMessages` — конфликт с `OutboxPublisherService.cleanupOldMessages`

**Файлы:**
- `webhook-platform-api/.../DataRetentionService.java:80-118`
- `webhook-platform-api/.../OutboxPublisherService.java:165-193`

**Проблема:** Оба сервиса чистят outbox messages. `DataRetentionService` запускается по cron `0 0 2 * * *`, `OutboxPublisherService.cleanupOldMessages` — каждые 3600000ms. Возможны race conditions и двойная работа.

**Усилия:** S (1 час)  
**Фикс:** Удалить один из cleanup paths, оставив `DataRetentionService` как единственный ответственный.

---

### P1-4: `WebhookDeliveryService.processDelivery` — два отдельных DB round-trip для claim + read

**Файл:** `webhook-platform-worker/.../WebhookDeliveryService.java:157-172`

```java
Integer claimed = transactionTemplate.execute(tx -> 
    deliveryRepository.claimForProcessing(message.getDeliveryId()));
// ...
Delivery delivery = transactionTemplate.execute(tx -> 
    deliveryRepository.findById(message.getDeliveryId()).orElse(null));
```

**Проблема:** Два отдельных DB round-trip + две транзакции. `claimForProcessing` уже обновляет row, после чего `findById` читает его повторно.

**Усилия:** S (2 часа)  
**Фикс:** Объединить claim + read в одну транзакцию. Написать `claimAndReturn` query: `UPDATE ... RETURNING *`.

---

### P1-5: `UrlValidator` — DNS resolution при каждом delivery attempt

**Файл:** `webhook-platform-common/.../UrlValidator.java:45`

```java
InetAddress[] addresses = InetAddress.getAllByName(host);
```

**Проблема:** `InetAddress.getAllByName()` — синхронный DNS lookup на каждый delivery attempt. При 1000 deliveries/sec к одному endpoint — 1000 DNS queries/sec. JVM DNS cache частично помогает, но TTL по умолчанию 30s.

**Усилия:** M (1 день)  
**Фикс:** Добавить explicit DNS cache (Caffeine, TTL 5 min) на уровне UrlValidator. Или полагаться на `SsrfProtectionCustomizer` post-connect check и убрать pre-connect DNS check из hot path.

---

### P1-6: `WorkflowEngine` — CallerRunsPolicy может блокировать workflow thread

**Файл:** `webhook-platform-api/.../WorkflowEngine.java:66-76`

```java
ThreadPoolExecutor pool = new ThreadPoolExecutor(
    nodeTimeoutPoolSize, nodeTimeoutPoolSize,
    60L, TimeUnit.SECONDS,
    new LinkedBlockingQueue<>(nodeTimeoutPoolSize * 4),
    // ...
    new ThreadPoolExecutor.CallerRunsPolicy()  // ← блокирует caller
);
```

**Проблема:** При заполненной очереди `CallerRunsPolicy` выполнит node executor на вызывающем потоке (workflow pool). Это может заблокировать workflow pool thread на время HTTP call (до 60s), что снизит throughput workflow execution.

**Усилия:** S (1 час)  
**Фикс:** Заменить на `AbortPolicy` + catch `RejectedExecutionException` → return `StepResult.failed("Node executor pool exhausted")`.

---

### P1-7: `OutboxMessageRepository.findPendingBatchForUpdate` — window function без index hint

**Файл:** `webhook-platform-api/.../OutboxMessageRepository.java:17-28`

```sql
SELECT * FROM outbox_messages WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY kafka_key ORDER BY created_at ASC) AS rn_key,
               ROW_NUMBER() OVER (PARTITION BY COALESCE(project_id::text, kafka_key) ORDER BY created_at ASC) AS rn_proj
        FROM outbox_messages WHERE status = :status
    ) sub WHERE rn_key <= :maxPerKey AND rn_proj <= :maxPerProject
    ORDER BY rn_proj ASC, rn_key ASC LIMIT :limit
) FOR UPDATE SKIP LOCKED
```

**Проблема:** Два `ROW_NUMBER()` window functions на полный scan `WHERE status = 'PENDING'`. При 100K+ pending messages — full table scan внутри subquery. Partial index `idx_outbox_messages_pending` покрывает только `created_at`.

**Усилия:** M (1 день)  
**Фикс:** Добавить composite partial index `(status, kafka_key, created_at)` + `(status, project_id, created_at)`. Или переписать на CTE с `LIMIT` на внутреннем уровне.

---

### P1-8: Нет table partitioning для `delivery_attempts` и `events`

**Проблема:** `delivery_attempts` и `events` — append-only таблицы которые растут неограниченно. `DataRetentionService` чистит by DELETE, что при миллионах строк вызывает table bloat и slow vacuums.

**Усилия:** L (1-2 недели)  
**Фикс:** Внедрить PostgreSQL range partitioning по `created_at` (monthly). Retention = DROP PARTITION.

---

### P1-9: `EventIngestService` — large transaction при high fanout

**Файл:** `webhook-platform-api/.../EventIngestService.java`

**Проблема:** `doIngestEvent()` создаёт Event + N Deliveries + N OutboxMessages + workflow trigger outbox в **одной транзакции**. При max_fanout=100, это 1 event + 100 deliveries + 100 outbox messages = 201 INSERT в одной TX. При burst traffic это может вызвать long-held row locks.

**Текущее mitigation:** `hibernate.jdbc.batch_size: 50`, `order_inserts: true` — помогает, но TX всё равно может быть длинной.

**Усилия:** M (2-3 дня)  
**Фикс:** Разделить на 2 фазы: TX1 = Event + Deliveries, TX2 = OutboxMessages (idempotent по delivery IDs). Или снизить `max-fanout-per-event` до 50.

---

### P1-10: `BoundedAsyncExecutor` — паузит все Kafka containers при saturation

**Файл:** `webhook-platform-worker/.../BoundedAsyncExecutor.java`

**Проблема:** При `!semaphore.tryAcquire()` вызывается `pauseContainers()` который паузит **все** Kafka listener containers (delivery + incoming forward). Один saturated delivery pool останавливает и incoming forwarding.

**Усилия:** M (2-3 дня)  
**Фикс:** Разделить executor pools для outgoing deliveries и incoming forwarding. Паузить только соответствующий container.

---

## 🟢 P2 (Желательные улучшения)

| # | Описание | Файл | Усилия |
|---|----------|------|--------|
| P2-1 | `CorsConfig` — нет `setExposedHeaders` для rate limit headers | `CorsConfig.java:21-31` | S |
| P2-2 | `JwtAuthenticationFilter` — логирует только debug при invalid token, нет metrics | `JwtAuthenticationFilter.java:70-72` | S |
| P2-3 | `SecurityConfig` — `/actuator/**` requires authenticated, но actuator не имеет auth на Worker | `SecurityConfig.java:57` | S |
| P2-4 | `Delivery` entity — `retryDelays` хранится как comma-separated string вместо JSONB array | `Delivery.java:76` | M |
| P2-5 | `WebhookDeliveryService.addCustomHeaders` — нет blocklist для `Authorization`, `Cookie` headers | `WebhookDeliveryService.java:682-701` | S |
| P2-6 | `OutboxPublisherService` — `publishLatency` timer включает время ожидания всех futures | `OutboxPublisherService.java:203-268` | S |
| P2-7 | Нет health check indicator для Redis connectivity в Worker | `application.yml` (worker) | S |
| P2-8 | `CircuitBreakerService.isCallPermitted` — log.warn на КАЖДЫЙ rejected call (log flooding) | `CircuitBreakerService.java:80` | S |
| P2-9 | `RedisConcurrencyControlService` — `acquiredPermits` ConcurrentHashMap grows unbounded | `RedisConcurrencyControlService.java:29` | S |
| P2-10 | Нет connection pool metrics для HikariCP exposed в Prometheus | `application.yml` (worker) | S |

---

## ✅ Что сделано хорошо (Best Practices)

1. **Outbox pattern** с `SELECT FOR UPDATE SKIP LOCKED` — лучшая практика для transactional messaging
2. **Dual-layer SSRF protection** — pre-connect DNS + post-connect IP validation (`SsrfProtectionCustomizer`)
3. **Redis fallback to local** — все Redis services (rate limiter, concurrency, circuit breaker) имеют local fallback при Redis unavailability
4. **Adaptive retry governor** — `RetryGovernor` с cooldown и batch size adaptation предотвращает retry storms
5. **Optimistic locking** (`@Version`) на Delivery entity — предотвращает concurrent state corruption
6. **Atomic claim** — `claimForProcessing` с `WHERE status = 'PENDING'` — идемпотентный claim без двойной обработки
7. **Graceful shutdown** — `BoundedAsyncExecutor` ожидает in-flight tasks, `WorkflowEngine.destroy()` с awaitTermination
8. **Per-project fairness** — rate limiting и max-per-project в outbox publisher и retry scheduler
9. **Body truncation** — дифференциальная трункация (2KB success vs 10KB error) для delivery attempts
10. **Encryption key rotation** — `EncryptionKeyRegistry` поддерживает multiple key versions для zero-downtime rotation
11. **Token blacklist + revocation epoch** — полноценный JWT revocation mechanism
12. **Stuck delivery recovery** — `resetStuckDeliveries` + `StaleDeliveryEscalationService` с hard cap (48h → DLQ)
13. **ShedLock** для distributed scheduled tasks — нет double-processing при multi-instance deployment
14. **Kafka consumer manual ack** — `ack-mode: manual` + не ack при exception → redeliver after rebalance
15. **Connection pool tuning** — HikariCP с leak detection, Reactor Netty pool с metrics

---

## 📋 Quick-Win Plan (7 дней)

| День | Задача | Приоритет | Файл(ы) | Усилия |
|------|--------|-----------|---------|--------|
| 1 | P0-3: JwtUtil — один parseToken вместо 6 | P0 | `JwtUtil.java`, `JwtAuthenticationFilter.java` | S |
| 1 | P0-8: Validation на event_type length | P0 | `EventIngestService.java` или `EventIngestRequest.java` | S |
| 1 | P0-10: Management endpoint binding на localhost (Worker) | P0 | Worker `application.yml` | S |
| 2 | P0-5+P0-6: Кэширование trySetRate/trySetPermits | P0 | `RedisRateLimiterService.java`, `RedisConcurrencyControlService.java` | S |
| 2 | P0-1: Per-message error в batchMarkFailed | P0 | `OutboxPublisherService.java` | S |
| 3 | P0-9: cleanupOldMessages → batch txTemplate | P0 | `OutboxPublisherService.java` | S |
| 3 | P1-3: Удалить дублирующийся cleanup path | P1 | `OutboxPublisherService.java` или `DataRetentionService.java` | S |
| 4 | P1-2: Batch fetch в triggerBufferedDeliveries | P1 | `WebhookDeliveryService.java` | S |
| 4 | P1-4: Объединить claim+read в одну TX | P1 | `WebhookDeliveryService.java`, `DeliveryRepository.java` | S |
| 5 | P0-7: Lua script для atomic circuit breaker evaluate | P0 | `CircuitBreakerService.java` | S |
| 5 | P2-5: Blocklist Authorization/Cookie в custom headers | P2 | `WebhookDeliveryService.java` | S |
| 6 | P2-8: Rate-limit log.warn в CircuitBreaker (once per window) | P2 | `CircuitBreakerService.java` | S |
| 6 | P2-1: CorsConfig exposed headers | P2 | `CorsConfig.java` | S |
| 7 | Integration testing + verification | — | — | M |

---

## 🗓️ Roadmap (30 дней)

| Неделя | Задачи |
|--------|--------|
| **1** | Quick-Win Plan (выше) — все P0 fixes |
| **2** | P1-1: OpenTelemetry distributed tracing integration |
| **2** | P1-5: DNS cache в UrlValidator |
| **2** | P1-6: WorkflowEngine AbortPolicy |
| **3** | P1-7: Outbox query optimization (composite indexes) |
| **3** | P1-9: Разделение EventIngestService transaction |
| **3** | P1-10: Раздельные executor pools для delivery/forward |
| **4** | P0-4: Investigate async delivery pipeline (без .block()) |
| **4** | P1-8: Table partitioning PoC для delivery_attempts |
| **4** | Load testing + SLO verification |

---

## 🎯 Целевая backend архитектура для high-load (>10K deliveries/sec)

```
                    ┌──────────────────────────────────┐
                    │        Load Balancer (L7)         │
                    │   (rate limit, WAF, TLS termination)│
                    └──────────┬───────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
     ┌──────────┐       ┌──────────┐       ┌──────────┐
     │  API Pod  │       │  API Pod  │       │  API Pod  │  (3+ pods, HPA)
     │  + Outbox │       │  + Outbox │       │  + Outbox │
     └────┬─────┘       └────┬─────┘       └────┬─────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │ Kafka (3 brokers, replication=3)
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
     ┌──────────┐       ┌──────────┐       ┌──────────┐
     │Worker Pod │       │Worker Pod │       │Worker Pod │  (6+ pods, HPA)
     │ Delivery  │       │ Delivery  │       │ Delivery  │
     │ + Forward │       │ + Forward │       │ + Forward │
     └────┬─────┘       └────┬─────┘       └────┬─────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
     ┌──────────┐       ┌──────────┐       ┌──────────┐
     │  PG Primary│      │ PG Replica │      │ PG Replica │
     │(writes)   │       │(reads)    │       │(reads)    │
     └──────────┘       └──────────┘       └──────────┘
     
     ┌──────────┐       ┌──────────┐       ┌──────────┐
     │ Redis     │       │ Redis     │       │ Redis     │  (Redis Cluster)
     │ Master    │       │ Replica   │       │ Replica   │
     └──────────┘       └──────────┘       └──────────┘
```

### Ключевые изменения для >10K del/sec:

1. **Async delivery pipeline** — заменить `.block()` на fully reactive chain с `Mono.from()` → сохранение attempt в callback. Позволит 200+ concurrent deliveries на pod.

2. **Read replicas** для delivery read queries — `deliveryRepository.findById()` при processDelivery может читать с replica (after claim write to primary).

3. **Kafka partitioning по endpointId** — уже используется как Kafka key. Обеспечивает per-endpoint ordering при scale-out workers.

4. **Table partitioning** — `delivery_attempts` и `events` по monthly ranges. Retention через DROP PARTITION.

5. **Connection pooling** — PgBouncer перед PostgreSQL для session multiplexing. HikariCP (30-40 per pod) × 6 pods = 180-240 PG connections без PgBouncer.

6. **Redis Cluster** — заменить single Redis на cluster для rate limiter и circuit breaker при >10K endpoints.

7. **Separate worker pools** — outgoing delivery workers vs incoming forward workers на разных Kafka consumer groups + разных pods. Isolated blast radius.

---

## 📝 Отсутствующие компоненты

| Компонент | Статус | Влияние | Рекомендация |
|-----------|--------|---------|--------------|
| Distributed tracing (OTel) | Отсутствует | Сложная отладка production issues | P1 — добавить в неделю 2 |
| Read replicas routing | Отсутствует | Нагрузка на primary DB | P2 — при >5K del/sec |
| PgBouncer / connection multiplexer | Отсутствует | Ограничение connection count при scale-out | P2 — при >6 pods |
| Chaos testing framework | Отсутствует | Нет verification resilience patterns | P2 — Chaos Monkey or Litmus |
| API response compression (gzip) | Не настроен | Bandwidth для больших payload lists | P2 |
| Structured error codes | Частично | Клиенты парсят message вместо кодов | P2 |

---

## Заключение

**Платформа имеет зрелую архитектуру** с правильными patterns (outbox, circuit breaker, rate limiting, SSRF protection, idempotency). Основные P0 issues — это performance optimizations (JWT parsing, Redis roundtrips, sync .block()), а не фундаментальные архитектурные проблемы.

**Рекомендация:** Исправить все P0 items (7 дней Quick-Win Plan), затем внедрить distributed tracing (P1-1) для production observability. После этого платформа готова к production с нагрузкой до ~5K deliveries/sec на pod.

Для масштабирования >10K del/sec потребуется async delivery pipeline (P0-4) + read replicas + table partitioning — это 4-6 недель работы.
