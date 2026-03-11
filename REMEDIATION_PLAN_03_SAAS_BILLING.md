# План ремедиации — Часть 3: SaaS / BILLING / MULTI-TENANCY

---

## 3.1 Billing / plans / quotas отсутствуют

### 1. Корневая причина
`BillingPage.tsx` — заглушка "Coming Soon". Бэкенд не имеет: модели планов, quota enforcement, billing integration, entitlements engine. `UsageDailyAggregator` собирает статистику, но она не привязана к лимитам.

**Слой:** Product / Backend / Frontend

### 2. Целевое состояние
- Plan catalog (free/starter/pro/enterprise) с чёткими лимитами
- Real-time quota enforcement на hot path (event ingestion, endpoint creation)
- Usage → billing adapter → invoice/payment
- Self-service план management в UI
- Graceful degradation (429 + UI warning, не hard block)

### 3. План реализации

#### Phase 1: Plan catalog + Quota enforcement (2-3 недели)

**DB Schema — Flyway V032:**
```sql
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    events_per_month BIGINT,             -- NULL = unlimited
    endpoints_limit INT,
    team_members_limit INT,
    incoming_sources_limit INT,
    retention_days INT NOT NULL DEFAULT 30,
    rate_limit_per_second INT NOT NULL DEFAULT 10,
    features JSONB NOT NULL DEFAULT '{}',
    price_monthly_cents BIGINT,
    price_yearly_cents BIGINT,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (name, display_name, events_per_month, endpoints_limit,
                   team_members_limit, incoming_sources_limit, retention_days,
                   rate_limit_per_second, price_monthly_cents, sort_order)
VALUES
('free',       'Free',       10000,    3,    2,  1,  7,   10,  0,     0),
('starter',    'Starter',    100000,   10,   5,  5,  30,  50,  2900,  1),
('pro',        'Pro',        1000000,  50,   20, 20, 90,  200, 9900,  2),
('enterprise', 'Enterprise', NULL,     NULL, NULL, NULL, 365, 1000, NULL, 3);

ALTER TABLE organizations ADD COLUMN plan_id UUID REFERENCES plans(id);
ALTER TABLE organizations ADD COLUMN plan_period_start TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN plan_period_end TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN billing_email VARCHAR(255);
ALTER TABLE organizations ADD COLUMN stripe_customer_id VARCHAR(255);

-- Assign free plan to existing orgs
UPDATE organizations SET plan_id = (SELECT id FROM plans WHERE name = 'free')
WHERE plan_id IS NULL;

CREATE TABLE usage_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    counter_type VARCHAR(50) NOT NULL,  -- events, incoming_events
    period_start DATE NOT NULL,
    counter_value BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, counter_type, period_start)
);
CREATE INDEX idx_usage_counters_org ON usage_counters(organization_id, period_start);
```

**Backend сервисы:**

`PlanService.java`:
```java
@Service
public class PlanService {
    private final PlanRepository planRepository;
    private final OrganizationRepository orgRepository;
    private final RedisTemplate<String, String> redis;

    // Cached plan lookup (Redis TTL 5min)
    public Plan getCachedPlan(UUID organizationId) {
        String cacheKey = "plan:" + organizationId;
        String planJson = redis.opsForValue().get(cacheKey);
        if (planJson != null) return deserialize(planJson);

        Organization org = orgRepository.findById(organizationId).orElseThrow();
        Plan plan = planRepository.findById(org.getPlanId()).orElseThrow();
        redis.opsForValue().set(cacheKey, serialize(plan), Duration.ofMinutes(5));
        return plan;
    }

    public List<Plan> getPublicPlans() { ... }
    public void assignPlan(UUID orgId, UUID planId) { ... }
}
```

`QuotaEnforcementService.java`:
```java
@Service
public class QuotaEnforcementService {
    private final PlanService planService;
    private final RedisTemplate<String, Long> redisTemplate;

    // Hot path — вызывается при каждом event ingestion
    public void checkEventQuota(UUID organizationId) {
        Plan plan = planService.getCachedPlan(organizationId);
        if (plan.getEventsPerMonth() == null) return; // unlimited

        String key = "quota:events:" + organizationId + ":" + currentYearMonth();
        Long current = redisTemplate.opsForValue().increment(key);
        if (current == 1L) {
            redisTemplate.expire(key, Duration.ofDays(32));
        }

        if (current > plan.getEventsPerMonth()) {
            throw new QuotaExceededException(
                "Monthly event limit reached",
                current, plan.getEventsPerMonth());
        }

        // Warning threshold (80%)
        if (current == (long)(plan.getEventsPerMonth() * 0.8)) {
            // Async: fire alert/notification
            alertService.fireQuotaWarning(organizationId, "events", current, plan.getEventsPerMonth());
        }
    }

    public void checkEndpointLimit(UUID organizationId, long currentCount) { ... }
    public void checkMemberLimit(UUID organizationId, long currentCount) { ... }
    public void checkIncomingSourceLimit(UUID organizationId, long currentCount) { ... }
}
```

**Точки интеграции:**
- `EventIngestService.ingestEvent()` → `quotaService.checkEventQuota(orgId)` (до создания event)
- `EndpointService.createEndpoint()` → `quotaService.checkEndpointLimit(orgId, count)`
- `MembershipService.addMember()` → `quotaService.checkMemberLimit(orgId, count)`
- `IncomingSourceService.create()` → `quotaService.checkIncomingSourceLimit(orgId, count)`

**Exception handling:**
```java
public class QuotaExceededException extends RuntimeException {
    private final long current;
    private final long limit;
    // → HTTP 429 через @ExceptionHandler
    // Body: { error: "quota_exceeded", current: 10000, limit: 10000, upgradeUrl: "/billing" }
}
```

**Self-hosted mode:** feature flag `billing.enabled=false` → skip all quota checks:
```java
@ConditionalOnProperty(name = "billing.enabled", havingValue = "true")
@Service
public class QuotaEnforcementService { ... }

// No-op bean when billing disabled:
@ConditionalOnProperty(name = "billing.enabled", havingValue = "false", matchIfMissing = true)
@Service
public class NoOpQuotaEnforcementService implements QuotaEnforcement { /* no-op */ }
```

**Тесты:**
- Unit: quota exceeded → 429
- Unit: unlimited plan → всегда pass
- Unit: 80% threshold → warning fired
- Integration: create endpoint beyond limit → 403
- Integration: self-hosted mode (billing.enabled=false) → no enforcement

#### Phase 2: Billing adapter — Stripe (3-4 недели)

**Новые зависимости:** `com.stripe:stripe-java:25.x`

**BillingService.java:**
```java
@Service
@ConditionalOnProperty("billing.stripe.enabled")
public class StripeBillingService {
    @Value("${billing.stripe.secret-key}")
    private String stripeSecretKey;

    public String createCheckoutSession(UUID orgId, String planName, String successUrl, String cancelUrl) {
        // Stripe Checkout Session → redirect URL
    }

    public String createPortalSession(UUID orgId) {
        // Stripe Customer Portal → manage subscription
    }

    public void handleWebhook(String payload, String sigHeader) {
        // Verify signature, dispatch events:
        // checkout.session.completed → assignPlan
        // invoice.paid → renew period
        // invoice.payment_failed → notify + grace
        // customer.subscription.deleted → downgrade to free
    }
}
```

**Webhook endpoint:**
```java
@RestController
@RequestMapping("/hook/stripe")
public class StripeWebhookController {
    @PostMapping
    public ResponseEntity<Void> handleStripeWebhook(
            @RequestBody String payload,
            @RequestHeader("Stripe-Signature") String sigHeader) {
        billingService.handleWebhook(payload, sigHeader);
        return ResponseEntity.ok().build();
    }
}
```
Примечание: `/hook/**` уже `permitAll()` в SecurityConfig.

**Invoice/Dunning state machine:**
```
States: TRIAL → ACTIVE → PAYMENT_DUE → GRACE_PERIOD(3d) → SUSPENDED → CANCELLED
Transitions:
  checkout.complete → ACTIVE
  invoice.paid → ACTIVE (renew)
  invoice.payment_failed → GRACE_PERIOD
  grace_period_expired → SUSPENDED (reduce limits to free plan)
  manual_cancel / subscription.deleted → CANCELLED → downgrade to free
```

DB: `ALTER TABLE organizations ADD COLUMN billing_status VARCHAR(30) DEFAULT 'ACTIVE';`

#### Phase 3: Frontend billing UX (2 недели)

**Новые страницы/компоненты:**

`PricingSection.tsx`:
- Plan comparison cards (free/starter/pro/enterprise)
- Feature comparison matrix
- Monthly/yearly toggle
- CTA: "Upgrade" → Stripe Checkout redirect

`BillingPage.tsx` (переписать заглушку):
- Секции:
  1. Current Plan card (name, price, next billing date)
  2. Usage meters (events: progress bar + number)
  3. Plan comparison (upgrade/downgrade buttons)
  4. Manage payment → Stripe Customer Portal
  5. Invoice history (from Stripe API)

`UsageIndicator.tsx` (sidebar widget):
```tsx
<div className="px-3 py-2 border-t">
  <div className="text-xs text-muted-foreground mb-1">Events this month</div>
  <Progress value={(usage/limit)*100} className="h-1.5" />
  <div className="text-xs mt-1">{usage.toLocaleString()} / {limit.toLocaleString()}</div>
</div>
```

**API:**
```typescript
// billing.api.ts
export const billingApi = {
  getPlans: () => http.get<Plan[]>('/api/v1/billing/plans'),
  getCurrentPlan: (orgId: string) => http.get<OrgPlan>(`/api/v1/orgs/${orgId}/plan`),
  getUsage: (orgId: string) => http.get<OrgUsage>(`/api/v1/orgs/${orgId}/usage`),
  createCheckout: (orgId: string, planName: string) =>
    http.post<{ url: string }>(`/api/v1/orgs/${orgId}/billing/checkout`, { planName }),
  createPortal: (orgId: string) =>
    http.post<{ url: string }>(`/api/v1/orgs/${orgId}/billing/portal`),
};
```

**i18n:** ключи `billing.plans.*`, `billing.usage.*`, `billing.checkout.*` для en/uk

### 4. Компоненты системы (summary)

| Компонент | Тип | Ответственность |
|---|---|---|
| `PlanService` | Backend | CRUD планов, assign, cached lookup |
| `QuotaEnforcementService` | Backend | Real-time проверка лимитов (Redis) |
| `StripeBillingService` | Backend | Stripe integration, webhook handling |
| `BillingController` | Backend | REST API для checkout, portal, plans |
| `UsageMeterService` | Backend | Redis INCR + nightly reconciliation |
| `DunningStateMachine` | Backend | Invoice status transitions |
| `PricingSection` / `BillingPage` | Frontend | Plan selection, payment, invoices |
| `UsageIndicator` | Frontend | Sidebar usage widget |
| `QuotaWarningBanner` | Frontend | In-context 80%/90%/100% warnings |

### 5. Риски и компромиссы
- Redis counter drift при restart → nightly reconciliation с DB (usage_counters + usage_daily)
- Stripe = external dependency → webhook retry + idempotency keys
- Self-hosted без billing: feature flag отключает enforcement — не забыть тестировать оба режима
- Graceful degradation: не блокировать in-flight deliveries, только новые ingestions

### 6. Приоритет: **Must do before SaaS launch** (все 3 фазы)
### 7. Трудозатраты: Phase 1 **L**, Phase 2 **L**, Phase 3 **M** → Итого **XL** (7-9 недель)
### 8. Порядок: Phase 1 → Phase 2 → Phase 3 (строго последовательно)

---

## 3.2 Tenant quotas / abuse prevention / governance

### 1. Корневая причина
- Per-project rate limit фиксирован (`WEBHOOK_PROJECT_RATE_LIMIT_PER_SECOND=50`), не per-plan
- Нет abuse detection (аномальные spikes)
- Нет noisy neighbor protection
- Нет admin controls для suspension/throttling отдельных tenants

**Слой:** Backend / Security / Product

### 2. Целевое состояние
- Per-plan rate limits (из Plan catalog)
- Per-org fair queuing в worker
- Anomaly detection + auto-throttle
- Admin API для manual governance

### 3. План реализации

**Quick fix (1 неделя):**

1. **Per-org rate limit (plan-aware):**
```java
// TenantRateLimitInterceptor — на ingestion endpoint
public class TenantRateLimitInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request, ...) {
        if (!"/api/v1/events".equals(request.getRequestURI())) return true;

        // Extract orgId from auth context
        UUID orgId = extractOrgId(request);
        Plan plan = planService.getCachedPlan(orgId);

        String key = "ratelimit:org:" + orgId + ":" + Instant.now().getEpochSecond();
        Long count = redis.opsForValue().increment(key);
        redis.expire(key, Duration.ofSeconds(2));

        if (count > plan.getRateLimitPerSecond()) {
            response.setStatus(429);
            response.getWriter().write(
                "{\"error\":\"rate_limit_exceeded\",\"retryAfter\":1}");
            return false;
        }
        return true;
    }
}
```

2. **Tenant suspension flag:**
```sql
ALTER TABLE organizations ADD COLUMN suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN suspended_reason TEXT;
ALTER TABLE organizations ADD COLUMN suspended_at TIMESTAMPTZ;
```
Проверка в `AuthContextArgumentResolver` или interceptor:
```java
if (organization.isSuspended()) {
    throw new ForbiddenException("Account suspended: " + organization.getSuspendedReason());
}
```

3. **Admin governance API:**
```java
@RestController
@RequestMapping("/api/v1/admin/tenants")
@PreAuthorize("hasRole('SUPER_ADMIN')") // или отдельный admin auth
public class TenantAdminController {
    @PostMapping("/{orgId}/suspend")
    public void suspend(@PathVariable UUID orgId, @RequestBody SuspendRequest req) {
        orgService.suspend(orgId, req.getReason());
    }

    @PostMapping("/{orgId}/throttle")
    public void throttle(@PathVariable UUID orgId, @RequestParam int rateLimit) {
        // Override plan rate limit in Redis
        redis.opsForValue().set("throttle:org:" + orgId, String.valueOf(rateLimit));
    }

    @PostMapping("/{orgId}/resume")
    public void resume(@PathVariable UUID orgId) {
        orgService.resume(orgId);
        redis.delete("throttle:org:" + orgId);
    }
}
```

**Proper fix (2-3 недели):**

1. **Anomaly detection:**
```java
@Scheduled(fixedDelay = 60000)
public void detectAnomalies() {
    // Для каждого активного org:
    // 1. Текущий rate (Redis counter за последнюю минуту)
    // 2. Средний rate за последний час
    // 3. Если current > 5 * average → auto-throttle + alert
    // 4. Если current > 10 * average → suspend + critical alert
}
```

2. **Fair queuing в worker (noisy neighbor protection):**
- Kafka message key = endpointId (уже так) → partition-level isolation
- Добавить per-org concurrency limit в worker:
```java
// В DeliveryConsumer:
Semaphore orgSemaphore = orgSemaphores.computeIfAbsent(orgId,
    k -> new Semaphore(maxConcurrentPerOrg));
if (!orgSemaphore.tryAcquire(100, TimeUnit.MILLISECONDS)) {
    // Re-queue with backoff
}
```

### 4. Архитектура
```
[Event Ingestion]
  → TenantRateLimitInterceptor
    → Check suspended flag (Redis cached)
    → Check throttle override (Redis)
    → Check plan rate limit (Redis)
    → QuotaEnforcementService (monthly volume)
  → EventIngestService

[Worker]
  → Per-org concurrency semaphore
  → Per-endpoint rate limit (уже есть)
  → Circuit breaker (уже есть)
  → Fair queuing: round-robin across orgs when backlogged

[Monitoring]
  → AnomalyDetectionJob (1 min)
    → Auto-throttle + alert при spikes
  → AdminDashboard
    → Top tenants by volume
    → Throttled/suspended tenants
```

### 5. Риски
- Per-org rate limiting = +1 Redis call на hot path (~0.5ms)
- False positive в anomaly detection → manual override + auto-resume через 1h
- Fair queuing усложняет consumer → начать с per-org concurrency limit

### 6. Приоритет: **Must do before SaaS launch**
### 7. Трудозатраты: Quick **M**, Proper **L**
### 8. Порядок: Зависит от Plan catalog (#3.1 Phase 1). Параллельно с billing adapter.
