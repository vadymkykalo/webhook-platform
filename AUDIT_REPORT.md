# Webhook Platform — Полный аудит Production Readiness & Open Source Quality

**Дата:** Июнь 2025  
**Scope:** Весь репозиторий end-to-end (API, Worker, Common, UI, Docker, CI/CD, тесты, миграции, документация)

---

## 1. Executive Summary

**Общая оценка: 7.5 / 10** — Проект значительно выше среднего open-source уровня, с грамотной архитектурой и зрелыми инженерными решениями. Для полной production-readiness и статуса top-tier OSS необходимо устранить ряд конкретных проблем.

### Что сделано хорошо (сильные стороны)

1. **Транзакционный Outbox + Kafka** — корректная at-least-once семантика, нет потери событий
2. **Tiered Retry с 6 уровнями** (1m → 24h) + DLQ — промышленный подход к retry
3. **Безопасность на высоком уровне** — AES-256-GCM для секретов, HMAC-SHA256 подписи, SSRF-защита, constant-time сравнение
4. **Multi-tenancy с AOP** — OrgAccessAspect обеспечивает изоляцию организаций на уровне аспектов
5. **Rate Limiting с Redis fallback** — Redisson + локальный Bucket4j при недоступности Redis
6. **Concurrency Control** — распределённые семафоры через Redis для ограничения параллелизма по endpoint
7. **Circuit Breaker** — resilience4j + Caffeine с метриками переходов состояний
8. **Data Retention** — автоматическая очистка outbox, delivery attempts с ShedLock
9. **Docker** — non-root контейнеры, multi-stage builds, JVM tuning для контейнеров, healthchecks
10. **CI/CD** — GitHub Actions с unit + integration тестами (Testcontainers), Docker build верификация, фронтенд lint + typecheck

### Основные риски и блокеры для production

| # | Риск | Severity | Где в коде |
|---|------|----------|------------|
| 1 | CSP в nginx не включает динамический API URL (`connect-src 'self'`) | **HIGH** | `nginx.conf:28` |
| 2 | Worker Rate Limiter: fail-open при падении Redis (без локального fallback) | **HIGH** | `worker/.../RedisRateLimiterService.java:63-68` |
| 3 | Нет graceful shutdown с drain для Kafka consumer | **MEDIUM** | `DeliveryConsumer.java` — отсутствие `ContainerStopAction` |
| 4 | `response_body` в delivery_attempts хранится без ограничения размера | **MEDIUM** | `WebhookDeliveryService.java` |
| 5 | Actuator endpoints проксируются наружу через nginx | **HIGH** | `nginx.conf:48-52` |
| 6 | Нет password complexity validation при регистрации | **MEDIUM** | `AuthService.java:67` |
| 7 | Логирование email при forgotPassword (информационная утечка) | **LOW** | `AuthService.java:248` |
| 8 | Отсутствие frontend тестов (unit, integration) | **MEDIUM** | `webhook-platform-ui/` |
| 9 | Docker `COPY . .` в build stage копирует всё, включая `.env` | **MEDIUM** | `Dockerfile` всех модулей |
| 10 | Нет Kafka TLS/SASL в production compose | **MEDIUM** | `docker-compose.prod.yml` |

---

## 2. End-to-End Flow Validation

### 2.1 Outgoing Webhook Flow (API → Kafka → Worker → Endpoint)

```
POST /api/v1/projects/{pid}/events  [X-API-Key auth]
  → ApiKeyAuthenticationFilter: hash(key) → lookup → validate revoked/expired
  → RequestSizeLimitFilter: Content-Length check + streaming limit
  → EventIngestService.ingestEvent():
    1. Idempotency check: idx_events_idempotency_key (project_id, idempotency_key)
    2. Payload size validation
    3. @Transactional: save Event + create Deliveries + create OutboxMessages
  → OutboxPublisherService (scheduled poll 100ms):
    1. SELECT pending FROM outbox_messages ORDER BY created_at LIMIT batch
    2. KafkaTemplate.send() с correlationId
    3. Mark PUBLISHED или FAILED с retry backoff
  → DeliveryConsumer (Kafka listener: deliveries.dispatch + retry topics):
    1. MDC.put("correlationId", ...)
    2. WebhookDeliveryService.processDelivery():
       a. Load delivery + endpoint + subscription
       b. FIFO ordering check (если enabled)
       c. Endpoint verification check
       d. Rate limiting (Redis)
       e. Concurrency control (Redis semaphore)
       f. SSRF validation (UrlValidator)
       g. HMAC-SHA256 signing (WebhookSignatureUtils)
       h. HTTP POST с timeout
       i. Circuit breaker (resilience4j)
       j. Save DeliveryAttempt
       k. Retry → tiered Kafka topic / DLQ
```

**Вердикт:** Основной поток реализован корректно. Outbox pattern гарантирует at-least-once. Idempotency key предотвращает дубли. Ordering через Redis buffer с gap timeout.

### 2.2 Incoming Webhook Flow

```
POST /api/v1/incoming/{token}  [без auth, по ingress token]
  → IngressService.receiveWebhook():
    1. Lookup source по ingressPathToken
    2. Status check (ACTIVE)
    3. Per-source rate limiting
    4. Payload size check
    5. Signature verification (strategy pattern: WebhookVerifierFactory)
    6. Persist IncomingEvent
    7. Create IncomingForwardAttempts + OutboxMessages для каждого destination
  → OutboxPublisher → Kafka (incoming.forward.dispatch)
  → Worker forwards to destinations
```

**Вердикт:** Корректно. Strategy pattern для верификации подписей разных провайдеров — хорошее решение.

### 2.3 Auth Flow

```
POST /api/v1/auth/register
  → AuthRateLimiterService.allowRegister(ip)
  → AuthService.register():
    1. Check email uniqueness
    2. BCrypt hash password
    3. Create User (PENDING_VERIFICATION)
    4. Create Organization + Membership (OWNER)
    5. Send verification email
    6. Generate JWT access + refresh tokens
  → Return tokens (пользователь может работать до верификации)

POST /api/v1/auth/login
  → Rate limit check (ip + email)
  → BCrypt verify → JWT tokens

POST /api/v1/auth/refresh
  → Validate refresh token → blacklist old → issue new pair (rotation)
```

**Вердикт:** Корректная имплементация с rotation. Refresh token blacklisting через Redis.

### 2.4 UI Flow

```
React App (Vite + React Router v6)
  → AuthContext (auth.store.ts) — React Context для состояния auth
  → http.ts (axios) — interceptor:
    1. Auto-attach Bearer token
    2. 401 → auto-refresh с subscriber queue
    3. Refresh failure → logout + clear localStorage
  → ProtectedRoute с role hierarchy (VIEWER < DEVELOPER < OWNER)
  → Lazy-loaded pages с Suspense
  → @tanstack/react-query (staleTime: 5min)
  → sonner toasts через centralized lib/toast.ts с dedup
```

**Вердикт:** Хорошая архитектура. Token refresh с subscriber queue для concurrent requests — правильно. Error boundary на верхнем уровне.

---

## 3. Production Readiness Checklist

### 3.1 CRITICAL (блокеры деплоя)

#### 3.1.1 Nginx CSP блокирует API-запросы в production
- **Файл:** `webhook-platform-ui/nginx.conf:28`
- **Проблема:** `connect-src 'self'` не включает URL API-сервера, если он отличается от origin UI. В dev это работает из-за proxy, но в production с отдельным доменом API — все запросы будут заблокированы.
- **Fix:** CSP должен динамически включать API URL (см. код ниже в секции 3.5)

#### 3.1.2 Actuator endpoints доступны извне через nginx
- **Файл:** `webhook-platform-ui/nginx.conf:48-52`
- **Проблема:** `/actuator/` проксируется без ограничений. В production это даёт доступ к `/actuator/env`, `/actuator/beans`, `/actuator/heapdump` (если включены), что является критической утечкой.
- **Fix:** Ограничить до `/actuator/health` и `/actuator/prometheus`, или добавить auth

#### 3.1.3 Docker build копирует `.env` и секреты в image layer
- **Файл:** `webhook-platform-api/Dockerfile:8`
- **Проблема:** `COPY . .` в build stage копирует `.env`, `.git`, и все секреты. Даже если runtime stage не использует их, они остаются в build layer (extractable с `docker history`).
- **Fix:** Добавить `.dockerignore` (см. код ниже)

### 3.2 HIGH (необходимо до production)

#### 3.2.1 Worker Rate Limiter: fail-open без fallback
- **Файл:** `webhook-platform-worker/src/main/java/com/.../RedisRateLimiterService.java:63-68`
- **Проблема:** При недоступности Redis worker просто пропускает все запросы (`return true`). В API-модуле есть локальный Bucket4j fallback, но в worker его нет.
- **Почему важно:** При падении Redis все rate limits отключаются, что может привести к DDoS клиентских endpoints.

#### 3.2.2 Неограниченный response_body в delivery_attempts
- **Файл:** `WebhookDeliveryService.java` — при записи DeliveryAttempt
- **Проблема:** Response body от клиентского endpoint сохраняется целиком без truncation. Endpoint может вернуть мегабайты данных.
- **Fix:** Truncate до 8KB/16KB перед сохранением.

#### 3.2.3 Отсутствие password complexity validation
- **Файл:** `AuthService.java:67`, `RegisterRequest`
- **Проблема:** Нет проверки сложности пароля (длина, символы). BCrypt сам по себе не защищает от слабых паролей.

#### 3.2.4 Kafka без TLS/SASL в production
- **Файл:** `docker-compose.yml:44-47`
- **Проблема:** Kafka listener использует `PLAINTEXT`. В production с external Kafka нужен как минимум SASL_SSL.

#### 3.2.5 Нет database connection encryption validation
- **Файл:** `docker-compose.yml:155-156`
- **Проблема:** `DB_SSL_MODE=disable` по умолчанию. В `docker-compose.prod.yml` есть `require`, но нет `verify-full`.

### 3.3 MEDIUM (рекомендуется до production)

#### 3.3.1 Нет graceful shutdown drain для Kafka consumer
- **Проблема:** При остановке worker текущие delivery могут быть прерваны, приведя к дублированным доставкам.
- **Fix:** `stop_grace_period: 35s` уже есть в compose, но в коде DeliveryConsumer нет explicit drain logic.

#### 3.3.2 Отсутствие frontend тестов
- **Проблема:** В `webhook-platform-ui/` нет ни одного теста (unit, integration, e2e). CI делает только lint + typecheck + build.

#### 3.3.3 ShedLock таблица без TTL cleanup
- **Проблема:** Таблица `shedlock` будет накапливать записи. Нужен периодический cleanup старых locks.

#### 3.3.4 Нет structured logging format (JSON) в production
- **Проблема:** По умолчанию Spring Boot логирует в text format. Для production с ELK/Loki нужен JSON.

### 3.4 LOW

#### 3.4.1 Информационная утечка в логах
- `AuthService.java:248` — логирует email при password reset
- `AuthService.java:239` — логирует "non-existent email" (можно использовать для enumeration через log access)

#### 3.4.2 Нет API versioning strategy документации
- API использует `/api/v1/`, но нет описания стратегии при переходе на v2.

---

### 3.5 Конкретные примеры кода для критичных исправлений

#### Fix #1: .dockerignore для предотвращения утечки секретов

Создать файл `.dockerignore` в корне проекта:

```dockerignore
# Secrets
.env
.env.*
!.env.dist

# Git
.git
.gitignore

# IDE
.idea
.vscode
*.iml

# Build artifacts
**/target/
**/node_modules/
**/dist/

# Documentation (not needed in image)
docs/
*.md
!README.md

# Backups
backups/
```

#### Fix #2: Локальный fallback для Worker Rate Limiter

```java
// webhook-platform-worker/src/main/java/.../RedisRateLimiterService.java

// Добавить поле:
private final ConcurrentMap<UUID, Bucket> localFallbackBuckets = new ConcurrentHashMap<>();

// Заменить catch-блок в tryAcquire():
} catch (Exception e) {
    log.warn("Redis rate limiter unavailable for endpoint {}, using local fallback: {}",
            endpointId, e.getMessage());
    rateLimitFallback.increment();
    return tryLocalFallback(endpointId, ratePerSecond);
}

// Добавить метод:
private boolean tryLocalFallback(UUID endpointId, int ratePerSecond) {
    Bucket bucket = localFallbackBuckets.computeIfAbsent(endpointId,
            id -> Bucket.builder()
                    .addLimit(Bandwidth.builder()
                            .capacity(ratePerSecond)
                            .refillGreedy(ratePerSecond, Duration.ofSeconds(1))
                            .build())
                    .build());
    boolean acquired = bucket.tryConsume(1);
    if (acquired) {
        rateLimitHits.increment();
    } else {
        rateLimitMisses.increment();
    }
    return acquired;
}
```

#### Fix #3: Ограничение actuator в nginx

```nginx
# Заменить текущий блок location /actuator/ на:
location /actuator/health {
    proxy_pass http://api:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location /actuator/prometheus {
    # Только для внутреннего мониторинга
    allow 10.0.0.0/8;
    allow 172.16.0.0/12;
    allow 192.168.0.0/16;
    deny all;
    proxy_pass http://api:8080;
}

location /actuator/ {
    deny all;
    return 404;
}
```

#### Fix #4: Dynamic CSP с API URL в nginx

```nginx
# В начале server block:
set $csp_connect "connect-src 'self'";

# Добавить API URL из env (через envsubst в Docker entrypoint):
# В Dockerfile UI, заменить CMD на:
# CMD ["/bin/sh", "-c", "envsubst '${VITE_API_URL} ${VITE_CSP_EXTRA_CONNECT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]

# В nginx.conf template:
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; connect-src 'self' ${VITE_API_URL} ${VITE_CSP_EXTRA_CONNECT}; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none';" always;
```

---

## 4. Security Review

### 4.1 Threat Model

| Угроза | Вектор атаки | Текущая защита | Оценка |
|--------|--------------|----------------|--------|
| **SSRF через webhook URL** | Злоумышленник указывает `http://169.254.169.254/` | UrlValidator блокирует private IPs, metadata endpoints, DNS rebinding check | ✅ Хорошо |
| **Brute-force логина** | Перебор паролей | AuthRateLimiterService: по IP + email, Redis + fallback | ✅ Хорошо |
| **JWT token theft** | XSS → localStorage | CSP headers, HttpOnly не используется (localStorage), token blacklisting | ⚠️ Средне |
| **API Key leak** | Key в логах/headers | Хранение hash(key), prefix-only display, revocation | ✅ Хорошо |
| **Cross-tenant access** | Манипуляция orgId | OrgAccessAspect (AOP), projectId→orgId chain validation | ✅ Хорошо |
| **Timing attack на подпись** | Сравнение HMAC | `MessageDigest.isEqual()` (constant-time) | ✅ Хорошо |
| **Secret rotation** | Компрометация ключа | Endpoint secret rotation с grace period + previous key | ✅ Хорошо |
| **ReDoS** | Malicious regex в payload | Нет custom regex обработки payload | ✅ Не применимо |
| **SQL Injection** | Через параметры запросов | JPA/Hibernate parameterized queries | ✅ Хорошо |
| **Denial of Service** | Огромные payload | RequestSizeLimitFilter (streaming), rate limiting | ✅ Хорошо |
| **Email enumeration** | Registration/forgot-password | `register` раскрывает (409 Conflict), `forgotPassword` не раскрывает | ⚠️ Частично |

### 4.2 Конкретные рекомендации по безопасности

1. **JWT в localStorage** — Токены хранятся в `localStorage`, что делает их уязвимыми к XSS. Рекомендация: перейти на `httpOnly` cookie для access token или использовать BFF pattern. Для текущего состояния — CSP является основным барьером.

2. **Email enumeration при регистрации** — `AuthService.register()` возвращает 409 при существующем email. Рекомендация: вернуть 200 и отправить email "вы уже зарегистрированы" (как делает forgotPassword).

3. **BCrypt cost factor** — Используется `new BCryptPasswordEncoder()` (default cost=10). Для 2025 рекомендуется cost=12.

4. **Refresh token не привязан к device/IP** — Любой, кто получит refresh token, может использовать его с любого устройства. Рекомендация: привязать к fingerprint или IP range.

5. **Нет rate limit на API key creation** — Можно создать неограниченное количество API keys.

---

## 5. "Top Open Source" Improvements

### 5.1 Фичи для top-tier OSS статуса

| # | Фича | Приоритет | Сложность |
|---|------|-----------|-----------|
| 1 | **OpenTelemetry tracing** — distributed traces через API → Kafka → Worker → Endpoint | HIGH | MEDIUM |
| 2 | **Webhook Replay из UI** — bulk replay failed deliveries с фильтрами | HIGH | LOW (backend есть, нужен UI) |
| 3 | **Event Catalog / Schema Registry** — описание event types с JSON Schema validation | MEDIUM | HIGH |
| 4 | **Webhook Simulator** — встроенный playground для тестирования без реального endpoint | MEDIUM | MEDIUM |
| 5 | **Grafana dashboard templates** — готовые JSON dashboards для Prometheus метрик | HIGH | LOW |
| 6 | **Helm Chart** — для Kubernetes deployment | HIGH | MEDIUM |
| 7 | **Terraform module** — для AWS/GCP инфраструктуры | MEDIUM | MEDIUM |
| 8 | **GitHub App для incoming webhooks** — zero-config приём GitHub webhooks | LOW | MEDIUM |
| 9 | **Webhook delivery analytics** — p50/p95/p99 latency dashboard в UI | MEDIUM | MEDIUM |
| 10 | **Multi-region support** — документация и конфигурация для multi-DC | LOW | HIGH |

### 5.2 Процессы для top-tier OSS

1. **Semantic Versioning + CHANGELOG automation** — CHANGELOG.md есть, но нужен автоматический release flow (semantic-release или release-please)
2. **GitHub Releases с artifacts** — Docker images в GHCR при tag push
3. **Dependabot / Renovate** — автообновление зависимостей
4. **CodeQL / Snyk** — автоматический security scanning в CI
5. **DCO / CLA** — Contributor License Agreement для enterprise adoption
6. **Benchmarks** — воспроизводимые performance benchmarks с публичными результатами
7. **API changelog** — документация breaking changes между версиями API
8. **Community templates** — Discussion templates, Feature Request шаблон
9. **E2E тесты** — Playwright для UI, integration тесты для полного flow
10. **Badges** — code coverage, security scan status, Docker image size

---

## 6. Quick Wins (10-20 быстрых улучшений)

| # | Улучшение | Усилие | Влияние |
|---|-----------|--------|---------|
| 1 | Добавить `.dockerignore` (Fix #1 выше) | 5 мин | 🔴 Security |
| 2 | Ограничить actuator в nginx (Fix #3 выше) | 10 мин | 🔴 Security |
| 3 | Truncate response_body в DeliveryAttempt до 16KB | 15 мин | 🟡 Stability |
| 4 | Добавить password complexity validation (`@Size(min=8)`, regex) | 15 мин | 🟡 Security |
| 5 | JSON logging profile для production (`logback-spring.xml`) | 20 мин | 🟡 Observability |
| 6 | Добавить `@Validated` на RegisterRequest password | 5 мин | 🟡 Security |
| 7 | Заменить `new BCryptPasswordEncoder()` на `@Bean` с cost=12 | 5 мин | 🟢 Security |
| 8 | Добавить Dependabot `dependabot.yml` | 5 мин | 🟢 Maintenance |
| 9 | Добавить `/api/v1/health` публичный endpoint (вместо actuator через nginx) | 10 мин | 🟢 Operations |
| 10 | Маскировать email в логах `forgotPassword` | 5 мин | 🟢 Security |
| 11 | Добавить `X-Request-Id` response header для correlation | 15 мин | 🟢 Debugging |
| 12 | Добавить Docker healthcheck для UI container (nginx) | 5 мин | 🟢 Operations |
| 13 | Index на `delivery_attempts(created_at)` для retention cleanup | 5 мин | 🟢 Performance |
| 14 | Добавить `connection-timeout` и `socket-timeout` в SMTP config | 5 мин | 🟢 Stability |
| 15 | Добавить OpenAPI `@SecurityRequirement` на protected endpoints | 15 мин | 🟢 DX |
| 16 | Добавить `robots.txt` и `sitemap.xml` для landing page | 5 мин | 🟢 SEO |
| 17 | Добавить GitHub branch protection rules документацию | 10 мин | 🟢 Process |
| 18 | Worker: добавить metric для delivery latency histogram | 15 мин | 🟡 Observability |
| 19 | Локальный fallback в Worker Rate Limiter (Fix #2 выше) | 20 мин | 🟡 Reliability |
| 20 | Добавить `CODEOWNERS` файл | 5 мин | 🟢 Process |

---

## Заключение

Webhook Platform — это **зрелый, хорошо архитектурированный проект** с правильными инженерными решениями:
- Transactional outbox, tiered retry, circuit breaker — промышленный уровень
- Безопасность (AES-GCM, HMAC-SHA256, SSRF protection, constant-time comparison) — выше среднего
- Multi-tenancy с AOP — корректная изоляция
- DevOps (Docker, Makefile, CI/CD, healthchecks) — продуманный DX

**Основные области для улучшения:**
1. **Security hardening** — .dockerignore, actuator lockdown, CSP dynamic API URL
2. **Reliability** — Worker rate limiter fallback, response body truncation
3. **Observability** — JSON logging, OpenTelemetry, Grafana dashboards
4. **Testing** — Frontend тесты, E2E тесты
5. **OSS maturity** — Helm chart, semantic releases, security scanning в CI

После устранения CRITICAL и HIGH issues из секции 3, проект готов к production deployment.
