# План ремедиации — Часть 2: BACKEND АРХИТЕКТУРА и HIGH-LOAD

---

## 2.1 Retry scheduler слишком SQL/DB-centric

### 1. Корневая причина
`RetrySchedulerService` полагается на DB polling каждые 10с: `SELECT ... FOR UPDATE SKIP LOCKED` по таблице `deliveries`. При 100K+ pending retries:
- Постоянная нагрузка на PostgreSQL (index scan + row locking)
- Contention между worker instances на одних rows
- Два SQL-транзакции за poll cycle + Kafka batch

Уже есть: `RetryGovernor` (AIMD, cooldown, queue-depth cap), per-endpoint/project limits, jitter. Это работает до ~1000 events/sec.

**Слой:** Backend / High-load

### 2. Целевое состояние
- Retry scheduling через Redis sorted sets (primary) + DB (fallback/source of truth)
- DB polling — только recovery mechanism, не основной scheduling
- Линейная масштабируемость worker instances без роста DB нагрузки

### 3. План реализации

**Quick fix (2-3 дня) — достаточно для limited prod:**
1. Adaptive poll interval в `RetryGovernor`:
```java
public long getRecommendedPollIntervalMs(long pendingCount) {
    if (pendingCount == 0) return 30_000;
    if (pendingCount < 100) return 10_000;
    if (pendingCount < 1000) return 5_000;
    return 2_000;
}
```
2. Интеграция circuit breaker: не ретрайить endpoints в OPEN state:
```java
// В scheduleRetries(), перед Kafka send:
if (circuitBreakerService.isOpen(delivery.getEndpointId())) {
    rescheduleDelivery(delivery, "Circuit breaker open");
    continue;
}
```
3. DB connection pool metrics: Micrometer gauge для active/idle/pending connections

**Proper fix (2-3 недели) — Redis-based scheduling:**
1. При `scheduleRetry()` в `WebhookDeliveryService`:
```java
// DB update (source of truth)
fresh.setStatus(PENDING);
fresh.setNextRetryAt(nextRetryAt);
deliveryRepository.save(fresh);
// Redis (scheduling)
redisTemplate.opsForZSet().add("retry:outgoing", deliveryId.toString(),
    nextRetryAt.toEpochMilli());
```

2. `RetrySchedulerService` → poll Redis вместо DB:
```java
@Scheduled(fixedDelay = 1000) // Redis = дешёвый, можно чаще
public void scheduleRetries() {
    double now = Instant.now().toEpochMilli();
    Set<String> dueIds = redisTemplate.opsForZSet()
        .rangeByScore("retry:outgoing", 0, now, 0, effectiveBatch);
    if (dueIds.isEmpty()) return;
    // ZREM atomically
    // Fetch delivery details from DB (only due items)
    // Apply governor + per-endpoint/project caps
    // Send to Kafka
}
```

3. Fallback DB poll каждые 60с для recovery (items missed при Redis crash):
```java
@Scheduled(fixedDelay = 60000)
public void recoveryPoll() {
    // SELECT WHERE status=PENDING AND nextRetryAt <= NOW() - 30s
    // Items present in DB but missing from Redis = re-add to Redis
}
```

4. Аналогичные изменения для `IncomingForwardRetryScheduler`

**Long-term — Kafka-native delayed delivery:**
- Kafka consumer с `pause()`/`resume()` для точного timing
- DB только для status persistence и recovery
- Убрать DB polling полностью на happy path

### 4. Архитектура

**Anti-storm protections (дополнить существующие):**
```
[RetryGovernor] — AIMD batch sizing (УЖЕ ЕСТЬ)
  + Global retry budget: max 10K retries/minute per worker
  + Circuit breaker skip: endpoints в OPEN state → отложить
  + Per-tenant fair share: не больше 20% batch от одного org
  + Exponential backoff ceiling: max 24h retry delay
```

**Per-endpoint rate governance:**
```
[Redis] endpoint:{id}:retry_budget — sliding window
  → max 10 retries/minute per endpoint (configurable)
  → при превышении → reschedule с увеличенным delay
  → метрика: retry_budget_exceeded counter
```

### 5. Риски и компромиссы
- Redis SPOF для scheduling → Redis Sentinel (уже production requirement)
- Дублирование retries при Redis↔DB inconsistency → idempotency в consumer (delivery status check уже есть)
- Kafka-native delay = значительно сложнее, отложить

### 6. Приоритет
Quick fix: **Must do before enterprise self-hosted**
Redis-based: **Must do before SaaS launch**

### 7. Трудозатраты: Quick **S**, Redis **L**, Kafka-native **XL**

### 8. Порядок
- Quick fix сразу (нет зависимостей)
- Redis-based после стабилизации core flow
- Kafka-native при >10K events/sec

---

## 2.2 Incoming usage metering — hardcoded нули

### 1. Корневая причина
`UsageDailyAggregator.aggregateForProject()` строки 74-75: `incomingEventsCount(0L)`, `incomingForwardsCount(0L)`. `UsageService.getUsage()` строки 70-71: то же. Данные есть в DB (`incoming_events`, `incoming_forward_attempts`), но не запрашиваются.

**Слой:** Backend

### 2. Целевое состояние
- Реальные counts incoming events/forwards в daily aggregation
- Live usage тоже из реальных таблиц
- Latency metrics (avg, p95) из `delivery_attempts`

### 3. План реализации

**Quick fix (1 день):**

1. Repository методы:
```java
// IncomingEventRepository (или custom query через source→project):
@Query("SELECT COUNT(e) FROM IncomingEvent e JOIN IncomingSource s ON e.sourceId = s.id " +
       "WHERE s.projectId = :projectId AND e.receivedAt BETWEEN :from AND :to")
long countByProjectAndDateRange(UUID projectId, Instant from, Instant to);
```

2. `UsageDailyAggregator` — заменить нули:
```java
long incomingEvents = incomingEventRepository.countByProjectAndDateRange(projectId, dayStart, dayEnd);
long incomingForwards = forwardAttemptRepository.countSuccessfulByProjectAndDateRange(projectId, dayStart, dayEnd);
.incomingEventsCount(incomingEvents)
.incomingForwardsCount(incomingForwards)
```

3. `UsageService` — live counts:
```java
long totalIncoming = incomingEventRepository.countByProjectSince(projectId, since30d);
.totalIncomingEvents(totalIncoming)
```

**Proper fix (1 неделя):**
- Latency percentiles:
```sql
SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
FROM delivery_attempts WHERE project_id = ? AND created_at BETWEEN ? AND ?
```
- Redis cache для aggregated stats (TTL 5 мин)
- Backfill existing daily records: one-time migration job

### 4. Предположение
`incoming_events` связан с project через `incoming_sources.project_id`. Если нет denormalized `project_id` на incoming_events — нужен JOIN. При большом объёме → добавить `project_id` колонку на incoming_events (denormalization).

### 5. Риски: JOIN через sources может быть медленным → materialized view или denormalization
### 6. Приоритет: **Must do before SaaS launch**
### 7. Трудозатраты: Quick **S**, Proper **M**
### 8. Порядок: Параллельно с другими backend фиксами

---

## 2.3 PostgreSQL coordination bottlenecks

### 1. Корневая причина
Множество polling/scanning patterns на одной DB:
- Outbox polling (1с), retry polling (10с), stuck delivery recovery (60с)
- Dashboard GROUP BY + COUNT на растущих таблицах
- Usage aggregation: full table scan по projects
- Connection pool default 10 при multiple services

**Слой:** Backend / Database

### 2. Целевое состояние
- PostgreSQL для OLTP, не для scheduling
- Analytics → materialized views / Redis cache
- Корректный connection pool sizing

### 3. План реализации

**Quick fix (3-5 дней):**

1. **Materialized view для dashboard:**
```sql
CREATE MATERIALIZED VIEW mv_delivery_stats AS
SELECT project_id, status::text, COUNT(*) as cnt,
       DATE_TRUNC('day', created_at) as day
FROM deliveries
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY project_id, status, DATE_TRUNC('day', created_at);

CREATE UNIQUE INDEX ON mv_delivery_stats(project_id, status, day);
```
Refresh: `@Scheduled(cron = "0 */5 * * * *")` → `REFRESH MATERIALIZED VIEW CONCURRENTLY`

2. **Connection pool tuning:**
```yaml
# API
DB_POOL_MAX_SIZE: 20
DB_POOL_MIN_IDLE: 10
# Worker
DB_POOL_MAX_SIZE: 30
DB_POOL_MIN_IDLE: 15
```

3. **DashboardService** → использовать materialized view вместо runtime GROUP BY

**Proper fix (2-3 недели):**
- Read replica routing: `@Transactional(readOnly=true)` → replica
- Spring `AbstractRoutingDataSource` для primary/replica
- Redis cache для hot path counts (event counts, success rate) — TTL 30s

**Long-term:**
- PostgreSQL native partitioning по `created_at` для deliveries и delivery_attempts
- CQRS: отдельная read model (ClickHouse) для analytics
- pg_partman для auto-partition management

### 4. Архитектура
```
[Write Path]  API → Primary PostgreSQL
[Read Path]   Dashboard/Usage → Materialized View → (future: Replica)
[Hot Cache]   Success rates, counts → Redis (TTL 30s)
[Analytics]   Usage history → usage_daily table (nightly aggregated)
```

### 5. Риски
- Materialized view refresh = CPU/IO burst каждые 5 мин → schedule в off-peak
- Read replica = operational complexity (replication lag)
- Redis cache → stale data (acceptable для dashboard, не для billing)

### 6. Приоритет
Quick fix: **Must do before enterprise self-hosted**
Proper fix: **Must do before SaaS launch**

### 7. Трудозатраты: Quick **M**, Proper **L**
### 8. Порядок: Connection pool → сразу; MV → до self-hosted; replica → до SaaS

---

## 2.4 Delivery attempts storage growth

### 1. Корневая причина
Каждый HTTP attempt = row в `delivery_attempts` с headers (JSON), response body snippet (до 10KB), error messages. При 1000 events/sec × 2 deliveries × 1.5 attempts × ~2KB = **~6MB/sec = ~500GB/month**.

Data retention 90 дней → 45TB. PostgreSQL не предназначен для такого объёма time-series данных.

**Слой:** Backend / Storage

### 2. Целевое состояние
- Hot (PG): 7-14 дней, полные данные
- Warm (PG partitioned): 14-90 дней
- Cold (S3/MinIO): 90+ дней для compliance
- Response body → object storage, не в PostgreSQL

### 3. План реализации

**Quick fix (3-5 дней):**

1. **Truncate response body для success:**
```java
String bodyToStore = statusCode >= 200 && statusCode < 300
    ? truncate(responseBody, 2048)    // 2KB для success
    : truncate(responseBody, 10240);  // 10KB для errors
```

2. **Aggressive retention для success attempts:**
```java
// DataRetentionService — отдельный cron
@Scheduled(cron = "0 30 2 * * *")
public void cleanSuccessAttempts() {
    // DELETE WHERE created_at < NOW() - 14 days AND response_code BETWEEN 200 AND 299
    // Batch delete по 1000 rows
}
```

3. **PostgreSQL partitioning:**
```sql
-- V032__partition_delivery_attempts.sql
-- Партиционирование по месяцам через pg_partman или manual
```

**Proper fix (2-3 недели):**

1. **S3/MinIO для response bodies:**
```java
// При сохранении attempt:
String bodyKey = "attempts/" + attemptId + "/response.json";
s3Client.putObject(bucket, bodyKey, responseBody);
// delivery_attempts: response_body → NULL, response_body_ref → s3 key
```

2. **Migration:** `ALTER TABLE delivery_attempts ADD COLUMN response_body_ref TEXT;`
3. **Lazy load:** UI запрашивает body on-demand через API → API reads from S3

**Long-term:**
- S3 lifecycle policies: Standard → Glacier (90+ дней)
- ClickHouse для analytics на historical attempts

### 4. Архитектура
```
[Delivery Attempt] → metadata → PostgreSQL (hot)
                   → response body → S3/MinIO
[View Details]     → metadata from PG + lazy body from S3
[Lifecycle]        
  Day 0-14:  PG (hot partitions) + S3 (body)
  Day 14-90: PG (warm partitions) + S3
  Day 90+:   DROP PARTITION + S3 Glacier
```

### 5. Риски
- Partitioning migration = potential downtime → pg_partman online
- S3 latency при просмотре details → acceptable (lazy load)
- MinIO уже в compose (profile minio) → готово к использованию

### 6. Приоритет
Quick fix: **Must do before enterprise self-hosted**
S3 offload: **Must do before SaaS launch**

### 7. Трудозатраты: Quick **M**, S3 offload **L**
### 8. Порядок: Truncation → сразу; Partitioning → с DBA; S3 → после infra setup

---

## 2.5 Kafka topology — single-broker в compose

### 1. Корневая причина
`docker-compose.yml`: один Kafka broker, `replication_factor=1`, `min.insync.replicas=1`. Потеря этого broker = полная остановка delivery pipeline. Нет consumer group rebalancing при scale-out.

**Слой:** Infrastructure / Reliability

### 2. Целевое состояние
- Production: минимум 3 broker для HA
- `replication_factor=3`, `min.insync.replicas=2`
- Consumer group корректно масштабируется
- Topic partitions >= worker instances × concurrency

### 3. План реализации

**Quick fix (1 день):**
1. Добавить `docker-compose.ha.yml` override с 3 brokers:
```yaml
services:
  kafka-1:
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka-1:9093,2@kafka-2:9093,3@kafka-3:9093
  kafka-2:
    environment:
      KAFKA_NODE_ID: 2
  kafka-3:
    environment:
      KAFKA_NODE_ID: 3
```
2. Topic configuration:
```yaml
KAFKA_DEFAULT_REPLICATION_FACTOR: 3
KAFKA_MIN_INSYNC_REPLICAS: 2
KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
```
3. Документация: "Development = 1 broker, Production = 3+ brokers"

**Proper fix (1 неделя):**
- Kafka topic auto-creation disabled в production → explicit topic creation script
- Partition count = max(12, worker_instances × concurrency_per_instance)
- Consumer lag monitoring через Kafka metrics → Prometheus
- Dead letter topic alerting

**Long-term:**
- Managed Kafka (Confluent Cloud, AWS MSK) для SaaS
- Schema registry для message versioning
- Kafka Connect для archival sink (S3, ClickHouse)

### 4. Архитектура
```
Production Kafka cluster:
  3 brokers (KRaft mode, no ZooKeeper)
  Topics:
    deliveries.dispatch      — partitions: 12, RF: 3
    deliveries.retry.1m      — partitions: 6, RF: 3
    deliveries.retry.5m      — partitions: 6, RF: 3
    ... (все retry topics)
    deliveries.dlq           — partitions: 3, RF: 3
    incoming.forward.dispatch — partitions: 6, RF: 3
    incoming.forward.retry   — partitions: 6, RF: 3
```

### 5. Риски
- 3 brokers = 3x RAM/disk → acceptable для production
- Rebalancing при scale-out может вызвать temporary duplicate processing → idempotency (уже есть)

### 6. Приоритет: **Must do before enterprise self-hosted**
### 7. Трудозатраты: **M**
### 8. Порядок: Параллельно с другими infra работами
