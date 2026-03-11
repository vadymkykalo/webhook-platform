# План ремедиации — Часть 4: FRONTEND / UX

---

## 4.1 UI перегружен, онбординг слабый

### 1. Корневая причина
- Боковая навигация `AppLayout.tsx` — 20+ пунктов при раскрытии проекта (outgoing, incoming, rules, workflows, transformations, alerts, DLQ, usage, connections, test endpoints)
- Новый пользователь после регистрации → пустой dashboard без guidance
- `Connection Setup` страница существует, но не является обязательным first-run шагом
- `DashboardService.getOnboardingStatus()` возвращает checklist, но UI не использует его как wizard
- Нет simplified/advanced mode toggle
- Advanced features (rules, workflows, transformations) видны новичку наравне с базовыми

**Слой:** Frontend / Product

### 2. Целевое состояние
- First-run wizard: 5 шагов (Project → Endpoint → Subscription → API Key → Test Event)
- Simplified навигация по умолчанию (advanced features скрыты)
- Progressive disclosure: features появляются по мере использования
- Context-aware empty states с actionable CTA
- Persona-based navigation toggle

### 3. План реализации

#### Quick fix (1 неделя)

**1. Onboarding wizard — `OnboardingWizard.tsx`:**
```tsx
// Компонент показывается при:
// - Первый вход после регистрации
// - Или: onboardingStatus.hasEndpoints === false && hasSubscriptions === false

// Шаги (каждый вызывает реальный API):
const steps = [
  {
    title: t('onboarding.welcome.title'),      // "Добро пожаловать в Hookflow!"
    description: t('onboarding.welcome.desc'),  // "Настроим ваш первый webhook за 2 минуты"
    // Автоматически используем текущий projectId
  },
  {
    title: t('onboarding.endpoint.title'),      // "Куда отправлять webhooks?"
    // Форма: URL + Description
    // API: POST /api/v1/projects/{id}/endpoints
  },
  {
    title: t('onboarding.subscription.title'),  // "На какие события подписать?"
    // Форма: Event type(s) dropdown + auto-selected endpoint
    // API: POST /api/v1/projects/{id}/subscriptions
  },
  {
    title: t('onboarding.apikey.title'),        // "Создать API ключ"
    // Автоматическое создание + показать ключ (copy button)
    // API: POST /api/v1/projects/{id}/api-keys
  },
  {
    title: t('onboarding.test.title'),          // "Отправить тестовый event"
    // Copy-paste curl команда с реальным API key и project URL
    // "Run" кнопка: POST /api/v1/events через API
    // Показать результат delivery
  },
];
```

Интеграция:
- `ProjectDashboard.tsx` → проверять `getOnboardingStatus()` → если не complete, показать wizard overlay
- Каждый шаг: "Skip" + "Next" кнопки
- По завершении: `localStorage.setItem('onboarding_completed_' + projectId, 'true')`

**2. Улучшенные empty states:**

Для каждой list page (EndpointsPage, SubscriptionsPage, EventsPage, DeliveriesPage):
```tsx
// Вместо пустой таблицы:
<EmptyState
  icon={<Webhook className="h-12 w-12 text-muted-foreground/50" />}
  title={t('endpoints.empty.title')}        // "Нет endpoints"
  description={t('endpoints.empty.desc')}    // "Создайте первый endpoint для приёма webhooks"
  action={
    <Button onClick={openCreateDialog}>
      <Plus className="h-4 w-4 mr-2" />
      {t('endpoints.create')}
    </Button>
  }
  hint={t('endpoints.empty.hint')}          // "Endpoint — это URL, на который будут отправляться webhook events"
/>
```

i18n ключи для en.json и uk.json: `*.empty.title`, `*.empty.desc`, `*.empty.hint`

**3. Simplified navigation — collapse advanced sections:**

В `AppLayout.tsx`:
```tsx
const [showAdvanced, setShowAdvanced] = useState(() =>
  localStorage.getItem('nav_show_advanced') === 'true'
);

// Основная навигация проекта (всегда видна):
const projectCoreNav = [
  { nameKey: 'nav.projectDashboard', path: `.../dashboard`, icon: LayoutDashboard },
  { nameKey: 'nav.endpoints', path: `.../endpoints`, icon: Webhook },
  { nameKey: 'nav.subscriptions', path: `.../subscriptions`, icon: Bell },
  { nameKey: 'nav.events', path: `.../events`, icon: Radio },
  { nameKey: 'nav.deliveries', path: `.../deliveries`, icon: Send },
  { nameKey: 'nav.apiKeys', path: `.../api-keys`, icon: Key },
];

// Advanced (скрыта по умолчанию, toggle):
const projectAdvancedNav = [
  { nameKey: 'nav.incoming', ... },
  { nameKey: 'nav.transformations', ... },
  { nameKey: 'nav.rules', ... },
  { nameKey: 'nav.workflows', ... },
  { nameKey: 'nav.connections', ... },
];

// Operations (видна при наличии данных или toggle):
const projectOpsNav = [
  { nameKey: 'nav.alerts', ... },
  { nameKey: 'nav.dlq', ... },
  { nameKey: 'nav.usage', ... },
];

// В sidebar:
<NavSection title="Webhooks" items={projectCoreNav} />
{showAdvanced && <NavSection title="Advanced" items={projectAdvancedNav} />}
<NavSection title="Operations" items={projectOpsNav} />
<button onClick={toggleAdvanced}>
  {showAdvanced ? t('nav.hideAdvanced') : t('nav.showAdvanced')}
</button>
```

#### Proper fix (2-3 недели)

**1. Information Architecture redesign:**
```
Sidebar structure:
├─ 🏠 Dashboard (org-level overview)
├─ 📁 Projects
│  └─ [Active Project]
│     ├─ 📊 Overview (project dashboard + onboarding checklist)
│     ├─ ── Core ──
│     │  ├─ 🔗 Endpoints
│     │  ├─ 🔔 Subscriptions
│     │  ├─ 📨 Events
│     │  ├─ 📤 Deliveries
│     │  └─ 🔑 API Keys
│     ├─ ── Advanced ── (collapsible, off by default)
│     │  ├─ 📥 Incoming Webhooks
│     │  ├─ 🔧 Transformations
│     │  ├─ 📋 Rules Engine
│     │  ├─ ⚙️ Workflows
│     │  └─ 🔗 Connections
│     └─ ── Operations ──
│        ├─ 🚨 Alerts
│        ├─ 💀 Dead Letter Queue
│        └─ 📈 Usage & Metrics
│
├─ ── Organization ──
│  ├─ 👥 Members
│  ├─ 📝 Audit Log
│  ├─ 💳 Billing
│  └─ ⚙️ Settings
└─ 👤 Profile
```

**2. Golden paths (guided flows):**

`GoldenPath.tsx` — модальные step-by-step flows:
- "Set up outgoing webhooks" → Endpoint → Subscription → API Key → Test
- "Set up incoming webhooks" → Source → Destination → Test
- "Set up monitoring" → Alert Rule → DLQ review → Usage dashboard
- "Integrate with your app" → SDK selection → code example → send test

Trigger: empty state CTAs, onboarding wizard, sidebar hints.

**3. Persona-based views:**

```tsx
type Persona = 'developer' | 'operator' | 'admin' | 'all';

const personaNavMap: Record<Persona, NavItem[]> = {
  developer: [...projectCoreNav, ...projectAdvancedNav],
  operator: [...projectOpsNav, { nameKey: 'nav.dlq' }, { nameKey: 'nav.alerts' }],
  admin: [...orgNav, { nameKey: 'nav.billing' }],
  all: [...all],
};

// Toggle в header или sidebar footer:
<Select value={persona} onValueChange={setPersona}>
  <SelectItem value="all">All features</SelectItem>
  <SelectItem value="developer">Developer view</SelectItem>
  <SelectItem value="operator">Operator view</SelectItem>
</Select>
```

### 4. Архитектура

**Frontend state для preferences:**
```tsx
interface UserPreferences {
  navigationMode: 'simple' | 'advanced';
  persona: 'developer' | 'operator' | 'admin' | 'all';
  onboardingCompleted: Record<string, boolean>; // per project
  dismissedHints: string[];
}

// Хранение: localStorage (client-side preferences)
// Будущее: user preferences API (server-side sync)
```

**Onboarding API (уже существует!):**
```
GET /api/v1/projects/{id}/dashboard/onboarding → OnboardingStatusResponse
{
  hasEndpoints: boolean,
  hasSubscriptions: boolean,
  hasApiKeys: boolean,
  hasEvents: boolean,
  hasDeliveries: boolean,
  hasIncomingSources: boolean,
  hasIncomingDestinations: boolean
}
```
Использовать этот endpoint для wizard progress и empty state decisions.

### 5. Риски и компромиссы
- Скрытие features может frustrate advanced users → toggle prominent + remember preference
- Wizard adds maintenance burden → keep steps generic, use existing API
- Persona nav может confuse → default "All" with collapsible sections (safest)

### 6. Приоритет
Quick fix (wizard + empty states + simplified nav): **Must do before enterprise self-hosted**
Proper fix (IA + golden paths + personas): **Must do before SaaS launch**

### 7. Трудозатраты: Quick **M** (1 неделя), Proper **L** (2-3 недели)

### 8. Порядок
- Wizard → сразу (использует existing onboarding API)
- Simplified nav → одновременно с wizard
- IA redesign → после стабилизации backend
- Persona nav → SaaS launch polishing

---

## 4.2 Billing UX и visibility лимитов

### 1. Корневая причина
`BillingPage.tsx` — заглушка "Coming Soon" (34 строки). Нет видимости текущего плана, лимитов, usage progress, upgrade path. Пользователь не знает о приближении к лимитам до момента 429 ошибки.

**Слой:** Frontend

### 2. Целевое состояние
- Usage indicator в sidebar (всегда видим)
- Billing page с планом, usage bars, upgrade/downgrade
- In-context warnings при 80%/90%/100% usage
- Stripe checkout/portal integration

### 3. План реализации (зависит от Billing backend Phase 1-2)

**1. Usage indicator в sidebar (`UsageMeter.tsx`):**
```tsx
export function UsageMeter() {
  const { data: usage } = useQuery({
    queryKey: ['orgUsage'],
    queryFn: () => billingApi.getUsage(orgId),
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  if (!usage || !usage.limit) return null; // unlimited plan

  const pct = (usage.current / usage.limit) * 100;
  const color = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : 'bg-primary';

  return (
    <div className="px-3 py-2 border-t border-border/50">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{t('billing.eventsUsed')}</span>
        <span>{formatNumber(usage.current)} / {formatNumber(usage.limit)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)}
             style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {pct > 90 && (
        <Link to="/admin/billing" className="text-xs text-red-500 hover:underline mt-1 block">
          {t('billing.upgradeNow')}
        </Link>
      )}
    </div>
  );
}
```
Место: sidebar footer в `AppLayout.tsx`, перед user profile section.

**2. Billing page полный redesign:**
```tsx
export default function BillingPage() {
  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
      {/* Текущий план */}
      <CurrentPlanCard plan={plan} billingPeriod={period} />

      {/* Usage meters */}
      <UsageSection>
        <UsageBar label="Events" current={8500} limit={10000} />
        <UsageBar label="Endpoints" current={2} limit={3} />
        <UsageBar label="Team Members" current={1} limit={2} />
        <UsageBar label="Incoming Sources" current={0} limit={1} />
      </UsageSection>

      {/* Plan comparison */}
      <PlanComparisonTable
        plans={plans}
        currentPlan={currentPlan}
        onUpgrade={(planName) => handleCheckout(planName)}
        onDowngrade={(planName) => handleDowngrade(planName)}
      />

      {/* Payment */}
      <PaymentSection>
        <Button onClick={openStripePortal}>
          {t('billing.managePayment')}
        </Button>
      </PaymentSection>

      {/* Invoice history */}
      <InvoiceHistory invoices={invoices} />
    </div>
  );
}
```

**3. In-context quota warnings:**

`QuotaWarningBanner.tsx` — показывается в header area на relevant pages:
```tsx
export function QuotaWarningBanner() {
  const { data: usage } = useOrgUsage();
  if (!usage || usage.pct < 80) return null;

  const level = usage.pct >= 100 ? 'error' : usage.pct >= 90 ? 'warning' : 'info';

  return (
    <Alert variant={level} className="mx-6 mt-4">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        {usage.pct >= 100
          ? t('billing.quotaReached', { limit: usage.limit })
          : t('billing.quotaWarning', { pct: usage.pct, limit: usage.limit })}
        <Link to="/admin/billing" className="ml-2 underline font-medium">
          {t('billing.upgrade')}
        </Link>
      </AlertDescription>
    </Alert>
  );
}
```
Место: `EventsPage`, `ProjectDashboard`, `EndpointsPage` (где создаются ресурсы).

**4. Upgrade guard на create actions:**
```tsx
// HOC/wrapper для кнопок создания:
function QuotaGuard({ resource, children }: { resource: string; children: ReactNode }) {
  const { data: usage } = useOrgUsage();
  const limit = usage?.limits[resource];
  const current = usage?.current[resource];

  if (limit && current >= limit) {
    return (
      <Tooltip content={t('billing.limitReached', { resource })}>
        <Button disabled>{children}</Button>
      </Tooltip>
    );
  }
  return <>{children}</>;
}

// Использование:
<QuotaGuard resource="endpoints">
  <Button onClick={createEndpoint}>Create Endpoint</Button>
</QuotaGuard>
```

### 4. Архитектура
```
Frontend state:
  useOrgUsage() → React Query → GET /api/v1/orgs/{id}/usage
    → { plan, usage: { events, endpoints, members }, limits, pct }
    → staleTime: 5 min, refetchOnWindowFocus: true

Components:
  AppLayout → UsageMeter (sidebar footer)
  Pages → QuotaWarningBanner (header area)
  Create buttons → QuotaGuard wrapper
  BillingPage → full plan/usage/payment management
```

### 5. Риски
- Additional API calls для usage → aggressive caching (5 min stale-while-revalidate)
- In-context warnings могут раздражать → user-dismissible (localStorage), reset daily
- Stripe portal redirect = UX disruption → открывать в новом tab

### 6. Приоритет: **Must do before SaaS launch**
### 7. Трудозатраты: **M** (1-2 недели, зависит от billing backend)
### 8. Порядок: Зависит от Billing backend Phase 1 (#3.1)

---

## 4.3 Incident / Operator workflows в UI

### 1. Корневая причина
DLQ page показывает failed deliveries, но нет workflow для investigation:
- Нет "Why did this fail?" drill-down
- Нет retry-from-DLQ в один клик с feedback
- Alert events нет unified incident view
- Нет correlation: event → delivery → attempts → alert

**Слой:** Frontend / Product

### 2. Целевое состояние
- DLQ: retry/discard buttons + failure reason summary
- Alert: incident timeline (trigger → current state → resolution)
- Delivery detail: full attempt history with request/response
- Cross-entity navigation: event → deliveries → attempts

### 3. План реализации

**Quick fix (1 неделя):**

1. **DLQ improvements:**
- Bulk retry button (select multiple → retry all)
- Failure reason column (last error message)
- Filter by endpoint, date range, error type
- "Retry" button → confirmation → POST /dlq/{id}/retry → feedback toast

2. **Delivery detail page improvements:**
- Attempt timeline (vertical timeline component)
- Each attempt: request headers, response code, response body (collapsible)
- "Current status" badge prominent
- "Retry now" button if failed/DLQ

3. **Alert → Delivery correlation:**
- Alert event detail → link to affected deliveries
- Delivery list → filter by alert rule

**Proper fix (2-3 недели):**
- Unified incident view: alert rule trigger → affected endpoints → delivery attempts → resolution
- Runbook links in alert configuration
- "Resolve" button on alerts with notes

### 4. Приоритет: **Must do before SaaS launch**
### 5. Трудозатраты: Quick **M**, Proper **L**
### 6. Порядок: После core UX improvements (#4.1)
