# Production backend audit (high-load, multi-tenant) — 2026-03-04

## Scope checked
- API ingest + ingress + outbox + auth/tenant checks
- Worker delivery + retry schedulers + incoming forward pipeline
- DB migrations/indexes
- Runtime config defaults (`application.yml`, `.env.dist`, `docker-compose.yml`)

---

## A) Readiness score (0-10)
- Scalability: **6/10**
- Reliability: **5/10**
- Security: **5/10**

Почему не выше:
1) есть robust-основа (transactional outbox, `FOR UPDATE SKIP LOCKED`, retry scheduler, circuit breaker, ordering buffer),
2) но присутствуют production-критичные риски в default-конфиге и в деградационных ветках обработки (silent drop / non-cluster fallback / poison message path).

---

## 1) Runtime flow map (факт по коду)

### Outgoing flow
1. `POST /api/v1/events` -> `EventController` (API key auth + per-project rate limit) -> `EventIngestService`.
2. В одной транзакции создаются `events` + `deliveries` + `outbox_messages` (`PENDING`).
3. `OutboxPublisherService` по scheduler claim-ит outbox batch, публикует в Kafka topic `DELIVERIES_DISPATCH`, затем фиксирует `PUBLISHED/FAILED/DEAD`.
4. Worker `DeliveryConsumer` читает Kafka и вызывает `WebhookDeliveryService.processDelivery`.
5. `WebhookDeliveryService` делает HTTP-вызов endpoint, записывает `delivery_attempts`, обновляет `deliveries` статус (`SUCCESS` / `PENDING(next_retry_at)` / `DLQ`).
6. `RetrySchedulerService` регулярно публикует due retries в tiered retry topics (`1m/5m/15m/1h/6h/24h`).

### Incoming flow
1. `POST /ingress/{token}` -> `IngressService`.
2. Проверки: source status, rate limit, payload size, signature verification.
3. Сохраняется `incoming_events`.
4. Для каждой destination создаются `incoming_forward_attempts (attempt=1, PENDING)` + outbox message в `INCOMING_FORWARD_DISPATCH`.
5. Worker `IncomingForwardConsumer` -> `IncomingForwardService`: HTTP forwarding + update attempt status + scheduling retry (через новые attempt rows `PENDING`).
6. `IncomingForwardRetryScheduler` публикует due retry rows в `INCOMING_FORWARD_RETRY`.

---

## B) Top 10 P0 issues (критично для прод)

### P0-1 (Effort: S)
**Опасный default: SSRF защита фактически ослаблена в compose/.env defaults (`WEBHOOK_ALLOW_PRIVATE_IPS=true`).**
- Риск: случайный деплой с дефолтом разрешит вызовы во внутреннюю сеть/metadata.
- Фикс: default -> `false` в `.env.dist` и `docker-compose.yml`; отдельный `dev` override.

### P0-2 (Effort: S)
**Security hardening зависит от `APP_ENV=production`, но default — `development`.**
- Риск: production safety validator не срабатывает в misconfigured среде.
- Фикс: enforce `APP_ENV=production` на уровне deploy manifests + CI lint.

### P0-3 (Effort: M)
**Poison-message path в Kafka consumers: после retries сообщение не отправляется в DLQ topic автоматически.**
- Факт: `DefaultErrorHandler` логирует, но нет `DeadLetterPublishingRecoverer`.
- Риск: трудный post-mortem, возможные потери/ручной recovery.
- Фикс: DLT per topic + метрики + алерты.

### P0-4 (Effort: M)
**Incoming forward может завершиться ранним `return` без терминального статуса попытки (event/destination missing, destination disabled), но offset подтверждается.**
- Риск: silent drop/несогласованность state machine.
- Фикс: всегда записывать terminal `FAILED`/`DLQ` attempt reason перед ack.

### P0-5 (Effort: M)
**Retry reschedule при Kafka проблемах без jitter (фиксированные 30/60 сек в scheduler paths).**
- Риск: synchronized retry storm после восстановления брокера.
- Фикс: экспоненциальный backoff + jitter (как минимум full jitter).

### P0-6 (Effort: M)
**Global rate limit fallback не распределённый: при падении Redis каждый pod использует локальный bucket.**
- Риск: реальный global cap растёт ~ линейно с числом pod.
- Фикс: fail-closed/fail-safe policy для ingest/ingress + shared fallback механизм.

### P0-7 (Effort: L)
**Подбор подписок для event ingest выполняется in-memory (`findByProjectIdAndEnabledTrue().stream().filter(matches)`).**
- Риск: CPU/latency деградация при большом количестве wildcard subscriptions.
- Фикс: routing index/materialized matcher, DB prefilter по префиксам/типам.

### P0-8 (Effort: M)
**Sequence для FIFO хранится в Redis (`RAtomicLong`) без durable БД-источника.**
- Риск: reset/несогласованность после потери Redis state; конфликт с уникальным индексом `(endpoint_id, sequence_number)`.
- Фикс: sequence source в Postgres (endpoint_sequence table/sequence), Redis только cache.

### P0-9 (Effort: S)
**`SWAGGER_ENABLED=true` по default в `.env.dist` и compose env default.**
- Риск: раскрытие API surface при ошибочном прод-конфиге.
- Фикс: default `false`, включать только в dev.

### P0-10 (Effort: M)
**Sensitive payload retention: raw incoming body/headers и delivery request/response body сохраняются в БД в открытом виде.**
- Риск: высокий blast-radius при утечках/дампах, compliance risk.
- Фикс: policy-based encryption/masking at write-time + stricter retention for raw blobs.

---

## C) Top 10 P1 improvements
1. Вынести `HttpClient` pool sizing (`maxConnections=200`) в env-конфиг для production tuning.
2. Ввести tenant-aware fairness в retry/dispatch schedulers (чтобы noisy tenant не давил остальных).
3. Добавить per-tenant метрики в delivery/incoming pipelines.
4. Добавить circuit breaker и для incoming forwarding destinations.
5. Отдельные DLT retention + replay tooling для poison сообщений.
6. Стандартизовать trace propagation через Kafka (headers + span link).
7. Перейти на partitioned таблицы (time-based) для `delivery_attempts`, `incoming_events`.
8. Добавить readiness checks не только процессные, но и dependency-level (db rw, kafka produce/consume, redis latency).
9. Ужесточить SLA по cleanup и vacuum/maintenance на high-churn таблицах.
10. Сделать fail-safe profile matrix (dev/stage/prod) с автоматическим policy validation в CI.

---

## D) Quick-win plan

### Next 7 days
1. Перевернуть defaults: `WEBHOOK_ALLOW_PRIVATE_IPS=false`, `SWAGGER_ENABLED=false`.
2. В production manifests зафиксировать `APP_ENV=production`.
3. Добавить Kafka DLT wiring (`DeadLetterPublishingRecoverer`) для delivery/incoming consumers.
4. Исправить incoming-forward early-return paths на терминальные статусы.
5. В retry scheduler добавить jitter в reschedule ветки.

### Next 30 days
1. Реализовать durable sequence source в Postgres.
2. Перенести subscription matching в индексируемый routing слой.
3. Внедрить partitioning + retention tiers для attempt/event history.
4. Ввести per-tenant fair scheduling и quota enforcement.
5. Усилить data protection для raw payloads (encryption/masking/TTL).

---

## E) Target backend architecture (incremental, no rewrite)
1. **Ingestion**: API writes event + deliveries + outbox atomically (оставить).
2. **Outbox**: claim/publish/ack + DLT for poison publish failures.
3. **Workers**: endpoint-isolated concurrency + tenant quotas + jittered retries.
4. **Queue strategy**: dispatch topics + retry tiers + explicit poison DLT topics.
5. **Partitioning**: key by `tenant:endpoint` (или endpoint + tenant quota layer).
6. **DLQ operations**: UI/API для replay from DLT с guardrails.
7. **Storage**: hot partitions (7-30 days), cold archive for compliance.
8. **Observability**: SLO dashboards (queue depth, lag, p95 delivery latency, per-tenant error budgets).

---

## Checked files (evidence sources)
- `webhook-platform-api/src/main/java/com/webhook/platform/api/controller/EventController.java`
- `webhook-platform-api/src/main/java/com/webhook/platform/api/service/EventIngestService.java`
- `webhook-platform-api/src/main/java/com/webhook/platform/api/service/IngressService.java`
- `webhook-platform-api/src/main/java/com/webhook/platform/api/service/OutboxPublisherService.java`
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/consumer/DeliveryConsumer.java`
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/consumer/IncomingForwardConsumer.java`
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/service/WebhookDeliveryService.java`
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/service/IncomingForwardService.java`
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/service/RetrySchedulerService.java`
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/service/IncomingForwardRetryScheduler.java`
- `webhook-platform-worker/src/main/java/com/webhook/platform/worker/config/KafkaConsumerConfig.java`
- `webhook-platform-api/src/main/resources/application.yml`
- `webhook-platform-worker/src/main/resources/application.yml`
- `webhook-platform-api/src/main/resources/db/migration/V001__initial_schema.sql`
- `docker-compose.yml`
- `.env.dist`
