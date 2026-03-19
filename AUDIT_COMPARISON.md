# Верификация внешнего аудита: факт-чек по коду

**Дата:** Июнь 2025
**Метод:** Построчная проверка каждого claim внешнего аудита против реального кода в репозитории

---

## TL;DR

| # | Claim внешнего аудита | Вердикт | Комментарий |
|---|----------------------|---------|-------------|
| P0-1 | Публичный actuator/prometheus + tenant IDs в метриках | ✅ **ВЕРНО** | Реальная проблема, я её недооценил |
| P0-2 | Endpoint verification выключена | ✅ **ВЕРНО, но severity завышен** | Факт верный, P0 спорно |
| P0-3 | testEndpoint() обходит SSRF post-connect | ✅ **ВЕРНО** | Реальный gap, я пропустил |
| P0-4 | Нет replay protection для HMAC ingress | ✅ **ВЕРНО, но P1 а не P0** | Требует перехват TLS-трафика |
| P1-5 | Secret rotation без grace period | ✅ **ВЕРНО** | Поля есть, логика не реализована |
| P1-6 | Ordering state только в Redis с TTL | ✅ **ВЕРНО** | 24h TTL, нет DB fallback |
| P1-7 | Wildcard subscriptions in-memory filter | ✅ **ВЕРНО, но severity завышен** | O(N) при N < 100 не проблема |
| P1-8 | Correlation теряется на async boundary | ✅ **ВЕРНО** | Outbox scheduler = новый MDC |
| P1-9 | ApiKeyFilter MDC загрязнение | ❌ **НЕВЕРНО** | JwtFilter.finally чистит MDC |
| P1-9b | Raw API key в principal | ⚠️ **Формально верно, low severity** | Стандартный Spring Security паттерн |
| P1-10 | Payloads без masking | ✅ **ВЕРНО, но есть truncation** | 2KB/10KB truncation + header sanitization |

**Итого: 8 из 10 claims верны по факту кода. 1 неверный (MDC). Несколько с завышенным severity.**

---

## Детальный разбор каждого claim

### P0-1: Публичный actuator/prometheus + tenant IDs в метриках — ✅ ВЕРНО

**Что утверждает аудитор:** `/actuator/prometheus` открыт без auth, метрики содержат `project_id`, `source_id`, `event_type`.

**Что в коде:**

```java
// SecurityConfig.java:54-56
.requestMatchers("/actuator/health", "/actuator/health/**",
        "/actuator/info", "/actuator/prometheus")
.permitAll()
```

Метрики с high-cardinality tenant labels:
```java
// EventIngestService.java:160
Counter.builder("events_ingested_total").tag("event_type", request.getType())...

// EventIngestService.java:183
Counter.builder("rules_drop_total").tag("project_id", projectId.toString())...

// EventIngestService.java:280
Counter.builder("deliveries_created_total").tag("project_id", projectId.toString())...

// IngressService.java:117, 180, 225
meterRegistry.counter("incoming_events_deduplicated_total",
        "source_id", source.get().getId().toString())
meterRegistry.counter("incoming_events_rejected_total",
        "source_id", source.getId().toString(), ...)
meterRegistry.counter("incoming_events_received_total",
        "source_id", source.getId().toString(),
        "provider_type", source.getProviderType().name())
```

**Вердикт:** ✅ Полностью подтверждено. Это реальная проблема, которую **мой аудит недооценил** — я поймал только Worker management port (P0-10), но пропустил:
1. API module тоже имеет публичный `/actuator/prometheus`
2. High-cardinality labels `project_id`, `source_id`, `event_type` в метриках

**Примечание:** `provider_type` (enum) — bounded label, это ОК. Но `project_id`, `source_id`, `event_type` — unbounded, реальный risk cardinality explosion.

---

### P0-2: Endpoint verification выключена — ✅ ВЕРНО (но severity спорный)

**Что утверждает аудитор:** Default = SKIPPED, verification challenge не создаётся при createEndpoint(), worker пропускает SKIPPED.

**Что в коде:**

```java
// Endpoint.java:88
@Builder.Default
private VerificationStatus verificationStatus = VerificationStatus.SKIPPED;

// EndpointService.createEndpoint():83-92 — builder БЕЗ установки verificationStatus
Endpoint endpoint = Endpoint.builder()
        .projectId(projectId)
        .url(request.getUrl())
        // ... нет .verificationStatus(...)
        .build();

// WebhookDeliveryService.java:196-197 — worker принимает SKIPPED
if (endpoint.getVerificationStatus() != Endpoint.VerificationStatus.VERIFIED
        && endpoint.getVerificationStatus() != Endpoint.VerificationStatus.SKIPPED) {
    // block delivery
}
```

`EndpointVerificationService` существует с полной логикой challenge/response, но `createEndpoint()` его **не вызывает**.

**Вердикт:** ✅ Факт верный. Но P0 ли это?

**Контраргумент:** Endpoint создаётся через authenticated API (JWT или API Key). Пользователь уже имеет доступ к проекту. SSRF защита стоит на обоих слоях (UrlValidator pre-connect + SsrfProtectionCustomizer post-connect). Endpoint verification — это proof-of-ownership, не SSRF protection. В большинстве webhook платформ (Stripe, GitHub, Slack) endpoint verification опциональна.

**Моя оценка:** **P1**, не P0. Для enterprise SaaS с strict compliance — да, P0. Для типичного SaaS — P1.

---

### P0-3: testEndpoint() обходит SSRF post-connect — ✅ ВЕРНО

**Что утверждает аудитор:** `testEndpoint()` использует обычный WebClient без `SsrfProtectionCustomizer`, а production worker использует post-connect DNS rebinding check.

**Что в коде:**

```java
// EndpointService.java:54-56 — обычный WebClient
this.webClient = webClientBuilder
        .defaultHeader("User-Agent", "WebhookPlatform/1.0-Test")
        .build();  // ← НЕТ SsrfProtectionCustomizer

// EndpointVerificationService.java:63-65 — тоже обычный WebClient
WebClient webClient = webClientBuilder
        .defaultHeader("User-Agent", "WebhookPlatform/1.0 Verification")
        .build();  // ← НЕТ SsrfProtectionCustomizer

// Сравни с Worker:
// WebhookDeliveryService.java:101
HttpClient ssrfSafeHttpClient = SsrfProtectionCustomizer.createHttpClient(
        webhookConnectionProvider, allowPrivateIps);  // ← ЕСТЬ post-connect check
```

Обе функции (`testEndpoint` и `verify`) делают только pre-connect `UrlValidator.validateWebhookUrl()` check, но не имеют post-connect IP validation. DNS rebinding attack vector:
1. DNS resolves to public IP → проходит UrlValidator
2. TCP connect → DNS resolves to 169.254.169.254 (metadata endpoint)
3. Без post-connect check → request уходит на metadata

**Вердикт:** ✅ Полностью подтверждено. Это реальный gap. **Мой аудит это пропустил.** Аудитор также правильно заметил, что `EndpointVerificationService.verify()` имеет ту же проблему.

---

### P0-4: Нет replay protection для generic HMAC ingress — ✅ ВЕРНО (но P1, не P0)

**Что утверждает аудитор:** `GenericHmacVerifier` проверяет только подпись + timestamp tolerance 300s, нет nonce/replay cache. Если `providerEventId` не извлёкся — нет dedup.

**Что в коде:**

```java
// GenericHmacVerifier.java:40-42 — только signature + timestamp
if (signature.contains("t=") && signature.contains("v1=")) {
    boolean valid = WebhookSignatureUtils.verifySignature(secret, signature, body);
    return valid ? VerificationResult.success() : VerificationResult.failure("Signature mismatch");
}

// WebhookSignatureUtils.java:62-66 — timestamp tolerance 300s, NO nonce
long timeDiff = Math.abs(currentTime - timestamp);
if (timeDiff > toleranceSeconds * 1000) {
    return false;
}

// IngressService.java:188-201 — dedup ТОЛЬКО по providerEventId
String providerEventId = ProviderEventIdExtractor.extract(request, body);
if (providerEventId != null) {
    // dedup check
}
// Если providerEventId == null → НЕТ dedup
```

`ProviderEventIdExtractor` ищет только well-known headers (Stripe, GitHub, Shopify, Twilio, generic X-Webhook-Id). Для custom integrations без этих headers → `providerEventId = null` → no dedup.

**Вердикт:** ✅ Факт верный. Но P0 ли это?

**Контраргумент:**
- Replay требует перехвата **валидного подписанного запроса** (= TLS compromise или app-level access)
- Окно replay = 300 секунд
- Последствия replay = duplicate IncomingEvent + forward attempts
- Downstream idempotency (Idempotency-Key header) есть

**Моя оценка:** **P1**, не P0. Для "взрыва production" нужен и TLS compromise, и traffic capture. Для compliance-critical систем (финансы) — да, P0. Для обычного SaaS — P1.

---

### P1-5: Secret rotation без grace period — ✅ ВЕРНО

**Что утверждает аудитор:** Entity имеет `secretPreviousEncrypted` и grace period поля, но `rotateSecret()` их не использует.

**Что в коде:**

```java
// Endpoint.java:39-50 — поля СУЩЕСТВУЮТ
private String secretPreviousEncrypted;
private String secretPreviousIv;
private Instant secretRotatedAt;
@Builder.Default
private Integer secretRotationGracePeriodHours = 24;

// EndpointService.rotateSecret():175-181 — НЕ ИСПОЛЬЗУЕТ эти поля
String newSecret = CryptoUtils.generateSecureToken(32);
CryptoUtils.EncryptedData encrypted = encryptionKeyRegistry.encrypt(newSecret);
endpoint.setSecretEncrypted(encrypted.getCiphertext());
endpoint.setSecretIv(encrypted.getIv());
// ← НЕТ: endpoint.setSecretPreviousEncrypted(old)
// ← НЕТ: endpoint.setSecretRotatedAt(Instant.now())
```

**Вердикт:** ✅ Полностью подтверждено. Data model готова, бизнес-логика не реализована. Это реальный reliability gap — downstream consumers получат invalid signature сразу после rotation.

---

### P1-6: Ordering state только в Redis с TTL — ✅ ВЕРНО

**Что утверждает аудитор:** Sequence cursor полностью в Redis, `deliveredSeqTtlHours = 24`, нет Postgres fallback.

**Что в коде:**

```java
// OrderingBufferService.java:93
bucket.set(sequenceNumber, deliveredSeqTtl);  // deliveredSeqTtl = 24 hours

// OrderingBufferService.java:56-66 — canDeliver logic
public boolean canDeliver(UUID endpointId, long sequenceNumber) {
    Long lastDelivered = getLastDeliveredSequence(endpointId);
    if (lastDelivered == null) {
        return sequenceNumber == 1;  // ← после TTL expiry!
    }
    return sequenceNumber == lastDelivered + 1;
}
```

Сценарий проблемы: endpoint с редкими ordered events (1 event/day):
1. seq=5 delivered, cursor = 5 (Redis TTL = 24h)
2. 25 часов проходит, cursor expired
3. seq=6 arrives → lastDelivered = null → canDeliver returns false (6 ≠ 1)
4. Delivery буферизуется → gap timeout (60s) → eventually proceeds, но с задержкой

**Вердикт:** ✅ Полностью подтверждено. Redis-only state с TTL — реальная проблема для low-frequency ordered endpoints.

---

### P1-7: Wildcard subscriptions in-memory filter — ✅ ВЕРНО (severity завышен)

**Что утверждает аудитор:** `findWildcardSubscriptions(projectId)` тянет все wildcard subs, потом `EventTypeMatcher.matches()` фильтрует in-memory.

**Что в коде:**

```java
// SubscriptionRepository.java:21-23
@Query("SELECT s FROM Subscription s WHERE s.projectId = :projectId AND s.enabled = true " +
       "AND s.eventType LIKE '%*%'")
List<Subscription> findWildcardSubscriptions(@Param("projectId") UUID projectId);

// EventIngestService.java:212-215
List<Subscription> wildcardMatches = subscriptionRepository
        .findWildcardSubscriptions(projectId).stream()
        .filter(s -> EventTypeMatcher.matches(s.getEventType(), request.getType()))
        .toList();
```

**Вердикт:** ✅ Факт верный. Но severity завышен:
- Типичный проект имеет 1-20 wildcard subscriptions, не тысячи
- `EventTypeMatcher.matches()` — это pattern match, не тяжёлая операция
- Bottleneck станет реальным только при 500+ wildcard subs per project

**Моя оценка:** P2 для текущего масштаба, P1 при 1000+ subscriptions per project. Аудитор прав в принципе, но на практике это не hot path bottleneck.

---

### P1-8: Correlation теряется на async boundary — ✅ ВЕРНО

**Что утверждает аудитор:** Outbox publisher scheduler не имеет MDC от исходного request, генерит новый UUID.

**Что в коде:**

```java
// OutboxPublisherService.java:214-217
String correlationId = CorrelationIdFilter.getCurrentCorrelationId();
if (correlationId == null) {
    correlationId = UUID.randomUUID().toString();  // ← ВСЕГДА генерит новый!
}
```

`OutboxPublisherService.publishPendingMessages()` — это `@Scheduled` метод, выполняется в scheduler thread. `CorrelationIdFilter.getCurrentCorrelationId()` → `MDC.get("correlationId")` → **всегда null** в scheduler thread.

`OutboxMessage` entity **не имеет** поля `correlationId` — correlation ID из исходного HTTP request **не персистится** в DB.

**Вердикт:** ✅ Полностью подтверждено. End-to-end trace: API request → outbox → Kafka → worker — **разрывается** на outbox publisher. Это реальная observability проблема.

---

### P1-9: ApiKeyAuthFilter MDC загрязнение + raw key — ❌ ЧАСТИЧНО НЕВЕРНО

**Что утверждает аудитор:** Фильтр кладёт projectId в MDC, но не удаляет его в finally. Также raw API key передаётся в auth principal.

**Что в коде:**

```java
// ApiKeyAuthenticationFilter.java:54 — ставит MDC без finally
MDC.put("projectId", apiKey.getProjectId().toString());
// ... 
filterChain.doFilter(request, response);  // ← нет try/finally cleanup

// НО: JwtAuthenticationFilter.java:75-81 — ЧИСТИТ projectId!
try {
    filterChain.doFilter(request, response);
} finally {
    MDC.remove("organizationId");
    MDC.remove("userId");
    MDC.remove("projectId");  // ← ЧИСТИТ projectId!
}
```

**Порядок фильтров** (SecurityConfig):
```java
.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
.addFilterBefore(apiKeyAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
```

Execution: **JwtFilter** → ApiKeyFilter → rest of chain. JwtFilter wraps `filterChain.doFilter()` в try/finally, который включает выполнение ApiKeyFilter. Когда ApiKeyFilter ставит `MDC.put("projectId", ...)`, JwtFilter's `finally { MDC.remove("projectId") }` гарантированно его очищает.

**Вердикт по MDC:** ❌ **НЕВЕРНО.** JwtFilter's finally block чистит `projectId` из MDC. MDC pollution **не происходит** при нормальном flow.

**Raw API key в principal:**
```java
// ApiKeyAuthenticationFilter.java:47-48
ApiKeyAuthenticationToken authentication = new ApiKeyAuthenticationToken(
        apiKeyValue,  // ← raw key value
```

**Вердикт по raw key:** ⚠️ Формально верно — raw API key хранится в SecurityContext на время request. Но это стандартный Spring Security паттерн (аналогично `UsernamePasswordAuthenticationToken` хранит пароль). Key живёт только в memory, на время одного request. **Low severity.**

**Итого по P1-9:** Аудитор **ошибся** по главному claim (MDC pollution). Raw key claim — формально верный, но low severity и стандартная практика.

---

### P1-10: Payloads без masking — ✅ ВЕРНО (но есть mitigations)

**Что утверждает аудитор:** Ingress сохраняет full body, headers, clientIp. Worker сохраняет request/response bodies. Нет masking pipeline.

**Что в коде:**

```java
// IngressService.java:210-211
.headersJson(headersJson)
.bodyRaw(body)  // ← full body

// WebhookDeliveryService.java:618-622 — differential truncation
boolean isSuccess = statusCode != null && statusCode >= 200 && statusCode < 300;
int responseBodyLimit = isSuccess ? 2048 : 10240;  // 2KB vs 10KB
int requestBodyLimit = 10240;  // 10KB
```

**Уже есть mitigations:**
- Differential truncation (2KB success / 10KB error) в delivery attempts
- `HeaderSanitizer` для response headers
- `HeaderSanitizer.maskSignature()` для request headers
- `maxPayloadSizeBytes = 524288` (512KB) limit на ingress

**Чего нет:**
- PII masking/redaction pipeline
- Configurable body storage policy (store/sample/never)
- Auto-redaction для known PII patterns

**Вердикт:** ✅ Факт верный — полного masking нет. Но аудитор не упомянул существующие mitigations (truncation, header sanitization). Severity зависит от compliance requirements.

---

## Оценка общих scores внешнего аудита

| Область | Внешний аудит | Мой аудит | Пересмотренная оценка | Обоснование |
|---------|--------------|-----------|----------------------|-------------|
| **Security** | 4/10 | 8/10 | **6.5/10** | Есть реальные gaps (actuator, SSRF в testEndpoint), но фундамент сильный: JWT+APIKey, RBAC, AES-GCM, dual-layer SSRF на production path, HMAC-SHA256, constant-time comparison, token blacklist. 4/10 = "фундаментально сломано", это неправда. |
| **Reliability** | 5/10 | 8/10 | **7/10** | Secret rotation gap и Redis-only ordering — реальные issues. Но outbox pattern, circuit breaker, DLQ, retry с jitter, stuck recovery, optimistic locking — всё работает. 5/10 слишком жёстко. |
| **Scalability** | 6/10 | 8/10 | **7/10** | Cardinality explosion и wildcard O(N) — валидные concerns. Но Kafka async, per-project fairness, adaptive governor, backpressure — уже есть. 6/10 недооценивает существующую инфраструктуру. |
| **Общий** | 5/10 | 7.9/10 | **6.5-7/10** | Правда посередине. |

---

## Что внешний аудит нашёл, а я пропустил

| # | Находка | Severity |
|---|---------|----------|
| 1 | **Публичный `/actuator/prometheus` на API** + high-cardinality tenant labels | P0 |
| 2 | **testEndpoint() и EndpointVerificationService без post-connect SSRF** | P0 |
| 3 | **Endpoint verification SKIPPED по умолчанию** | P1 (не P0) |
| 4 | **Replay protection отсутствует для generic HMAC ingress** | P1 |
| 5 | **Secret rotation grace period не реализован** (поля есть, логика нет) | P1 |
| 6 | **Ordering cursor Redis-only с TTL** (нет Postgres fallback) | P1 |
| 7 | **Correlation ID теряется на outbox publisher boundary** | P1 |
| 8 | **CorrelationIdFilter не валидирует входящий X-Correlation-ID** | P2 |

**Это существенные находки. Внешний аудитор глубже проанализировал ingress path, endpoint lifecycle и ordering semantics.**

---

## Что мой аудит нашёл, а внешний пропустил

| # | Находка | Severity |
|---|---------|----------|
| 1 | **JwtUtil парсит токен 6 раз** per request (6× HMAC overhead) | P0 |
| 2 | **RedisRateLimiterService.trySetRate** на каждый delivery (лишние Redis RTT) | P0 |
| 3 | **RedisConcurrencyControlService.trySetPermits** аналогичная проблема | P0 |
| 4 | **CircuitBreakerService race condition** в recordSuccess (non-atomic Redis ops) | P0 |
| 5 | **OutboxPublisherService.cleanupOldMessages** — длинная @Transactional | P0 |
| 6 | **batchMarkFailed** — одинаковая ошибка для всех messages | P0 |
| 7 | **N+1 в triggerBufferedDeliveries** (per-delivery DB query) | P1 |
| 8 | **Двойной cleanup** в DataRetentionService + OutboxPublisherService | P1 |
| 9 | **WorkflowEngine CallerRunsPolicy** может блокировать workflow thread | P1 |
| 10 | **Outbox query ROW_NUMBER()** без оптимального composite index | P1 |

**Мой аудит глубже проанализировал performance bottlenecks, Redis interaction patterns и внутренние race conditions.**

---

## Где внешний аудит ошибся или завысил severity

### 1. ❌ MDC pollution в ApiKeyAuthenticationFilter (P1-9)
**Ошибка факта.** JwtAuthenticationFilter.finally `MDC.remove("projectId")` гарантированно чистит MDC. Аудитор не проследил filter chain ordering.

### 2. ⬆️ Endpoint verification = P0 (P0-2)
**Завышен severity.** Endpoint verification — это proof-of-ownership, не SSRF protection. SSRF защита (UrlValidator + SsrfProtectionCustomizer) стоит отдельно и работает. Для webhook платформы SKIPPED by default — нормальная практика (Stripe, GitHub не требуют verification для создания endpoint). **P1, не P0.**

### 3. ⬆️ HMAC replay = P0 (P0-4)
**Завышен severity.** Replay attack требует:
- Перехват TLS-трафика (= compromise)
- Replay в 300s окне
- Последствия = duplicate event (не data breach)
- Downstream idempotency key частично mitigation

**P1, не P0.**

### 4. ⬆️ Wildcard subscriptions = P1 (P1-7)
**Завышен severity для текущего масштаба.** O(N) in-memory match при N < 100 — microseconds. Станет проблемой при 1000+ wildcard subs per project. **P2 сейчас, P1 на масштабе.**

### 5. ⬆️ Общий score 5/10
**Слишком жёстко.** Платформа имеет:
- Полноценный outbox pattern с SELECT FOR UPDATE SKIP LOCKED
- Dual-layer SSRF protection на production delivery path
- Circuit breaker + rate limiter + concurrency control с Redis fallback
- DLQ + stuck recovery + stale escalation
- AES-GCM encryption + key rotation support
- Tiered Kafka retry topics
- Optimistic locking + atomic claims
- Graceful shutdown

5/10 подразумевает "половина работы не сделана". Реальность: **фундамент прочный, есть конкретные gaps в edge paths (testEndpoint, ingress, ordering).**

---

## Консолидированный action plan

### Неделя 1: Объединённые P0 (оба аудита)

| # | Задача | Источник | Усилие |
|---|--------|----------|--------|
| 1 | Закрыть `/actuator/prometheus` за auth или internal network | Внешний P0-1 | S |
| 2 | Убрать `project_id`, `source_id`, `event_type` из Micrometer tags | Внешний P0-1 | M |
| 3 | Добавить `SsrfProtectionCustomizer` в `EndpointService` и `EndpointVerificationService` | Внешний P0-3 | S |
| 4 | JwtUtil — один `parseToken` вместо 6 per request | Мой P0-3 | S |
| 5 | Кэшировать `trySetRate`/`trySetPermits` initialization | Мой P0-5/6 | S |
| 6 | CircuitBreaker — Lua script для atomic evaluate | Мой P0-7 | S |
| 7 | OutboxPublisher cleanup → batch txTemplate | Мой P0-9 | S |
| 8 | batchMarkFailed — per-message error | Мой P0-1 | S |

### Неделя 2: Объединённые P1

| # | Задача | Источник | Усилие |
|---|--------|----------|--------|
| 1 | Replay cache для generic HMAC ingress (Redis, 5 min TTL) | Внешний P0-4→P1 | S |
| 2 | Secret rotation grace period implementation | Внешний P1-5 | M |
| 3 | Ordering cursor → durable in Postgres, Redis = cache | Внешний P1-6 | M |
| 4 | Correlation ID persist в OutboxMessage entity | Внешний P1-8 | S |
| 5 | Endpoint verification default → PENDING (feature flag) | Внешний P0-2→P1 | S |
| 6 | N+1 fix в triggerBufferedDeliveries | Мой P1-2 | S |
| 7 | Claim+read → одна транзакция | Мой P1-4 | S |
| 8 | CorrelationIdFilter — validate input length/charset | Внешний obs-4 | S |

### Неделя 3-4: Hardening

| # | Задача | Источник | Усилие |
|---|--------|----------|--------|
| 1 | OpenTelemetry distributed tracing | Мой P1-1 | M |
| 2 | Wildcard subscription precompiled matcher cache | Внешний P1-7 | M |
| 3 | Custom headers blocklist (Authorization, Cookie) | Мой P2-5 | S |
| 4 | Payload storage policy (configurable masking) | Внешний P1-10 | M |
| 5 | Dependency-specific health indicators (Kafka/Redis) | Внешний obs-5 | S |
| 6 | WorkflowEngine AbortPolicy | Мой P1-6 | S |

---

## Заключение

**Внешний аудит — качественная работа.** 8 из 10 конкретных claims подтверждены кодом. Аудитор нашёл реальные gaps, которые я пропустил (публичные метрики с tenant IDs, SSRF в testEndpoint, ingress replay, ordering durability, secret rotation, correlation loss).

**Где внешний аудитор ошибся:**
- MDC pollution claim (P1-9) — **фактическая ошибка** (JwtFilter чистит MDC)
- Общий score **5/10 слишком жёсткий** — не учитывает прочный фундамент

**Где внешний аудитор пропустил:**
- Performance bottlenecks (JwtUtil 6× parse, Redis RTT per delivery)
- Internal race conditions (CircuitBreaker non-atomic ops)
- Operational issues (duplicate cleanup, batch error messages)

**Правильный composite score: 6.5-7/10.** Платформа имеет зрелую архитектуру с конкретными gaps в edge paths. Не "половина работы не сделана" (5/10), но и не "всё ОК" (8/10).

**Рекомендация:** Объединить findings обоих аудитов в единый action plan (см. выше). Приоритет: actuator + SSRF testEndpoint + JWT parsing + Redis caching — это даст максимальный impact за минимальные усилия.
