# План ремедиации — Часть 6: ФИНАЛЬНЫЙ ПЛАН 30/60/90, ЗАВИСИМОСТИ, TOP-5

---

# ПРИОРИТИЗИРОВАННЫЙ ПЛАН 30 / 60 / 90 ДНЕЙ

---

## День 1–30: Стабилизация для Limited Prod / Enterprise Self-Hosted

### Неделя 1 (критические security fixes):
| # | Задача | Трудозатраты | Зависимости |
|---|--------|-------------|-------------|
| 1 | **Startup validator** — `SecurityConfigValidator`: блокировать `allow_private_ips=true` при `APP_ENV=production` (dev compose default `true` корректен) | S (1ч) | Нет |
| 2 | **Invite token** удалить из MemberResponse (quick fix) | S (30мин) | Нет |
| 3 | **API Key scope enforcement** — quick fix (scope в token → AuthContext → RbacUtil) | S (1-2д) | Нет |
| 4 | **Connection pool tuning** — API=20, Worker=30, документировать | S (1ч) | Нет |

### Неделя 2 (reliability + data):
| # | Задача | Трудозатраты | Зависимости |
|---|--------|-------------|-------------|
| 5 | **Delivery attempts truncation** — 2KB для success, 10KB для errors | S (1д) | Нет |
| 6 | **Aggressive retention** для success attempts (14 дней вместо 90) | S (1д) | Нет |
| 7 | **Adaptive retry poll interval** в RetryGovernor | S (1д) | Нет |
| 8 | **Circuit breaker integration** в retry scheduler — skip OPEN endpoints | S (1д) | #7 |

### Неделя 3 (UX + infra):
| # | Задача | Трудозатраты | Зависимости |
|---|--------|-------------|-------------|
| 9 | **Onboarding wizard** (5 шагов, использует existing API) | M (3-4д) | Нет |
| 10 | **Simplified navigation** (advanced section collapsed) | S (1-2д) | Нет |
| 11 | **Empty states** с CTA на всех list pages | S (2д) | Нет |
| 12 | **Materialized view** для dashboard stats + scheduled refresh | M (2-3д) | #4 |

### Неделя 4 (packaging + docs):
| # | Задача | Трудозатраты | Зависимости |
|---|--------|-------------|-------------|
| 13 | **Helm chart MVP** (API + Worker + UI deployments, secrets, HPA) | M (4-5д) | Нет |
| 14 | **Production checklist** документ | S (1д) | Нет |
| 15 | **Runbooks** для top-5 инцидентов | M (2-3д) | Нет |
| 16 | **SLO определения** документ | S (1д) | Нет |

**Итог 30 дней:** платформа готова к limited prod / enterprise self-hosted deployment. Security holes закрыты, reliability улучшена, basic UX для онбординга, Helm chart для K8s.

---

## День 31–60: Подготовка к SaaS Launch

### Неделя 5-6 (billing foundation):
| # | Задача | Трудозатраты | Зависимости |
|---|--------|-------------|-------------|
| 17 | **Plan catalog** — DB schema, PlanService, seed plans | M (3-4д) | Нет |
| 18 | **Quota enforcement** — Redis counters, QuotaEnforcementService | M (4-5д) | #17 |
| 19 | **Per-org rate limiting** (plan-aware) | M (3д) | #17 |
| 20 | **Tenant suspension/throttle** admin API | S (2д) | #17 |

### Неделя 7-8 (auth + billing + metering):
| # | Задача | Трудозатраты | Зависимости |
|---|--------|-------------|-------------|
| 21 | **httpOnly cookie** для refresh token (backend + frontend) | M (3д) | Нет |
| 22 | **Token rotation** + family detection | M (2-3д) | #21 |
| 23 | **Stripe billing integration** — checkout, portal, webhook handler | L (5-7д) | #17, #18 |
| 24 | **Incoming usage metering** — реальные counts вместо нулей | S (1д) | Нет |
| 25 | **Invite token hashing** (proper fix) | S (2д) | #2 |
| 26 | **Granular API key scopes** | M (5д) | #3 |

### Неделя 8 (infrastructure):
| # | Задача | Трудозатраты | Зависимости |
|---|--------|-------------|-------------|
| 27 | **Kafka 3-broker** reference config + docker-compose.ha.yml | M (2-3д) | Нет |
| 28 | **Dockerfile hardening** (non-root, minimal base) | S (1-2д) | Нет |
| 29 | **NetworkPolicy** templates в Helm chart | S (1д) | #13 |

**Итог 60 дней:** billing foundation, tenant governance, secure auth, production-grade infra. Ready for private beta SaaS.

---

## День 61–90: SaaS Launch Readiness

### Неделя 9-10 (frontend polish + billing UX):
| # | Задача | Трудозатраты | Зависимости |
|---|--------|-------------|-------------|
| 30 | **BillingPage** полный redesign (plan, usage bars, upgrade) | M (4-5д) | #23 |
| 31 | **Usage indicator** в sidebar | S (1-2д) | #18 |
| 32 | **Quota warning banners** (80%/90%/100%) | S (1-2д) | #18 |
| 33 | **QuotaGuard** на create buttons | S (1д) | #18 |
| 34 | **Information Architecture** redesign sidebar | M (3-4д) | #10 |

### Неделя 11-12 (high-load + operations):
| # | Задача | Трудозатраты | Зависимости |
|---|--------|-------------|-------------|
| 35 | **Redis-based retry scheduling** (primary) + DB fallback | L (7-10д) | #7, Redis infra |
| 36 | **Delivery attempts partitioning** (pg_partman) | M (3-4д) | DBA support |
| 37 | **S3/MinIO offload** для response bodies | L (5-7д) | MinIO/S3 infra |
| 38 | **Anomaly detection** + auto-throttle | M (3-4д) | #19 |
| 39 | **Prometheus alerting rules** + Grafana dashboards | M (4-5д) | Prometheus infra |
| 40 | **DLQ UX improvements** — bulk retry, failure drill-down | M (3-4д) | Нет |
| 41 | **Terraform module** (AWS reference) | L (5-7д) | #13, #27 |

**Итог 90 дней:** полная SaaS readiness — billing, tenant isolation, high-load protections, monitoring, enterprise infra packaging.

---

# КАРТА ЗАВИСИМОСТЕЙ

```
#1 allow_private_ips ────────────────────────────── (independent)
#2 invite token leak ──────────────── #25 hashing ─── (sequential)
#3 API key scope quick ──────────── #26 granular ──── (sequential)
#4 connection pool ──────────────── #12 mat.views ─── (enables)

#7 adaptive retry ──── #8 CB integration ─── #35 Redis retry ─ (chain)

#9 onboarding wizard ─────────────────────────────── (independent)
#10 simplified nav ──────────────── #34 IA redesign ── (sequential)
#11 empty states ─────────────────────────────────── (independent)

#13 Helm chart ──────── #29 NetworkPolicy ─── #41 Terraform ── (chain)

#17 plan catalog ──┬── #18 quota enforce ──┬── #30 billing UX
                   ├── #19 rate limiting   ├── #31 usage indicator
                   ├── #20 admin API       ├── #32 warnings
                   └── #23 Stripe ─────────└── #33 quota guard

#21 httpOnly cookie ── #22 token rotation ─── (sequential)

#24 incoming metering ────────────────────────────── (independent)
#27 Kafka 3-broker ───────────────────────────────── (independent)
#28 Dockerfile hardening ─────────────────────────── (independent)

#36 partitioning ──── #37 S3 offload ──────── (chain)
#38 anomaly detection ────────────────────────────── (depends on #19)
#39 Prometheus ───────────────────────────────────── (independent)
#40 DLQ UX ───────────────────────────────────────── (independent)
```

---

# TOP-5 ФИКСОВ С НАИБОЛЬШИМ ROI

| Ранг | Фикс | Почему высокий ROI |
|------|-------|-------------------|
| **1** | **API Key scope enforcement** (#3) | P0 security → 1-2 дня работы, закрывает основную auth дыру. Без этого нельзя давать API ключи внешним пользователям. |
| **2** | **Invite token удаление из response** (#2) | 30 минут работы → закрывает data leak. Абсолютный maximum ROI: минимальные усилия, критический security fix. |
| **3** | **Plan catalog + Quota enforcement** (#17, #18) | Фундамент для monetization. Без quotas невозможен SaaS. Redis counters = proven pattern, хорошо ложится на существующий Redis stack. |
| **4** | **Onboarding wizard** (#9) | Существующий API `getOnboardingStatus()` уже готов. 3-4 дня frontend → радикально улучшает первый опыт пользователя, снижает churn. |
| **5** | **Helm chart** (#13) | Единственный blocker для enterprise K8s customers. Docker-compose недостаточен для production K8s. 4-5 дней → открывает enterprise self-hosted рынок. |

---

# TOP-5 НАИБОЛЕЕ ОПАСНЫХ НЕРЕШЁННЫХ РИСКОВ (если ничего не менять)

| Ранг | Риск | Последствия |
|------|------|-------------|
| **1** | **API Key scope не enforced** | READ_ONLY ключ может создавать endpoints, менять subscriptions, отправлять events. Если ключ утечёт — полный write доступ к проекту. Для SaaS это showstopper — ни один enterprise customer не примет. |
| **2** | **Tokens в localStorage** | Любая XSS уязвимость (даже в third-party зависимости) → полная компрометация всех сессий. Refresh token в localStorage = persistent session hijack. При SaaS с множеством tenants это катастрофа. |
| **3** | **Нет quotas / abuse prevention** | Один злонамеренный (или просто buggy) tenant может: (а) исчерпать все ресурсы (noisy neighbor), (б) создать миллионы events без оплаты, (в) использовать платформу как DDoS amplifier через webhook delivery. Без quotas SaaS = убыточный бизнес. |
| **4** | **Delivery attempts 500GB/month growth** | PostgreSQL не рассчитан на time-series в таком объёме. Через 3-6 месяцев: (а) queries замедляются, (б) vacuum не успевает, (в) disk full → database crash. Без partitioning и archival — это ticking time bomb. |
| **5** | **Single Kafka broker + DB-centric retry** | Потеря Kafka broker = полная остановка delivery pipeline. DB retry polling при 10K+ pending retries = degraded performance для всех tenants. При росте нагрузки оба bottleneck проявятся одновременно. |

---

# ДОПОЛНИТЕЛЬНЫЕ ПРЕДПОЛОЖЕНИЯ

1. **Предположение:** `incoming_events` не имеет прямого `project_id` — связь через `incoming_sources.project_id`. При большом объёме incoming events → нужна denormalization или materialized view для efficient counting.

2. **Предположение:** CryptoUtils.hashApiKey() использует SHA-256 и подходит для хэширования invite tokens. Если hash function другая — проверить collision resistance.

3. **Предположение:** Redis уже используется в production configuration. Если self-hosted customer не хочет Redis → нужен in-memory fallback для rate limiting и caching (Caffeine cache + local rate limiter). Redis-based retry scheduling (#35) станет optional.

4. **Предположение:** Stripe выбран как billing provider. Если требуется Paddle (для EU VAT) или LemonSqueezy — архитектура та же, адаптер другой. BillingService → interface → Stripe/Paddle implementation.

5. **Предположение:** Kubernetes — primary deployment target для enterprise. Если часть customers на bare-metal/VMs — docker-compose + systemd guides нужны параллельно с Helm charts.

---

# МАТРИЦА ПРИОРИТЕТОВ (СВОДНАЯ)

| Категория | Issue | Milestone | Effort | Risk if unresolved |
|-----------|-------|-----------|--------|--------------------|
| Security | API key scope | Limited prod | S | CRITICAL |
| Security | Invite token leak | Limited prod | S | HIGH |
| Security | localStorage tokens | SaaS launch | M | CRITICAL |
| Security | allow_private_ips | Limited prod | S | HIGH |
| Backend | Retry scheduler adaptive | Self-hosted | S | MEDIUM |
| Backend | Incoming metering zeros | SaaS launch | S | LOW |
| Backend | PostgreSQL bottlenecks | Self-hosted | M | HIGH |
| Backend | Attempts storage growth | Self-hosted | M | CRITICAL |
| Backend | Kafka single-broker | Self-hosted | M | HIGH |
| SaaS | Plan catalog + quotas | SaaS launch | L | CRITICAL |
| SaaS | Stripe billing | SaaS launch | L | CRITICAL |
| SaaS | Tenant governance | SaaS launch | M | HIGH |
| Frontend | Onboarding wizard | Self-hosted | M | MEDIUM |
| Frontend | Navigation redesign | SaaS launch | M | MEDIUM |
| Frontend | Billing UX | SaaS launch | M | HIGH |
| Frontend | DLQ/incident UX | SaaS launch | M | MEDIUM |
| Infra | Helm chart | Self-hosted | M | HIGH |
| Infra | Runbooks/SLO | Self-hosted | M | MEDIUM |
| Infra | Dockerfile hardening | Self-hosted | S | MEDIUM |
| Infra | Terraform | SaaS launch | L | LOW |
| Infra | Prometheus/Grafana | SaaS launch | M | MEDIUM |

---

# РЕКОМЕНДАЦИЯ ДЛЯ ENGINEERING LEADERSHIP

## Немедленные действия (эта неделя):
1. Применить #1 (allow_private_ips), #2 (invite token), #4 (pool tuning) — **суммарно 2 часа работы**
2. Начать #3 (API key scope) — **1-2 дня, P0 security**

## Sprint 1 (следующие 2 недели):
3. Reliability: #5, #6, #7, #8 (attempts cleanup + retry improvements)
4. UX: #9, #10, #11 (onboarding + nav)

## Sprint 2 (недели 3-4):
5. Infra: #13, #14, #15, #16 (Helm + docs)
6. Data: #12 (materialized views)

## Эпик "SaaS Foundation" (месяц 2):
7. #17-#20 (billing + tenant governance)
8. #21-#22 (httpOnly auth)
9. #23-#26 (Stripe + granular scopes)

## Эпик "SaaS Launch" (месяц 3):
10. #30-#34 (billing UX + IA redesign)
11. #35-#41 (high-load + monitoring + terraform)

Каждый пункт уже содержит достаточно деталей для создания Jira epic → stories → implementation tasks.
