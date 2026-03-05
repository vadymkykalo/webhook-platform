import { ArrowRight, CheckCircle2, Code, Copy, Book, Key, Zap, Shield, RefreshCw, Menu, X, ExternalLink, Package, ArrowDownToLine, FileCheck, GitBranch, Fingerprint, Wand2, Route } from 'lucide-react';
import { HookflowIcon } from '../components/icons/HookflowIcon';
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function DocumentationPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return hash || 'overview';
  });

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (hash) setActiveSection(hash);
  }, [location.hash]);
  const [activeLanguage, setActiveLanguage] = useState<'curl' | 'node' | 'python'>('curl');

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <Sidebar activeSection={activeSection} setActiveSection={(s) => { setActiveSection(s); setMobileNavOpen(false); }} mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
        <main className="flex-1 lg:pl-64">
          <div className="sticky top-0 z-30 lg:hidden h-14 border-b border-border/50 bg-card/80 glass flex items-center px-4 gap-3">
            <button onClick={() => setMobileNavOpen(true)} className="p-1.5 rounded-lg hover:bg-accent"><Menu className="h-5 w-5" /></button>
            <span className="text-sm font-semibold flex-1">{t('docsPage.mobileTitle')}</span>
            <LanguageSwitcher />
            <ThemeToggle variant="icon" />
          </div>
          <div className="max-w-4xl mx-auto px-6 lg:px-8 py-10">
            {activeSection === 'overview' && <Overview />}
            {activeSection === 'authentication' && <Authentication activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'getting-started' && <GettingStarted activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'events-api' && <EventsAPI activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'endpoints-api' && <EndpointsAPI activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'subscriptions-api' && <SubscriptionsAPI activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'deliveries-api' && <DeliveriesAPI activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'transformations-api' && <TransformationsAPI activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'webhook-security' && <WebhookSecurity activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'incoming-webhooks' && <IncomingWebhooks activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'rules-engine' && <RulesEngineDocs activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'schema-registry' && <SchemaRegistryDocs activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'deterministic-replay' && <DeterministicReplayDocs />}
            {activeSection === 'errors' && <Errors />}
            {activeSection === 'sdks' && <SDKs />}
          </div>
        </main>
      </div>
    </div>
  );
}

function Sidebar({ activeSection, setActiveSection, mobileOpen, onMobileClose }: { activeSection: string; setActiveSection: (section: string) => void; mobileOpen: boolean; onMobileClose: () => void }) {
  const { t } = useTranslation();
  const sections = [
    { id: 'overview', label: t('docsPage.sections.overview'), icon: Book },
    { id: 'authentication', label: t('docsPage.sections.authentication'), icon: Key },
    { id: 'getting-started', label: t('docsPage.sections.gettingStarted'), icon: Zap },
    { id: 'events-api', label: t('docsPage.sections.eventsApi'), icon: Code },
    { id: 'endpoints-api', label: t('docsPage.sections.endpointsApi'), icon: Shield },
    { id: 'subscriptions-api', label: t('docsPage.sections.subscriptionsApi'), icon: RefreshCw },
    { id: 'deliveries-api', label: t('docsPage.sections.deliveriesApi'), icon: CheckCircle2 },
    { id: 'transformations-api', label: t('docsPage.sections.transformationsApi'), icon: Wand2 },
    { id: 'webhook-security', label: t('docsPage.sections.webhookSecurity'), icon: Shield },
    { id: 'incoming-webhooks', label: t('docsPage.sections.incomingWebhooks'), icon: ArrowDownToLine },
    { id: 'rules-engine', label: t('docsPage.sections.rulesEngine', 'Rules Engine'), icon: GitBranch },
    { id: 'schema-registry', label: t('docsPage.sections.schemaRegistry'), icon: FileCheck },
    { id: 'deterministic-replay', label: t('docsPage.sections.deterministicReplay'), icon: Fingerprint },
    { id: 'errors', label: t('docsPage.sections.errors'), icon: Code },
    { id: 'sdks', label: t('docsPage.sections.sdks'), icon: Package },
  ];

  const navContent = (
    <div className="p-5">
      <Link to="/" className="flex items-center gap-2.5 mb-8">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <HookflowIcon className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-base font-bold tracking-tight">Hookflow</span>
      </Link>
      <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{t('docsPage.sidebar.apiDocs')}</p>
      <nav className="space-y-0.5">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
              activeSection === section.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <section.icon className={`h-4 w-4 ${activeSection === section.id ? 'text-primary' : ''}`} />
            <span>{section.label}</span>
          </button>
        ))}
      </nav>
      <div className="mt-8 pt-6 border-t border-border/50 space-y-1">
        <Link to="/admin/dashboard" className="flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent">
          <ArrowRight className="h-4 w-4" /> {t('docsPage.sidebar.goToDashboard')}
        </Link>
        <LanguageSwitcher variant="full" />
        <ThemeToggle variant="full" />
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed left-0 top-0 h-screen w-64 border-r border-border/50 bg-card/50 overflow-y-auto">
        {navContent}
      </aside>
      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onMobileClose} />
          <aside className="fixed inset-y-0 left-0 w-72 bg-card border-r shadow-elevated animate-slide-in-left">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <span className="text-sm font-semibold">{t('docsPage.sidebar.navigation')}</span>
              <button onClick={onMobileClose} className="p-1.5 rounded-lg hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}

function Overview() {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('docsPage.overview.title')}</h1>
        <p className="text-xl text-muted-foreground">
          {t('docsPage.overview.subtitle')}
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">{t('docsPage.overview.whatIs')}</h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          {t('docsPage.overview.whatIsDesc1')}
        </p>
        <p className="text-muted-foreground leading-relaxed">
          {t('docsPage.overview.whatIsDesc2')}
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">{t('docsPage.overview.coreConcepts')}</h2>
        <div className="space-y-6">
          <ConceptCard
            title={t('docsPage.concepts.event')}
            description={t('docsPage.concepts.eventDesc')}
          />
          <ConceptCard
            title={t('docsPage.concepts.endpoint')}
            description={t('docsPage.concepts.endpointDesc')}
          />
          <ConceptCard
            title={t('docsPage.concepts.subscription')}
            description={t('docsPage.concepts.subscriptionDesc')}
          />
          <ConceptCard
            title={t('docsPage.concepts.delivery')}
            description={t('docsPage.concepts.deliveryDesc')}
          />
          <ConceptCard
            title={t('docsPage.concepts.attempt')}
            description={t('docsPage.concepts.attemptDesc')}
          />
        </div>
      </div>

      <div className="bg-muted/50 rounded-xl p-8 border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('docsPage.overview.eventFlow')}</h3>
        <div className="flex items-center justify-between text-sm">
          <div className="text-center">
            <div className="w-16 h-16 rounded-lg bg-primary text-white flex items-center justify-center mb-2 mx-auto">
              <Code className="h-8 w-8" />
            </div>
            <div className="font-medium text-foreground">{t('docsPage.overview.yourSystem')}</div>
          </div>
          <ArrowRight className="h-6 w-6 text-muted-foreground/60" />
          <div className="text-center">
            <div className="w-16 h-16 rounded-lg bg-primary text-white flex items-center justify-center mb-2 mx-auto">
              <Zap className="h-8 w-8" />
            </div>
            <div className="font-medium text-foreground">{t('docsPage.overview.eventsApi')}</div>
          </div>
          <ArrowRight className="h-6 w-6 text-muted-foreground/60" />
          <div className="text-center">
            <div className="w-16 h-16 rounded-lg bg-primary text-white flex items-center justify-center mb-2 mx-auto">
              <RefreshCw className="h-8 w-8" />
            </div>
            <div className="font-medium text-foreground">{t('docsPage.overview.deliveryEngine')}</div>
          </div>
          <ArrowRight className="h-6 w-6 text-muted-foreground/60" />
          <div className="text-center">
            <div className="w-16 h-16 rounded-lg bg-primary text-white flex items-center justify-center mb-2 mx-auto">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="font-medium text-foreground">{t('docsPage.overview.customerEndpoint')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConceptCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-l-2 border-primary pl-4">
      <h3 className="font-semibold text-sm mb-0.5">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function Authentication({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('docsPage.auth.title')}</h1>
        <p className="text-xl text-muted-foreground">
          {t('docsPage.auth.subtitle')}
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">{t('docsPage.auth.jwtTitle')}</h2>
        <p className="text-muted-foreground mb-6">
          {t('docsPage.auth.jwtDesc')}
        </p>
        
        <h3 className="text-lg font-semibold text-foreground mb-3">{t('docsPage.auth.register')}</h3>
        <div className="mb-6">
          <HTTPMethod method="POST" path="/api/v1/auth/register" />
          <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
            {getCodeExample('register', activeLanguage)}
          </CodeBlock>
          <ResponseBlock>
{`{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}`}
          </ResponseBlock>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">{t('docsPage.auth.login')}</h3>
        <div className="mb-6">
          <HTTPMethod method="POST" path="/api/v1/auth/login" />
          <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
            {getCodeExample('login', activeLanguage)}
          </CodeBlock>
          <ResponseBlock>
{`{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}`}
          </ResponseBlock>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-3">{t('docsPage.auth.usingJwt')}</h3>
        <p className="text-muted-foreground mb-4">{t('docsPage.auth.usingJwtDesc')}</p>
        <CodeBlock language="curl" setLanguage={() => {}}>
{`Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`}
        </CodeBlock>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">{t('docsPage.auth.apiKeyTitle')}</h2>
        <p className="text-muted-foreground mb-6">
          {t('docsPage.auth.apiKeyDesc')}
        </p>
        
        <h3 className="text-lg font-semibold text-foreground mb-3">{t('docsPage.auth.headerFormat')}</h3>
        <CodeBlock language="curl" setLanguage={() => {}}>
{`X-API-Key: wh_live_1234567890abcdef`}
        </CodeBlock>
        
        <div className="mt-6 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-900 dark:text-amber-300 text-sm">{t('docsPage.auth.securityNote')}</div>
              <div className="text-amber-700 dark:text-amber-400 text-sm mt-1">
                {t('docsPage.auth.securityNoteDesc')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GettingStarted({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('docsPage.gettingStarted.title')}</h1>
        <p className="text-xl text-muted-foreground">
          {t('docsPage.gettingStarted.subtitle')}
        </p>
      </div>

      <StepSection number="1" title={t('docsPage.gettingStarted.step1')}>
        <p className="text-muted-foreground mb-4">{t('docsPage.gettingStarted.step1Desc')}</p>
        <HTTPMethod method="POST" path="/api/v1/auth/register" />
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('register', activeLanguage)}
        </CodeBlock>
      </StepSection>

      <StepSection number="2" title={t('docsPage.gettingStarted.step2')}>
        <p className="text-muted-foreground mb-4">{t('docsPage.gettingStarted.step2Desc')}</p>
        <HTTPMethod method="POST" path="/api/v1/projects" />
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('createProject', activeLanguage)}
        </CodeBlock>
        <ResponseBlock>
{`{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Production",
  "organizationId": "123e4567-e89b-12d3-a456-426614174001",
  "createdAt": "2024-12-16T19:00:00Z"
}`}
        </ResponseBlock>
      </StepSection>

      <StepSection number="3" title={t('docsPage.gettingStarted.step3')}>
        <p className="text-muted-foreground mb-4">{t('docsPage.gettingStarted.step3Desc')}</p>
        <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/api-keys" />
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('createApiKey', activeLanguage)}
        </CodeBlock>
        <ResponseBlock>
{`{
  "id": "123e4567-e89b-12d3-a456-426614174002",
  "name": "Production API Key",
  "key": "wh_live_1234567890abcdef",
  "createdAt": "2024-12-16T19:01:00Z"
}`}
        </ResponseBlock>
      </StepSection>

      <StepSection number="4" title={t('docsPage.gettingStarted.step4')}>
        <p className="text-muted-foreground mb-4">{t('docsPage.gettingStarted.step4Desc')}</p>
        <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/endpoints" />
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('createEndpoint', activeLanguage)}
        </CodeBlock>
        <ResponseBlock>
{`{
  "id": "123e4567-e89b-12d3-a456-426614174003",
  "url": "https://api.customer.com/webhooks",
  "secret": "whsec_1234567890abcdef",
  "enabled": true,
  "createdAt": "2024-12-16T19:02:00Z"
}`}
        </ResponseBlock>
      </StepSection>

      <StepSection number="5" title={t('docsPage.gettingStarted.step5')}>
        <p className="text-muted-foreground mb-4">{t('docsPage.gettingStarted.step5Desc')}</p>
        <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/subscriptions" />
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('createSubscription', activeLanguage)}
        </CodeBlock>
      </StepSection>

      <StepSection number="6" title={t('docsPage.gettingStarted.step6')}>
        <p className="text-muted-foreground mb-4">{t('docsPage.gettingStarted.step6Desc')}</p>
        <HTTPMethod method="POST" path="/api/v1/events" />
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('sendEvent', activeLanguage)}
        </CodeBlock>
        <ResponseBlock>
{`{
  "eventId": "123e4567-e89b-12d3-a456-426614174004",
  "type": "order.completed",
  "createdAt": "2024-12-16T19:03:00Z",
  "deliveriesCreated": 1
}`}
        </ResponseBlock>
      </StepSection>
    </div>
  );
}

function EventsAPI({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('docsPage.eventsApi.title')}</h1>
        <p className="text-xl text-muted-foreground">
          {t('docsPage.eventsApi.subtitle')}
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">{t('docsPage.eventsApi.sendEvent')}</h2>
        <HTTPMethod method="POST" path="/api/v1/events" />
        <p className="text-muted-foreground mb-6">
          {t('docsPage.eventsApi.sendEventDesc')}
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">{t('docsPage.eventsApi.headers')}</h3>
        <ParamTable params={[
          { name: 'X-API-Key', type: 'string', required: true, description: 'API key for authentication' },
          { name: 'Content-Type', type: 'string', required: true, description: 'application/json' },
          { name: 'Idempotency-Key', type: 'string', required: false, description: 'Unique key to prevent duplicate processing' },
        ]} />

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">{t('docsPage.eventsApi.requestBody')}</h3>
        <ParamTable params={[
          { name: 'type', type: 'string', required: true, description: 'Event type (e.g., "order.completed")' },
          { name: 'data', type: 'object', required: true, description: 'Event payload data' },
        ]} />

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">{t('docsPage.eventsApi.example')}</h3>
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('sendEvent', activeLanguage)}
        </CodeBlock>

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">{t('docsPage.eventsApi.response')}</h3>
        <ResponseBlock>
{`{
  "eventId": "123e4567-e89b-12d3-a456-426614174000",
  "type": "order.completed",
  "createdAt": "2024-12-16T19:00:00Z",
  "deliveriesCreated": 3
}`}
        </ResponseBlock>

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">{t('docsPage.eventsApi.responseFields')}</h3>
        <ParamTable params={[
          { name: 'eventId', type: 'uuid', required: true, description: 'Unique event identifier' },
          { name: 'type', type: 'string', required: true, description: 'Event type echoed back' },
          { name: 'createdAt', type: 'string', required: true, description: 'ISO 8601 timestamp' },
          { name: 'deliveriesCreated', type: 'integer', required: true, description: 'Number of deliveries created for this event' },
        ]} />

        <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-blue-900 dark:text-blue-300 text-sm">{t('docsPage.eventsApi.idempotency')}</div>
              <div className="text-blue-700 dark:text-blue-400 text-sm mt-1">
                {t('docsPage.eventsApi.idempotencyDesc')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EndpointsAPI({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('docsPage.endpointsApi.title')}</h1>
        <p className="text-xl text-muted-foreground">
          {t('docsPage.endpointsApi.subtitle')}
        </p>
      </div>

      <APIEndpoint
        method="POST"
        path="/api/v1/projects/{projectId}/endpoints"
        title={t('docsPage.endpointsApi.create')}
        description={t('docsPage.endpointsApi.createDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="createEndpoint"
        response={`{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "url": "https://api.customer.com/webhooks",
  "description": "Production webhooks",
  "secret": "whsec_1234567890abcdef",
  "enabled": true,
  "rateLimitPerSecond": null,
  "createdAt": "2024-12-16T19:00:00Z"
}`}
      />

      <APIEndpoint
        method="GET"
        path="/api/v1/projects/{projectId}/endpoints"
        title={t('docsPage.endpointsApi.list')}
        description={t('docsPage.endpointsApi.listDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="listEndpoints"
        response={`[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "url": "https://api.customer.com/webhooks",
    "enabled": true,
    "createdAt": "2024-12-16T19:00:00Z"
  }
]`}
      />

      <APIEndpoint
        method="GET"
        path="/api/v1/projects/{projectId}/endpoints/{id}"
        title={t('docsPage.endpointsApi.get')}
        description={t('docsPage.endpointsApi.getDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="getEndpoint"
        response={`{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "url": "https://api.customer.com/webhooks",
  "description": "Production webhooks",
  "secret": "whsec_1234567890abcdef",
  "enabled": true,
  "createdAt": "2024-12-16T19:00:00Z"
}`}
      />

      <APIEndpoint
        method="PUT"
        path="/api/v1/projects/{projectId}/endpoints/{id}"
        title={t('docsPage.endpointsApi.update')}
        description={t('docsPage.endpointsApi.updateDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="updateEndpoint"
        response={`{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "url": "https://api.customer.com/webhooks/v2",
  "enabled": true
}`}
      />

      <APIEndpoint
        method="DELETE"
        path="/api/v1/projects/{projectId}/endpoints/{id}"
        title={t('docsPage.endpointsApi.delete')}
        description={t('docsPage.endpointsApi.deleteDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="deleteEndpoint"
        response="204 No Content"
      />

      <APIEndpoint
        method="POST"
        path="/api/v1/projects/{projectId}/endpoints/{id}/rotate-secret"
        title={t('docsPage.endpointsApi.rotateSecret')}
        description={t('docsPage.endpointsApi.rotateSecretDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="rotateSecret"
        response={`{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "secret": "whsec_newSecretValue123"
}`}
      />

      <APIEndpoint
        method="POST"
        path="/api/v1/projects/{projectId}/endpoints/{id}/test"
        title={t('docsPage.endpointsApi.test')}
        description={t('docsPage.endpointsApi.testDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="testEndpoint"
        response={`{
  "success": true,
  "httpStatus": 200,
  "latencyMs": 124,
  "errorMessage": null
}`}
      />
    </div>
  );
}

function SubscriptionsAPI({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('docsPage.subscriptionsApi.title')}</h1>
        <p className="text-xl text-muted-foreground">
          {t('docsPage.subscriptionsApi.subtitle')}
        </p>
      </div>

      <APIEndpoint
        method="POST"
        path="/api/v1/projects/{projectId}/subscriptions"
        title={t('docsPage.subscriptionsApi.create')}
        description={t('docsPage.subscriptionsApi.createDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="createSubscription"
        response={`{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "endpointId": "123e4567-e89b-12d3-a456-426614174001",
  "eventType": "order.completed",
  "enabled": true,
  "orderingEnabled": false,
  "maxAttempts": 7,
  "createdAt": "2024-12-16T19:00:00Z"
}`}
      />

      <APIEndpoint
        method="GET"
        path="/api/v1/projects/{projectId}/subscriptions"
        title={t('docsPage.subscriptionsApi.list')}
        description={t('docsPage.subscriptionsApi.listDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="listSubscriptions"
        response={`[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "endpointId": "123e4567-e89b-12d3-a456-426614174001",
    "eventType": "order.completed",
    "enabled": true
  }
]`}
      />

      <APIEndpoint
        method="GET"
        path="/api/v1/projects/{projectId}/subscriptions/{id}"
        title={t('docsPage.subscriptionsApi.get')}
        description={t('docsPage.subscriptionsApi.getDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="getSubscription"
        response={`{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "endpointId": "123e4567-e89b-12d3-a456-426614174001",
  "eventType": "order.completed",
  "enabled": true,
  "orderingEnabled": false,
  "maxAttempts": 7,
  "createdAt": "2024-12-16T19:00:00Z"
}`}
      />

      <APIEndpoint
        method="PUT"
        path="/api/v1/projects/{projectId}/subscriptions/{id}"
        title={t('docsPage.subscriptionsApi.update')}
        description={t('docsPage.subscriptionsApi.updateDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="updateSubscription"
        response={`{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "eventType": "order.completed",
  "enabled": true
}`}
      />

      <APIEndpoint
        method="DELETE"
        path="/api/v1/projects/{projectId}/subscriptions/{id}"
        title={t('docsPage.subscriptionsApi.delete')}
        description={t('docsPage.subscriptionsApi.deleteDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="deleteSubscription"
        response="204 No Content"
      />
    </div>
  );
}

function DeliveriesAPI({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('docsPage.deliveriesApi.title')}</h1>
        <p className="text-xl text-muted-foreground">
          {t('docsPage.deliveriesApi.subtitle')}
        </p>
      </div>

      <APIEndpoint
        method="GET"
        path="/api/v1/deliveries/projects/{projectId}"
        title={t('docsPage.deliveriesApi.list')}
        description={t('docsPage.deliveriesApi.listDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="listDeliveries"
        response={`{
  "content": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "eventId": "123e4567-e89b-12d3-a456-426614174001",
      "endpointId": "123e4567-e89b-12d3-a456-426614174002",
      "status": "SUCCESS",
      "attemptCount": 1,
      "maxAttempts": 5,
      "createdAt": "2024-12-16T19:00:00Z",
      "succeededAt": "2024-12-16T19:00:01Z"
    }
  ],
  "totalElements": 100,
  "totalPages": 10
}`}
      />

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-3">{t('docsPage.deliveriesApi.queryParams')}</h3>
        <ParamTable params={[
          { name: 'status', type: 'string', required: false, description: 'Filter by status: PENDING, PROCESSING, SUCCESS, FAILED, DLQ' },
          { name: 'endpointId', type: 'uuid', required: false, description: 'Filter by endpoint' },
          { name: 'fromDate', type: 'ISO 8601', required: false, description: 'Start date filter' },
          { name: 'toDate', type: 'ISO 8601', required: false, description: 'End date filter' },
          { name: 'page', type: 'integer', required: false, description: 'Page number (0-indexed)' },
          { name: 'size', type: 'integer', required: false, description: 'Page size (default 20)' },
        ]} />
      </div>

      <APIEndpoint
        method="GET"
        path="/api/v1/deliveries/{id}"
        title={t('docsPage.deliveriesApi.get')}
        description={t('docsPage.deliveriesApi.getDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="getDelivery"
        response={`{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "eventId": "123e4567-e89b-12d3-a456-426614174001",
  "endpointId": "123e4567-e89b-12d3-a456-426614174002",
  "status": "SUCCESS",
  "attemptCount": 1,
  "maxAttempts": 7,
  "nextAttemptAt": null,
  "createdAt": "2024-12-16T19:00:00Z",
  "succeededAt": "2024-12-16T19:00:01Z"
}`}
      />

      <APIEndpoint
        method="GET"
        path="/api/v1/deliveries/{id}/attempts"
        title={t('docsPage.deliveriesApi.getAttempts')}
        description={t('docsPage.deliveriesApi.getAttemptsDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="getAttempts"
        response={`[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "attemptNumber": 1,
    "httpStatus": 200,
    "responseBody": "{\\"status\\":\\"ok\\"}",
    "errorMessage": null,
    "latencyMs": 124,
    "attemptedAt": "2024-12-16T19:00:00Z"
  }
]`}
      />

      <APIEndpoint
        method="POST"
        path="/api/v1/deliveries/{id}/replay"
        title={t('docsPage.deliveriesApi.replay')}
        description={t('docsPage.deliveriesApi.replayDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="replayDelivery"
        response="202 Accepted"
      />

      <APIEndpoint
        method="POST"
        path="/api/v1/deliveries/bulk-replay"
        title={t('docsPage.deliveriesApi.bulkReplay')}
        description={t('docsPage.deliveriesApi.bulkReplayDesc')}
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="bulkReplay"
        response={`{
  "totalRequested": 10,
  "replayed": 8,
  "skipped": 2,
  "message": "Bulk replay initiated for 8 deliveries"
}`}
      />
    </div>
  );
}

function TransformationsAPI({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('docsPage.transformationsApi.title')}</h1>
        <p className="text-xl text-muted-foreground">
          {t('docsPage.transformationsApi.subtitle')}
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">{t('docsPage.transformationsApi.jsonpathTitle')}</h2>
        <p className="text-muted-foreground mb-6">{t('docsPage.transformationsApi.jsonpathDesc')}</p>

        <h3 className="text-lg font-semibold text-foreground mb-3">{t('docsPage.transformationsApi.templateExample')}</h3>
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t('docsPage.transformationsApi.inputPayload')}</div>
            <ResponseBlock>
{`{
  "orderId": "ord_123",
  "customer": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "amount": 99.99,
  "currency": "USD"
}`}
            </ResponseBlock>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t('docsPage.transformationsApi.template')}</div>
            <ResponseBlock>
{`{
  "id": "$.orderId",
  "buyer": "$.customer.name",
  "total": "$.amount",
  "note": "Order $.orderId for $.customer.name"
}`}
            </ResponseBlock>
          </div>
        </div>

        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t('docsPage.transformationsApi.output')}</div>
        <ResponseBlock>
{`{
  "id": "ord_123",
  "buyer": "John Doe",
  "total": 99.99,
  "note": "Order ord_123 for John Doe"
}`}
        </ResponseBlock>

        <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Wand2 className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-blue-900 dark:text-blue-300 text-sm">{t('docsPage.transformationsApi.jsonpathNote')}</div>
              <div className="text-blue-700 dark:text-blue-400 text-sm mt-1">
                {t('docsPage.transformationsApi.jsonpathNoteDesc')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">{t('docsPage.transformationsApi.previewTitle')}</h2>
        <p className="text-muted-foreground mb-6">{t('docsPage.transformationsApi.previewDesc')}</p>
        <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/transform-preview" />
        <ParamTable params={[
          { name: 'inputPayload', type: 'string (JSON)', required: true, description: t('docsPage.transformationsApi.paramInput') },
          { name: 'template', type: 'string (JSON)', required: true, description: t('docsPage.transformationsApi.paramTemplate') },
        ]} />
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('transformPreview', activeLanguage)}
        </CodeBlock>
        <ResponseBlock>
{`{
  "output": "{\\"id\\":\\"ord_123\\",\\"total\\":99.99}",
  "success": true,
  "error": null
}`}
        </ResponseBlock>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">{t('docsPage.transformationsApi.dryRunTitle')}</h2>
        <p className="text-muted-foreground mb-6">{t('docsPage.transformationsApi.dryRunDesc')}</p>
        <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/delivery-dry-run" />
        <ParamTable params={[
          { name: 'endpointId', type: 'uuid', required: true, description: t('docsPage.transformationsApi.paramEndpointId') },
          { name: 'eventType', type: 'string', required: true, description: t('docsPage.transformationsApi.paramEventType') },
          { name: 'payload', type: 'string (JSON)', required: true, description: t('docsPage.transformationsApi.paramPayload') },
          { name: 'transformationId', type: 'uuid', required: false, description: t('docsPage.transformationsApi.paramTransformId') },
        ]} />
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('deliveryDryRun', activeLanguage)}
        </CodeBlock>
        <ResponseBlock>
{`{
  "endpointUrl": "https://api.customer.com/webhooks",
  "headers": {
    "Content-Type": "application/json",
    "X-Signature": "t=1703790000000,v1=abc123...",
    "X-Event-Type": "order.completed",
    "X-Timestamp": "1703790000000"
  },
  "transformedPayload": "{\\"id\\":\\"ord_123\\"}",
  "originalPayload": "{\\"orderId\\":\\"ord_123\\"}"
}`}
        </ResponseBlock>

        <div className="mt-6 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-900 dark:text-amber-300 text-sm">{t('docsPage.transformationsApi.dryRunNote')}</div>
              <div className="text-amber-700 dark:text-amber-400 text-sm mt-1">
                {t('docsPage.transformationsApi.dryRunNoteDesc')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WebhookSecurity({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('docsPage.security.title')}</h1>
        <p className="text-xl text-muted-foreground">
          {t('docsPage.security.subtitle')}
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">{t('docsPage.security.sigVerification')}</h2>
        <p className="text-muted-foreground mb-6">
          {t('docsPage.security.sigVerificationDesc')}
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">{t('docsPage.security.headers')}</h3>
        <ParamTable params={[
          { name: 'X-Signature', type: 'string', required: true, description: 'Format: t=timestamp,v1=signature' },
          { name: 'X-Event-Id', type: 'uuid', required: true, description: 'Event identifier' },
          { name: 'X-Delivery-Id', type: 'uuid', required: true, description: 'Delivery identifier' },
          { name: 'X-Timestamp', type: 'integer', required: true, description: 'Unix timestamp in milliseconds' },
        ]} />

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">{t('docsPage.security.verificationExamples')}</h3>
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('verifySignature', activeLanguage)}
        </CodeBlock>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">{t('docsPage.security.endpointVerification')}</h2>
        <p className="text-muted-foreground mb-6">
          {t('docsPage.security.endpointVerificationDesc')}
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">{t('docsPage.security.challengeRequest')}</h3>
        <p className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t('docsPage.security.challengeRequestDesc') }} />
        <ResponseBlock>
{`POST https://your-endpoint.com/webhooks
Content-Type: application/json

{
  "type": "webhook.verification",
  "challenge": "whc_abc123xyz789...",
  "timestamp": "2024-01-15T10:30:00Z"
}`}
        </ResponseBlock>

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">{t('docsPage.security.expectedResponse')}</h3>
        <p className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t('docsPage.security.expectedResponseDesc') }} />
        <ResponseBlock>
{`HTTP/1.1 200 OK
Content-Type: application/json

{
  "challenge": "whc_abc123xyz789..."
}`}
        </ResponseBlock>

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">{t('docsPage.security.implementationExamples')}</h3>
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('endpointVerification', activeLanguage)}
        </CodeBlock>
      </div>
    </div>
  );
}

function DeterministicReplayDocs() {
  const { t } = useTranslation();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('docsPage.deterministicReplay.title')}</h1>
        <p className="text-lg text-muted-foreground">{t('docsPage.deterministicReplay.subtitle')}</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2"><Fingerprint className="h-5 w-5 text-primary" /> {t('docsPage.deterministicReplay.overview')}</h2>
        <p className="text-muted-foreground leading-relaxed">{t('docsPage.deterministicReplay.overviewDesc')}</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.deterministicReplay.idempotencyKeyHeader')}</h2>
        <p className="text-muted-foreground leading-relaxed">{t('docsPage.deterministicReplay.idempotencyKeyHeaderDesc')}</p>
        <ResponseBlock>{`Idempotency-Key: <event-idempotency-key>-<endpoint-id>
# or auto-generated:
Idempotency-Key: <event-id>-<endpoint-id>`}</ResponseBlock>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.deterministicReplay.dryRunTitle')}</h2>
        <p className="text-muted-foreground leading-relaxed">{t('docsPage.deterministicReplay.dryRunDesc')}</p>
        <div className="space-y-3">
          <HTTPMethod method="POST" path="/api/v1/deliveries/{id}/replay?dryRun=true" />
          <ResponseBlock>{`{
  "deliveryId": "...",
  "endpointUrl": "https://your-app.com/webhook",
  "eventType": "order.created",
  "idempotencyKey": "idem-key-123-endpoint-456",
  "plan": "WILL_SEND: POST https://your-app.com/webhook with Idempotency-Key: idem-key-123-endpoint-456 (attempt 4/7)",
  "previousAttemptCount": 3,
  "maxAttempts": 7,
  "currentStatus": "FAILED",
  "previousAttempts": [...]
}`}</ResponseBlock>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.deterministicReplay.replayFromAttemptTitle')}</h2>
        <p className="text-muted-foreground leading-relaxed">{t('docsPage.deterministicReplay.replayFromAttemptDesc')}</p>
        <HTTPMethod method="POST" path="/api/v1/deliveries/{id}/replay?fromAttempt=2" />
        <p className="text-sm text-muted-foreground">{t('docsPage.deterministicReplay.replayFromAttemptNote')}</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.deterministicReplay.idempotencyPoliciesTitle')}</h2>
        <p className="text-muted-foreground leading-relaxed">{t('docsPage.deterministicReplay.idempotencyPoliciesDesc')}</p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2"><Shield className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" /> <strong>NONE</strong> — {t('docsPage.deterministicReplay.policyNone')}</li>
          <li className="flex items-start gap-2"><Shield className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" /> <strong>AUTO</strong> — {t('docsPage.deterministicReplay.policyAuto')}</li>
          <li className="flex items-start gap-2"><Shield className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" /> <strong>REQUIRED</strong> — {t('docsPage.deterministicReplay.policyRequired')}</li>
        </ul>
      </section>
    </div>
  );
}

function Errors() {
  const { t } = useTranslation();
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('docsPage.errors.title')}</h1>
        <p className="text-xl text-muted-foreground">
          {t('docsPage.errors.subtitle')}
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">{t('docsPage.errors.rateLimiting')}</h2>
        <p className="text-muted-foreground mb-4">
          {t('docsPage.errors.rateLimitingDesc')}
        </p>
        <ParamTable params={[
          { name: 'X-RateLimit-Limit', type: 'integer', required: true, description: 'Maximum requests per second' },
          { name: 'X-RateLimit-Remaining', type: 'integer', required: true, description: 'Remaining requests in current window' },
          { name: 'X-RateLimit-Reset', type: 'timestamp', required: true, description: 'Unix timestamp when limit resets' },
          { name: 'Retry-After', type: 'integer', required: true, description: 'Seconds to wait before retrying (only on 429)' },
        ]} />
        <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <div className="font-semibold text-amber-900 dark:text-amber-300 text-sm">{t('docsPage.errors.rateLimitExceeded')}</div>
          <div className="text-amber-700 dark:text-amber-400 text-sm mt-1">
            {t('docsPage.errors.rateLimitExceededDesc')}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">{t('docsPage.errors.errorFormat')}</h2>
        <ResponseBlock>
{`{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Please retry after 60 seconds.",
  "status": 429
}`}
        </ResponseBlock>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">{t('docsPage.errors.validationErrors')}</h2>
        <p className="text-muted-foreground mb-4">
          {t('docsPage.errors.validationErrorsDesc')}
        </p>
        <ResponseBlock>
{`{
  "error": "validation_error",
  "message": "Invalid request parameters",
  "status": 400,
  "fieldErrors": {
    "type": "Event type is required",
    "data": "Event data cannot be empty"
  }
}`}
        </ResponseBlock>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">{t('docsPage.errors.httpStatusCodes')}</h2>
        <div className="space-y-4">
          <ErrorCode code="200" title="OK" description="Request succeeded" />
          <ErrorCode code="201" title="Created" description="Resource created successfully" />
          <ErrorCode code="202" title="Accepted" description="Request accepted for processing (async)" />
          <ErrorCode code="204" title="No Content" description="Resource deleted successfully" />
          <ErrorCode code="400" title="Bad Request" description="Invalid request format or validation failed" />
          <ErrorCode code="401" title="Unauthorized" description="Invalid or missing authentication" />
          <ErrorCode code="403" title="Forbidden" description="Insufficient permissions for this action" />
          <ErrorCode code="404" title="Not Found" description="Resource not found" />
          <ErrorCode code="409" title="Conflict" description="Resource already exists (idempotency)" />
          <ErrorCode code="429" title="Too Many Requests" description="Rate limit exceeded - check headers" />
          <ErrorCode code="500" title="Internal Server Error" description="Server error - contact support" />
        </div>
      </div>
    </div>
  );
}

type LanguageTabsProps = {
  activeLanguage: 'curl' | 'node' | 'python';
  setActiveLanguage: (lang: 'curl' | 'node' | 'python') => void;
};

function HTTPMethod({ method, path }: { method: string; path: string }) {
  const methodColors: Record<string, string> = {
    GET: 'bg-blue-500/10 text-blue-600',
    POST: 'bg-success/10 text-success',
    PUT: 'bg-warning/10 text-warning',
    DELETE: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="flex items-center gap-3 mb-4">
      <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide ${methodColors[method]}`}>
        {method}
      </span>
      <code className="text-sm font-mono text-foreground">{path}</code>
    </div>
  );
}

function CodeBlock({ language, setLanguage, children }: { language: 'curl' | 'node' | 'python'; setLanguage: (lang: 'curl' | 'node' | 'python') => void; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex gap-1">
          {(['curl', 'node', 'python'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                language === lang
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {lang === 'curl' ? 'cURL' : lang === 'node' ? 'Node.js' : 'Python'}
            </button>
          ))}
        </div>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto border border-white/5">
        <code className="text-[13px] font-mono leading-relaxed">{children}</code>
      </pre>
    </div>
  );
}

function ResponseBlock({ children }: { children: string }) {
  return (
    <div className="my-4">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Response</div>
      <pre className="bg-muted/50 border text-foreground p-4 rounded-lg overflow-x-auto">
        <code className="text-[13px] font-mono leading-relaxed">{children}</code>
      </pre>
    </div>
  );
}

function ParamTable({ params }: { params: Array<{ name: string; type: string; required: boolean; description: string }> }) {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="min-w-full divide-y divide-border border rounded-lg overflow-hidden">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Parameter</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Required</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Description</th>
          </tr>
        </thead>
        <tbody className="bg-card divide-y divide-border">
          {params.map((param, index) => (
            <tr key={index} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-2.5 text-[13px] font-mono font-medium">{param.name}</td>
              <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{param.type}</td>
              <td className="px-4 py-2.5">
                {param.required ? (
                  <span className="text-[11px] font-medium text-destructive">Required</span>
                ) : (
                  <span className="text-[11px] font-medium text-muted-foreground">Optional</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{param.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StepSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-primary/30 pl-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
          {number}
        </div>
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function APIEndpoint({
  method,
  path,
  title,
  description,
  activeLanguage,
  setActiveLanguage,
  example,
  response,
}: {
  method: string;
  path: string;
  title: string;
  description: string;
  activeLanguage: 'curl' | 'node' | 'python';
  setActiveLanguage: (lang: 'curl' | 'node' | 'python') => void;
  example: string;
  response: string;
}) {
  return (
    <div className="border-b border-border/50 pb-10 last:border-0">
      <h2 className="text-xl font-bold mb-3">{title}</h2>
      <HTTPMethod method={method} path={path} />
      <p className="text-sm text-muted-foreground mb-5">{description}</p>
      <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
        {getCodeExample(example, activeLanguage)}
      </CodeBlock>
      <ResponseBlock>{response}</ResponseBlock>
    </div>
  );
}

function ErrorCode({ code, title, description }: { code: string; title: string; description: string }) {
  const codeColor = code.startsWith('2') ? 'bg-success/10 text-success' : code.startsWith('4') ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive';
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
      <code className={`flex-shrink-0 px-2.5 py-1 text-[11px] font-mono font-bold rounded-md ${codeColor}`}>{code}</code>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

function getCodeExample(type: string, language: 'curl' | 'node' | 'python'): string {
  const examples: Record<string, Record<string, string>> = {
    register: {
      curl: `curl -X POST http://localhost:8080/api/v1/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "password": "securePassword123",
    "organizationName": "Acme Corp"
  }'`,
      node: `const response = await fetch('http://localhost:8080/api/v1/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securePassword123',
    organizationName: 'Acme Corp'
  })
});
const data = await response.json();`,
      python: `import requests

response = requests.post(
    'http://localhost:8080/api/v1/auth/register',
    json={
        'email': 'user@example.com',
        'password': 'securePassword123',
        'organizationName': 'Acme Corp'
    }
)
data = response.json()`,
    },
    login: {
      curl: `curl -X POST http://localhost:8080/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "user@example.com",
    "password": "securePassword123"
  }'`,
      node: `const response = await fetch('http://localhost:8080/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securePassword123'
  })
});
const { accessToken } = await response.json();`,
      python: `import requests

response = requests.post(
    'http://localhost:8080/api/v1/auth/login',
    json={
        'email': 'user@example.com',
        'password': 'securePassword123'
    }
)
access_token = response.json()['accessToken']`,
    },
    createProject: {
      curl: `# Project creation requires JWT (dashboard operation)
curl -X POST http://localhost:8080/api/v1/projects \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Production",
    "description": "Production webhooks"
  }'`,
      node: `// Project creation requires JWT (dashboard operation)
const response = await fetch('http://localhost:8080/api/v1/projects', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Production',
    description: 'Production webhooks'
  })
});
const project = await response.json();`,
      python: `# Project creation requires JWT (dashboard operation)
import requests

response = requests.post(
    'http://localhost:8080/api/v1/projects',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'},
    json={'name': 'Production', 'description': 'Production webhooks'}
)
project = response.json()`,
    },
    createApiKey: {
      curl: `# API key creation requires JWT (dashboard operation)
curl -X POST http://localhost:8080/api/v1/projects/{projectId}/api-keys \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Production API Key"
  }'`,
      node: `// API key creation requires JWT (dashboard operation)
const response = await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/api-keys\`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ name: 'Production API Key' })
});
const apiKey = await response.json();`,
      python: `# API key creation requires JWT (dashboard operation)
import requests

response = requests.post(
    f'http://localhost:8080/api/v1/projects/{project_id}/api-keys',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'},
    json={'name': 'Production API Key'}
)
api_key = response.json()`,
    },
    createEndpoint: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/endpoints \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://api.customer.com/webhooks",
    "description": "Production webhooks",
    "enabled": true
  }'`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const endpoint = await hookflow.endpoints.create(projectId, {
  url: 'https://api.customer.com/webhooks',
  description: 'Production webhooks',
  enabled: true
});`,
      python: `from hookflow import Hookflow, EndpointCreateParams

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

endpoint = hookflow.endpoints.create(
    project_id,
    EndpointCreateParams(
        url='https://api.customer.com/webhooks',
        description='Production webhooks'
    )
)`,
    },
    createSubscription: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/subscriptions \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "endpointId": "endpoint-uuid",
    "eventType": "order.completed",
    "enabled": true
  }'`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const subscription = await hookflow.subscriptions.create(projectId, {
  endpointId: 'endpoint-uuid',
  eventType: 'order.completed',
  enabled: true
});`,
      python: `from hookflow import Hookflow, SubscriptionCreateParams

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

subscription = hookflow.subscriptions.create(
    project_id,
    SubscriptionCreateParams(
        endpoint_id='endpoint-uuid',
        event_type='order.completed'
    )
)`,
    },
    sendEvent: {
      curl: `curl -X POST http://localhost:8080/api/v1/events \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: unique-request-id" \\
  -d '{
    "type": "order.completed",
    "data": {
      "orderId": "ord_12345",
      "amount": 99.99,
      "currency": "USD"
    }
  }'`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const event = await hookflow.events.send({
  type: 'order.completed',
  data: {
    orderId: 'ord_12345',
    amount: 99.99,
    currency: 'USD'
  }
}, 'unique-request-id');  // optional idempotency key`,
      python: `from hookflow import Hookflow, Event

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

event = hookflow.events.send(
    Event(
        type='order.completed',
        data={
            'orderId': 'ord_12345',
            'amount': 99.99,
            'currency': 'USD'
        }
    ),
    idempotency_key='unique-request-id'  # optional
)`,
    },
    verifySignature: {
      curl: `# Signature verification is done on your server when
# receiving webhook deliveries from Hookflow`,
      node: `import { verifySignature } from '@webhook-platform/node';

app.post('/webhooks', (req, res) => {
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];
  const body = JSON.stringify(req.body);
  const secret = process.env.WEBHOOK_SECRET;

  if (!verifySignature(body, signature, timestamp, secret)) {
    return res.status(401).send('Invalid signature');
  }

  // Process the webhook
  console.log('Verified webhook:', req.body);
  res.status(200).send('OK');
});`,
      python: `from hookflow import verify_signature

@app.post("/webhooks")
def handle_webhook():
    signature = request.headers.get('X-Signature')
    timestamp = request.headers.get('X-Timestamp')
    body = request.get_data(as_text=True)
    secret = os.environ['WEBHOOK_SECRET']

    if not verify_signature(body, signature, timestamp, secret):
        return {"error": "Invalid signature"}, 401

    # Process the webhook
    print("Verified webhook:", request.json)
    return {"status": "ok"}`,
    },
    listEndpoints: {
      curl: `curl -X GET http://localhost:8080/api/v1/projects/{projectId}/endpoints \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const endpoints = await hookflow.endpoints.list(projectId);`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

endpoints = hookflow.endpoints.list(project_id)`,
    },
    rotateSecret: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/endpoints/{id}/rotate-secret \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const endpoint = await hookflow.endpoints.rotateSecret(projectId, endpointId);
console.log('New secret:', endpoint.secret);`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

endpoint = hookflow.endpoints.rotate_secret(project_id, endpoint_id)
print('New secret:', endpoint.secret)`,
    },
    listDeliveries: {
      curl: `curl -X GET "http://localhost:8080/api/v1/deliveries/projects/{projectId}?status=FAILED&page=0&size=20" \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const deliveries = await hookflow.deliveries.list(projectId, {
  status: 'FAILED',
  page: 0,
  size: 20
});`,
      python: `from hookflow import Hookflow, DeliveryListParams

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

deliveries = hookflow.deliveries.list(
    project_id,
    DeliveryListParams(status='FAILED', page=0, size=20)
)`,
    },
    getAttempts: {
      curl: `curl -X GET http://localhost:8080/api/v1/deliveries/{deliveryId}/attempts \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const attempts = await hookflow.deliveries.getAttempts(deliveryId);`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

attempts = hookflow.deliveries.get_attempts(delivery_id)`,
    },
    replayDelivery: {
      curl: `curl -X POST http://localhost:8080/api/v1/deliveries/{deliveryId}/replay \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

await hookflow.deliveries.replay(deliveryId);`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

hookflow.deliveries.replay(delivery_id)`,
    },
    getEndpoint: {
      curl: `curl -X GET http://localhost:8080/api/v1/projects/{projectId}/endpoints/{id} \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const endpoint = await hookflow.endpoints.get(projectId, endpointId);`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

endpoint = hookflow.endpoints.get(project_id, endpoint_id)`,
    },
    updateEndpoint: {
      curl: `curl -X PUT http://localhost:8080/api/v1/projects/{projectId}/endpoints/{id} \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://api.customer.com/webhooks/v2", "enabled": true}'`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const endpoint = await hookflow.endpoints.update(projectId, endpointId, {
  url: 'https://api.customer.com/webhooks/v2',
  enabled: true
});`,
      python: `from hookflow import Hookflow, EndpointUpdateParams

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

endpoint = hookflow.endpoints.update(
    project_id, endpoint_id,
    EndpointUpdateParams(url='https://api.customer.com/webhooks/v2', enabled=True)
)`,
    },
    deleteEndpoint: {
      curl: `curl -X DELETE http://localhost:8080/api/v1/projects/{projectId}/endpoints/{id} \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

await hookflow.endpoints.delete(projectId, endpointId);`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

hookflow.endpoints.delete(project_id, endpoint_id)`,
    },
    testEndpoint: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/endpoints/{id}/test \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const result = await hookflow.endpoints.test(projectId, endpointId);
console.log('Success:', result.success, 'Latency:', result.latencyMs, 'ms');`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

result = hookflow.endpoints.test(project_id, endpoint_id)
print(f"Success: {result.success}, Latency: {result.latency_ms}ms")`,
    },
    listSubscriptions: {
      curl: `curl -X GET http://localhost:8080/api/v1/projects/{projectId}/subscriptions \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const subscriptions = await hookflow.subscriptions.list(projectId);`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

subscriptions = hookflow.subscriptions.list(project_id)`,
    },
    getSubscription: {
      curl: `curl -X GET http://localhost:8080/api/v1/projects/{projectId}/subscriptions/{id} \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const subscription = await hookflow.subscriptions.get(projectId, subscriptionId);`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

subscription = hookflow.subscriptions.get(project_id, subscription_id)`,
    },
    updateSubscription: {
      curl: `curl -X PUT http://localhost:8080/api/v1/projects/{projectId}/subscriptions/{id} \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"eventType": "order.completed", "enabled": true}'`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const subscription = await hookflow.subscriptions.update(
  projectId, subscriptionId,
  { eventType: 'order.completed', enabled: true }
);`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

subscription = hookflow.subscriptions.update(
    project_id, subscription_id,
    {'eventType': 'order.completed', 'enabled': True}
)`,
    },
    deleteSubscription: {
      curl: `curl -X DELETE http://localhost:8080/api/v1/projects/{projectId}/subscriptions/{id} \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

await hookflow.subscriptions.delete(projectId, subscriptionId);`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

hookflow.subscriptions.delete(project_id, subscription_id)`,
    },
    getDelivery: {
      curl: `curl -X GET http://localhost:8080/api/v1/deliveries/{deliveryId} \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const delivery = await hookflow.deliveries.get(deliveryId);`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

delivery = hookflow.deliveries.get(delivery_id)`,
    },
    bulkReplay: {
      curl: `curl -X POST http://localhost:8080/api/v1/deliveries/bulk-replay \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"projectId": "project-uuid", "status": "FAILED"}'`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const result = await hookflow.post('/api/v1/deliveries/bulk-replay', {
  projectId: 'project-uuid',
  status: 'FAILED'
});`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

result = hookflow.post(
    '/api/v1/deliveries/bulk-replay',
    {'projectId': 'project-uuid', 'status': 'FAILED'}
)`,
    },
    endpointVerification: {
      curl: `# Your endpoint receives:
# POST with {"type": "webhook.verification", "challenge": "whc_..."}
# You must return the challenge value in response`,
      node: `import { verifySignature, constructEvent } from '@webhook-platform/node';

app.post('/webhooks', (req, res) => {
  // Handle verification challenge
  if (req.body.type === 'webhook.verification') {
    return res.json({ challenge: req.body.challenge });
  }

  // Verify signature and process webhook
  const secret = process.env.WEBHOOK_SECRET;
  const event = constructEvent(req.body, req.headers, secret);
  console.log('Received:', event);
  res.status(200).send('OK');
});`,
      python: `from hookflow import verify_signature

@app.post("/webhooks")
def handle_webhook():
    data = request.json

    # Handle verification challenge
    if data.get("type") == "webhook.verification":
        return jsonify({"challenge": data["challenge"]})

    # Verify signature and process webhook
    secret = os.environ['WEBHOOK_SECRET']
    verify_signature(request.get_data(as_text=True),
                     request.headers.get('X-Signature'),
                     request.headers.get('X-Timestamp'),
                     secret)
    print("Received:", data)
    return {"status": "ok"}`,
    },
    transformPreview: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/transform-preview \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "inputPayload": "{\\"orderId\\": \\"ord_123\\", \\"amount\\": 99.99}",
    "template": "{\\"id\\": \\"$.orderId\\", \\"total\\": \\"$.amount\\"}"
  }'`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const result = await hookflow.post(
  \`/api/v1/projects/\${projectId}/transform-preview\`,
  {
    inputPayload: JSON.stringify({ orderId: 'ord_123', amount: 99.99 }),
    template: JSON.stringify({ id: '$.orderId', total: '$.amount' })
  }
);
console.log('Transformed:', result.output);`,
      python: `from hookflow import Hookflow
import json

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

result = hookflow.post(
    f'/api/v1/projects/{project_id}/transform-preview',
    {
        'inputPayload': json.dumps({'orderId': 'ord_123', 'amount': 99.99}),
        'template': json.dumps({'id': '$.orderId', 'total': '$.amount'})
    }
)
print('Transformed:', result['output'])`,
    },
    deliveryDryRun: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/delivery-dry-run \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "endpointId": "endpoint-uuid",
    "eventType": "order.completed",
    "payload": "{\\"orderId\\": \\"ord_123\\"}",
    "transformationId": "transform-uuid"
  }'`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const dryRun = await hookflow.post(
  \`/api/v1/projects/\${projectId}/delivery-dry-run\`,
  {
    endpointId: 'endpoint-uuid',
    eventType: 'order.completed',
    payload: JSON.stringify({ orderId: 'ord_123' }),
    transformationId: 'transform-uuid'
  }
);
console.log('URL:', dryRun.endpointUrl);
console.log('Headers:', dryRun.headers);
console.log('Body:', dryRun.transformedPayload);`,
      python: `from hookflow import Hookflow
import json

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

dry_run = hookflow.post(
    f'/api/v1/projects/{project_id}/delivery-dry-run',
    {
        'endpointId': 'endpoint-uuid',
        'eventType': 'order.completed',
        'payload': json.dumps({'orderId': 'ord_123'}),
        'transformationId': 'transform-uuid'
    }
)
print('URL:', dry_run['endpointUrl'])
print('Headers:', dry_run['headers'])
print('Body:', dry_run['transformedPayload'])`,
    },
    createIncomingSource: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/incoming-sources \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Stripe Webhooks",
    "slug": "stripe",
    "verificationMethod": "HMAC_SHA256",
    "secret": "whsec_stripe_secret"
  }'`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const source = await hookflow.incomingSources.create(projectId, {
  name: 'Stripe Webhooks',
  slug: 'stripe',
  verificationMethod: 'HMAC_SHA256',
  secret: 'whsec_stripe_secret'
});
console.log('Ingress URL:', source.ingressUrl);`,
      python: `from hookflow import Hookflow, IncomingSourceCreateParams

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

source = hookflow.incoming_sources.create(
    project_id,
    IncomingSourceCreateParams(
        name='Stripe Webhooks',
        slug='stripe',
        verification_method='HMAC_SHA256',
        secret='whsec_stripe_secret'
    )
)
print('Ingress URL:', source.ingress_url)`,
    },
    createIncomingDestination: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/incoming-sources/{sourceId}/destinations \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-api.com/stripe-handler",
    "enabled": true
  }'`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const destination = await hookflow.incomingSources.createDestination(
  projectId, sourceId,
  { url: 'https://your-api.com/stripe-handler', enabled: true }
);`,
      python: `from hookflow import Hookflow, IncomingDestinationCreateParams

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

destination = hookflow.incoming_sources.create_destination(
    project_id, source_id,
    IncomingDestinationCreateParams(
        url='https://your-api.com/stripe-handler',
        enabled=True
    )
)`,
    },
    listIncomingEvents: {
      curl: `curl -X GET "http://localhost:8080/api/v1/projects/{projectId}/incoming-events?sourceId={sourceId}&page=0&size=20" \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const events = await hookflow.incomingEvents.list(projectId, {
  sourceId: sourceId,
  page: 0,
  size: 20
});`,
      python: `from hookflow import Hookflow, IncomingEventListParams

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

events = hookflow.incoming_events.list(
    project_id,
    IncomingEventListParams(source_id=source_id, page=0, size=20)
)`,
    },
    replayIncomingEvent: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/incoming-events/{eventId}/replay \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`,
      node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const result = await hookflow.incomingEvents.replay(projectId, eventId);`,
      python: `from hookflow import Hookflow

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

result = hookflow.incoming_events.replay(project_id, event_id)`,
    },
  };

  return examples[type]?.[language] || `// Example not available for ${language}`;
}

function NodeIcon({ className }: { className?: string }) {
  return <img src="/logos/nodejs.svg" alt="Node.js" className={className} />;
}

function PythonIcon({ className }: { className?: string }) {
  return <img src="/logos/python.svg" alt="Python" className={className} />;
}

function PhpIcon({ className }: { className?: string }) {
  return <img src="/logos/php.svg" alt="PHP" className={className} />;
}

function SdkCodeBlock({ label, children, copyText }: { label: string; children: React.ReactNode; copyText?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(copyText || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-[#0d1117]">
      <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-[11px] font-mono text-white/30">{label}</span>
        {copyText && (
          <button onClick={handleCopy} className="text-white/30 hover:text-white/60 transition-colors">
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <pre className="p-4 text-[13px] font-mono overflow-x-auto leading-relaxed">{children}</pre>
    </div>
  );
}

function IncomingWebhooks({ activeLanguage, setActiveLanguage }: { activeLanguage: 'curl' | 'node' | 'python'; setActiveLanguage: (l: 'curl' | 'node' | 'python') => void }) {
  const { t } = useTranslation();

  const createSourceCode = {
    curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/incoming-sources \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Stripe Webhooks",
    "slug": "stripe",
    "providerType": "STRIPE",
    "verificationMode": "HMAC_GENERIC",
    "hmacSecret": "whsec_...",
    "hmacHeaderName": "Stripe-Signature"
  }'`,
    node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const source = await hookflow.incomingSources.create(projectId, {
  name: 'Stripe Webhooks',
  slug: 'stripe',
  verificationMethod: 'HMAC_SHA256',
  secret: 'whsec_...'
});
console.log('Ingress URL:', source.ingressUrl);`,
    python: `from hookflow import Hookflow, IncomingSourceCreateParams

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

source = hookflow.incoming_sources.create(
    project_id,
    IncomingSourceCreateParams(
        name='Stripe Webhooks',
        slug='stripe',
        verification_method='HMAC_SHA256',
        secret='whsec_...'
    )
)
print('Ingress URL:', source.ingress_url)`
  };

  const createDestCode = {
    curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/incoming-sources/{sourceId}/destinations \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-api.com/webhooks/stripe",
    "enabled": true,
    "maxAttempts": 5,
    "timeoutSeconds": 30
  }'`,
    node: `import { Hookflow } from '@webhook-platform/node';

const hookflow = new Hookflow({ apiKey: 'wh_live_YOUR_API_KEY' });

const dest = await hookflow.incomingSources.createDestination(projectId, sourceId, {
  url: 'https://your-api.com/webhooks/stripe',
  enabled: true
});`,
    python: `from hookflow import Hookflow, IncomingDestinationCreateParams

hookflow = Hookflow(api_key='wh_live_YOUR_API_KEY')

dest = hookflow.incoming_sources.create_destination(
    project_id,
    source_id,
    IncomingDestinationCreateParams(
        url='https://your-api.com/webhooks/stripe',
        enabled=True
    )
)`
  };

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('docsPage.incomingWebhooks.title')}</h1>
        <p className="text-lg text-muted-foreground">{t('docsPage.incomingWebhooks.subtitle')}</p>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2"><ArrowDownToLine className="h-5 w-5 text-primary" /> {t('docsPage.incomingWebhooks.overview')}</h2>
        <p className="text-muted-foreground leading-relaxed">{t('docsPage.incomingWebhooks.overviewDesc1')}</p>
        <div className="bg-muted/50 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground font-mono">{t('docsPage.incomingWebhooks.overviewDesc2')}</p>
        </div>
      </section>

      {/* Ingress URL */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.incomingWebhooks.ingressUrl')}</h2>
        <p className="text-muted-foreground">{t('docsPage.incomingWebhooks.ingressUrlDesc')}</p>
        <ResponseBlock>{t('docsPage.incomingWebhooks.ingressUrlExample')}</ResponseBlock>
      </section>

      {/* Verification Modes */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.incomingWebhooks.verificationModes')}</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2"><Shield className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" /> {t('docsPage.incomingWebhooks.verificationNone')}</li>
          <li className="flex items-start gap-2"><Shield className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" /> {t('docsPage.incomingWebhooks.verificationHmac')}</li>
        </ul>
        <p className="text-sm text-muted-foreground">{t('docsPage.incomingWebhooks.providerTypes')}</p>
      </section>

      {/* Sources API */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.incomingWebhooks.sourcesApi')}</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.incomingWebhooks.createSource')}</h3>
            <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/incoming-sources" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.incomingWebhooks.createSourceDesc')}</p>
            <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>{createSourceCode[activeLanguage]}</CodeBlock>
          </div>

          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.incomingWebhooks.listSources')}</h3>
            <HTTPMethod method="GET" path="/api/v1/projects/{projectId}/incoming-sources" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.incomingWebhooks.listSourcesDesc')}</p>
          </div>

          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.incomingWebhooks.deleteSource')}</h3>
            <HTTPMethod method="DELETE" path="/api/v1/projects/{projectId}/incoming-sources/{sourceId}" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.incomingWebhooks.deleteSourceDesc')}</p>
          </div>
        </div>
      </section>

      {/* Destinations API */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.incomingWebhooks.destinationsApi')}</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.incomingWebhooks.createDest')}</h3>
            <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/incoming-sources/{sourceId}/destinations" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.incomingWebhooks.createDestDesc')}</p>
            <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>{createDestCode[activeLanguage]}</CodeBlock>
          </div>

          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.incomingWebhooks.listDests')}</h3>
            <HTTPMethod method="GET" path="/api/v1/projects/{projectId}/incoming-sources/{sourceId}/destinations" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.incomingWebhooks.listDestsDesc')}</p>
          </div>

          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.incomingWebhooks.deleteDest')}</h3>
            <HTTPMethod method="DELETE" path="/api/v1/projects/{projectId}/incoming-sources/{sourceId}/destinations/{destId}" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.incomingWebhooks.deleteDestDesc')}</p>
          </div>
        </div>
      </section>

      {/* Incoming Events API */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.incomingWebhooks.eventsApi')}</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.incomingWebhooks.listEvents')}</h3>
            <HTTPMethod method="GET" path="/api/v1/projects/{projectId}/incoming-events?sourceId={sourceId}" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.incomingWebhooks.listEventsDesc')}</p>
          </div>

          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.incomingWebhooks.replayEvent')}</h3>
            <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/incoming-events/{eventId}/replay" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.incomingWebhooks.replayEventDesc')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function RulesEngineDocs({ activeLanguage: _activeLanguage, setActiveLanguage: _setActiveLanguage }: { activeLanguage: 'curl' | 'node' | 'python'; setActiveLanguage: (l: 'curl' | 'node' | 'python') => void }) {
  const { t } = useTranslation();

  const createRuleCode = `curl -X POST https://your-api.com/api/v1/projects/{projectId}/rules \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Route high-value orders to fraud detection",
    "description": "Orders over $1000 in USD/EUR get extra processing",
    "enabled": true,
    "priority": 10,
    "eventTypePattern": "order.*",
    "conditions": {
      "type": "group",
      "op": "AND",
      "children": [
        { "type": "predicate", "field": "data.amount", "operator": "GTE", "value": 1000, "valueType": "NUMBER" },
        { "type": "predicate", "field": "data.currency", "operator": "IN", "value": ["USD", "EUR"], "valueType": "ARRAY_STRING" }
      ]
    },
    "actions": [
      { "type": "ROUTE", "endpointId": "ep_fraud_detection_uuid", "sortOrder": 0 },
      { "type": "TRANSFORM", "transformationId": "tr_enrich_geo_uuid", "sortOrder": 1 },
      { "type": "TAG", "config": { "tag": "high-value" }, "sortOrder": 2 }
    ]
  }'`;

  const listRulesCode = `curl https://your-api.com/api/v1/projects/{projectId}/rules \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"`;

  const toggleRuleCode = `curl -X PATCH https://your-api.com/api/v1/projects/{projectId}/rules/{ruleId}/toggle \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "enabled": false }'`;

  const dropRuleCode = `# Drop all test events in production
curl -X POST https://your-api.com/api/v1/projects/{projectId}/rules \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Drop test events",
    "enabled": true,
    "priority": 100,
    "eventTypePattern": "test.*",
    "actions": [
      { "type": "DROP", "sortOrder": 0 }
    ]
  }'`;

  return (
    <div className="space-y-10">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <GitBranch className="h-5 w-5 text-cyan-500" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-foreground">{t('docsPage.rulesEngine.title', 'Rules Engine')}</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-600 border border-cyan-500/20 ml-1">NEW</span>
          </div>
        </div>
        <p className="text-lg text-muted-foreground">
          {t('docsPage.rulesEngine.subtitle', 'Define IF-THEN logic to dynamically route, transform, tag, or drop events based on payload conditions — designed for 100k+ events/sec.')}
        </p>
      </div>

      {/* How it works */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">{t('docsPage.rulesEngine.howItWorks', 'How It Works')}</h2>
        <div className="rounded-xl border bg-muted/30 p-6">
          <div className="flex flex-col md:flex-row items-center gap-4 text-sm">
            {[
              { step: '1', label: t('docsPage.rulesEngine.step1', 'Event arrives'), desc: t('docsPage.rulesEngine.step1Desc', 'POST /api/v1/events') },
              { step: '2', label: t('docsPage.rulesEngine.step2', 'Subscriptions fire'), desc: t('docsPage.rulesEngine.step2Desc', 'Static event→endpoint routing') },
              { step: '3', label: t('docsPage.rulesEngine.step3', 'Rules evaluate'), desc: t('docsPage.rulesEngine.step3Desc', 'In-memory compiled predicates') },
              { step: '4', label: t('docsPage.rulesEngine.step4', 'Actions execute'), desc: t('docsPage.rulesEngine.step4Desc', 'Route / Transform / Tag / Drop') },
            ].map((s, i) => (
              <div key={s.step} className="flex items-center gap-3">
                {i > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground hidden md:block" />}
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-card min-w-[160px]">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">{s.step}</div>
                  <div>
                    <div className="font-semibold">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 rounded-lg border-l-4 border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20 text-sm">
          <strong>{t('docsPage.rulesEngine.importantNote', 'Important:')}</strong>{' '}
          {t('docsPage.rulesEngine.importantNoteBody', 'Rules extend subscriptions — they don\'t replace them. Subscriptions handle the core event→endpoint delivery. Rules add conditional logic on top: extra routing, payload transformations, tagging, or dropping events.')}
        </div>
      </div>

      {/* Concepts */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">{t('docsPage.rulesEngine.concepts', 'Core Concepts')}</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border bg-card">
            <h3 className="font-semibold mb-2 flex items-center gap-2"><GitBranch className="h-4 w-4 text-cyan-500" /> {t('docsPage.rulesEngine.conceptRule', 'Rule')}</h3>
            <p className="text-sm text-muted-foreground">{t('docsPage.rulesEngine.conceptRuleDesc', 'A named, prioritized container with an optional event type pattern, a list of conditions (AND/OR), and a list of actions. Rules are evaluated in priority order (highest first).')}</p>
          </div>
          <div className="p-4 rounded-xl border bg-card">
            <h3 className="font-semibold mb-2 flex items-center gap-2"><Zap className="h-4 w-4 text-emerald-500" /> {t('docsPage.rulesEngine.conceptCondition', 'Condition')}</h3>
            <p className="text-sm text-muted-foreground">{t('docsPage.rulesEngine.conceptConditionDesc', 'A field + operator + value triple. Fields use dot notation (e.g. data.order.amount). Supports 15 operators: equals, gt, gte, lt, lte, contains, starts_with, ends_with, in, not_in, regex, exists, and more.')}</p>
          </div>
          <div className="p-4 rounded-xl border bg-card">
            <h3 className="font-semibold mb-2 flex items-center gap-2"><Route className="h-4 w-4 text-blue-500" /> {t('docsPage.rulesEngine.conceptAction', 'Action')}</h3>
            <p className="text-sm text-muted-foreground">{t('docsPage.rulesEngine.conceptActionDesc', 'What happens when a rule matches. Four types: ROUTE (send to an endpoint), TRANSFORM (apply a transformation), TAG (label the event), DROP (silently discard — no deliveries created).')}</p>
          </div>
          <div className="p-4 rounded-xl border bg-card">
            <h3 className="font-semibold mb-2 flex items-center gap-2"><Shield className="h-4 w-4 text-violet-500" /> {t('docsPage.rulesEngine.conceptPattern', 'Event Type Pattern')}</h3>
            <p className="text-sm text-muted-foreground">{t('docsPage.rulesEngine.conceptPatternDesc', 'Optional pre-filter. Supports exact match (order.completed), single-level wildcard (order.*), multi-level wildcard (order.**), or omit to match all event types.')}</p>
          </div>
        </div>
      </div>

      {/* Action types */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">{t('docsPage.rulesEngine.actionTypes', 'Action Types')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-3 font-semibold">Type</th>
                <th className="pb-3 font-semibold">Description</th>
                <th className="pb-3 font-semibold">Required Fields</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="py-3"><span className="px-2 py-1 rounded bg-blue-500/10 text-blue-600 text-xs font-bold">ROUTE</span></td>
                <td className="py-3 text-muted-foreground">Send event to an additional endpoint</td>
                <td className="py-3 font-mono text-xs">endpointId</td>
              </tr>
              <tr>
                <td className="py-3"><span className="px-2 py-1 rounded bg-violet-500/10 text-violet-600 text-xs font-bold">TRANSFORM</span></td>
                <td className="py-3 text-muted-foreground">Apply a payload transformation template</td>
                <td className="py-3 font-mono text-xs">transformationId</td>
              </tr>
              <tr>
                <td className="py-3"><span className="px-2 py-1 rounded bg-amber-500/10 text-amber-600 text-xs font-bold">TAG</span></td>
                <td className="py-3 text-muted-foreground">Attach a label to the event for filtering</td>
                <td className="py-3 font-mono text-xs">config.tag</td>
              </tr>
              <tr>
                <td className="py-3"><span className="px-2 py-1 rounded bg-red-500/10 text-red-600 text-xs font-bold">DROP</span></td>
                <td className="py-3 text-muted-foreground">Silently discard — no deliveries created</td>
                <td className="py-3 text-muted-foreground italic">none</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Condition operators */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">{t('docsPage.rulesEngine.operators', 'Condition Operators')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            { op: 'equals', desc: 'Exact match' },
            { op: 'not_equals', desc: 'Not equal' },
            { op: 'gt', desc: 'Greater than' },
            { op: 'gte', desc: 'Greater or equal' },
            { op: 'lt', desc: 'Less than' },
            { op: 'lte', desc: 'Less or equal' },
            { op: 'contains', desc: 'String contains' },
            { op: 'not_contains', desc: 'Doesn\'t contain' },
            { op: 'starts_with', desc: 'Starts with prefix' },
            { op: 'ends_with', desc: 'Ends with suffix' },
            { op: 'in', desc: 'Value in list' },
            { op: 'not_in', desc: 'Not in list' },
            { op: 'exists', desc: 'Field exists' },
            { op: 'not_exists', desc: 'Field missing' },
            { op: 'regex', desc: 'Regex match' },
          ].map(({ op, desc }) => (
            <div key={op} className="flex items-center gap-2 p-2 rounded-lg border bg-card text-xs">
              <code className="font-mono font-bold text-primary">{op}</code>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* API Examples */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">{t('docsPage.rulesEngine.apiExamples', 'API Examples')}</h2>

        <h3 className="text-lg font-semibold mt-6">{t('docsPage.rulesEngine.createRule', 'Create a Rule')}</h3>
        <p className="text-sm text-muted-foreground mb-3">{t('docsPage.rulesEngine.createRuleDesc', 'This rule matches high-value orders and routes them to fraud detection, applies geo-enrichment, and tags them.')}</p>
        <CodeBlock language="curl" setLanguage={() => {}}>{createRuleCode}</CodeBlock>

        <h3 className="text-lg font-semibold mt-6">{t('docsPage.rulesEngine.listRules', 'List Rules')}</h3>
        <CodeBlock language="curl" setLanguage={() => {}}>{listRulesCode}</CodeBlock>

        <h3 className="text-lg font-semibold mt-6">{t('docsPage.rulesEngine.toggleRule', 'Toggle Rule (Enable/Disable)')}</h3>
        <CodeBlock language="curl" setLanguage={() => {}}>{toggleRuleCode}</CodeBlock>

        <h3 className="text-lg font-semibold mt-6">{t('docsPage.rulesEngine.dropExample', 'Example: Drop Test Events')}</h3>
        <p className="text-sm text-muted-foreground mb-3">{t('docsPage.rulesEngine.dropExampleDesc', 'Use priority 100 to ensure test events are dropped before any other rule processes them.')}</p>
        <CodeBlock language="curl" setLanguage={() => {}}>{dropRuleCode}</CodeBlock>
      </div>

      {/* High-load architecture */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">{t('docsPage.rulesEngine.architecture', 'High-Load Architecture')}</h2>
        <p className="text-sm text-muted-foreground">{t('docsPage.rulesEngine.architectureDesc', 'The rules engine is designed for throughput of 100,000+ events per second with sub-millisecond evaluation:')}</p>

        <div className="space-y-3">
          {[
            {
              title: t('docsPage.rulesEngine.arch1Title', 'Compiled In-Memory Cache'),
              desc: t('docsPage.rulesEngine.arch1Desc', 'Rules are compiled from DB into in-memory predicates (Predicate<Map>) once, then evaluated without any DB access. Cache refreshes every 30s (configurable via RULES_CACHE_REFRESH_MS).'),
              color: 'border-cyan-500',
            },
            {
              title: t('docsPage.rulesEngine.arch2Title', 'Two-Stage Evaluation'),
              desc: t('docsPage.rulesEngine.arch2Desc', 'Stage 1: Pre-filter by event type pattern (exact match → wildcard → catch-all). Stage 2: Evaluate conditions only for matching rules. This means rules with non-matching patterns are never evaluated.'),
              color: 'border-blue-500',
            },
            {
              title: t('docsPage.rulesEngine.arch3Title', 'JSON Path Memoization'),
              desc: t('docsPage.rulesEngine.arch3Desc', 'Condition field paths (e.g. data.order.amount) are compiled once into efficient accessor functions. No JSON parsing or path resolution during evaluation.'),
              color: 'border-violet-500',
            },
            {
              title: t('docsPage.rulesEngine.arch4Title', 'Hot-Reload Without Downtime'),
              desc: t('docsPage.rulesEngine.arch4Desc', 'When a rule is created, updated, or deleted via API, the cache for that project is invalidated immediately. Other projects\' caches are unaffected. Periodic refresh catches any edge cases.'),
              color: 'border-emerald-500',
            },
            {
              title: t('docsPage.rulesEngine.arch5Title', 'Execution Logging & Metrics'),
              desc: t('docsPage.rulesEngine.arch5Desc', 'Every rule evaluation is logged with matched/not-matched status and execution time. Logs auto-cleanup after 7 days (configurable via RULES_EXECUTION_LOG_RETENTION_DAYS). Micrometer metrics expose rule evaluation counters and timing.'),
              color: 'border-amber-500',
            },
          ].map((item) => (
            <div key={item.title} className={`p-4 rounded-xl border-l-4 ${item.color} bg-card`}>
              <h4 className="font-semibold mb-1">{item.title}</h4>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Configuration */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">{t('docsPage.rulesEngine.config', 'Configuration')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-3 font-semibold">Variable</th>
                <th className="pb-3 font-semibold">Default</th>
                <th className="pb-3 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="py-3 font-mono text-xs text-primary">RULES_CACHE_REFRESH_MS</td>
                <td className="py-3 font-mono text-xs">30000</td>
                <td className="py-3 text-muted-foreground">How often compiled rules are refreshed from DB (ms)</td>
              </tr>
              <tr>
                <td className="py-3 font-mono text-xs text-primary">RULES_EXECUTION_LOG_RETENTION_DAYS</td>
                <td className="py-3 font-mono text-xs">7</td>
                <td className="py-3 text-muted-foreground">Auto-cleanup rule execution logs older than N days</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Best practices */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">{t('docsPage.rulesEngine.bestPractices', 'Best Practices')}</h2>
        <div className="space-y-2">
          {[
            t('docsPage.rulesEngine.bp1', 'Use event type patterns to pre-filter — rules with patterns are faster because they skip the condition evaluation stage entirely for non-matching events.'),
            t('docsPage.rulesEngine.bp2', 'Assign priorities carefully — higher priority rules are evaluated first. Use DROP rules with high priority to filter out noise before other rules run.'),
            t('docsPage.rulesEngine.bp3', 'Keep conditions simple — the engine is optimized for field-level comparisons. Avoid deeply nested paths when possible.'),
            t('docsPage.rulesEngine.bp4', 'Use AND operator for strict matching, OR for flexible matching. Most production rules use AND.'),
            t('docsPage.rulesEngine.bp5', 'Create Transformations first, then reference them in TRANSFORM actions. This keeps your pipeline modular and reusable.'),
            t('docsPage.rulesEngine.bp6', 'Monitor the stats (evaluations, matches, match rate) in the UI to identify rules that never match — they may need updating.'),
          ].map((tip, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg border bg-card">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">{tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SchemaRegistryDocs(_props: { activeLanguage: 'curl' | 'node' | 'python'; setActiveLanguage: (l: 'curl' | 'node' | 'python') => void }) {
  const { t } = useTranslation();

  const createEventTypeCode = `curl -X POST https://your-api.com/api/v1/projects/{projectId}/schemas \\
  -H "X-API-Key: wh_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "order.created",
    "description": "Fired when a new order is placed"
  }'`;

  const createVersionCode = `curl -X POST https://your-api.com/api/v1/projects/{projectId}/schemas/{eventTypeId}/versions \\
  -H "X-API-Key: wh_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "schemaJson": "{\\"type\\":\\"object\\",\\"required\\":[\\"order_id\\",\\"amount\\"],\\"properties\\":{\\"order_id\\":{\\"type\\":\\"string\\"},\\"amount\\":{\\"type\\":\\"number\\"},\\"currency\\":{\\"type\\":\\"string\\",\\"enum\\":[\\"USD\\",\\"EUR\\",\\"UAH\\"]}},\\"additionalProperties\\":false}",
    "description": "Initial schema with required fields",
    "compatibilityMode": "BACKWARD"
  }'`;

  const promoteCode = `curl -X POST https://your-api.com/api/v1/projects/{projectId}/schemas/{eventTypeId}/versions/{versionId}/promote \\
  -H "X-API-Key: wh_live_abc123..."`;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('docsPage.schemaRegistry.title')}</h1>
        <p className="text-lg text-muted-foreground">{t('docsPage.schemaRegistry.subtitle')}</p>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2"><FileCheck className="h-5 w-5 text-primary" /> {t('docsPage.schemaRegistry.overview')}</h2>
        <p className="text-muted-foreground leading-relaxed">{t('docsPage.schemaRegistry.overviewDesc1')}</p>
        <div className="bg-muted/50 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground font-mono">{t('docsPage.schemaRegistry.overviewDesc2')}</p>
        </div>
      </section>

      {/* Event Types API */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.schemaRegistry.eventTypesApi')}</h2>
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.schemaRegistry.createEventType')}</h3>
            <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/schemas" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.schemaRegistry.createEventTypeDesc')}</p>
            <ResponseBlock>{createEventTypeCode}</ResponseBlock>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.schemaRegistry.listEventTypes')}</h3>
            <HTTPMethod method="GET" path="/api/v1/projects/{projectId}/schemas" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.schemaRegistry.listEventTypesDesc')}</p>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.schemaRegistry.updateEventType')}</h3>
            <HTTPMethod method="PUT" path="/api/v1/projects/{projectId}/schemas/{eventTypeId}" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.schemaRegistry.updateEventTypeDesc')}</p>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.schemaRegistry.deleteEventType')}</h3>
            <HTTPMethod method="DELETE" path="/api/v1/projects/{projectId}/schemas/{eventTypeId}" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.schemaRegistry.deleteEventTypeDesc')}</p>
          </div>
        </div>
      </section>

      {/* Schema Versions API */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.schemaRegistry.versionsApi')}</h2>
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.schemaRegistry.createVersion')}</h3>
            <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/schemas/{eventTypeId}/versions" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.schemaRegistry.createVersionDesc')}</p>
            <ResponseBlock>{createVersionCode}</ResponseBlock>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.schemaRegistry.listVersions')}</h3>
            <HTTPMethod method="GET" path="/api/v1/projects/{projectId}/schemas/{eventTypeId}/versions" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.schemaRegistry.listVersionsDesc')}</p>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.schemaRegistry.promoteVersion')}</h3>
            <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/schemas/{eventTypeId}/versions/{versionId}/promote" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.schemaRegistry.promoteVersionDesc')}</p>
            <ResponseBlock>{promoteCode}</ResponseBlock>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.schemaRegistry.deprecateVersion')}</h3>
            <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/schemas/{eventTypeId}/versions/{versionId}/deprecate" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.schemaRegistry.deprecateVersionDesc')}</p>
          </div>
        </div>
      </section>

      {/* Schema Changes API */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.schemaRegistry.changesApi')}</h2>
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.schemaRegistry.listChanges')}</h3>
            <HTTPMethod method="GET" path="/api/v1/projects/{projectId}/schemas/{eventTypeId}/changes" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.schemaRegistry.listChangesDesc')}</p>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-2">{t('docsPage.schemaRegistry.listProjectChanges')}</h3>
            <HTTPMethod method="GET" path="/api/v1/projects/{projectId}/schemas/changes" />
            <p className="text-sm text-muted-foreground mb-3">{t('docsPage.schemaRegistry.listProjectChangesDesc')}</p>
          </div>
        </div>
      </section>

      {/* Validation Policies */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> {t('docsPage.schemaRegistry.validationPolicies')}</h2>
        <p className="text-muted-foreground">{t('docsPage.schemaRegistry.validationPoliciesDesc')}</p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2"><Shield className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" /> {t('docsPage.schemaRegistry.policyWarn')}</li>
          <li className="flex items-start gap-2"><Shield className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" /> {t('docsPage.schemaRegistry.policyBlock')}</li>
        </ul>
      </section>

      {/* Wildcard Routing */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2"><GitBranch className="h-5 w-5 text-primary" /> {t('docsPage.schemaRegistry.wildcardRouting')}</h2>
        <p className="text-muted-foreground">{t('docsPage.schemaRegistry.wildcardRoutingDesc')}</p>
        <div className="bg-muted/50 rounded-xl border p-4 space-y-1.5">
          <p className="text-sm font-mono text-muted-foreground">{t('docsPage.schemaRegistry.wildcardExact')}</p>
          <p className="text-sm font-mono text-muted-foreground">{t('docsPage.schemaRegistry.wildcardSingle')}</p>
          <p className="text-sm font-mono text-muted-foreground">{t('docsPage.schemaRegistry.wildcardMulti')}</p>
          <p className="text-sm font-mono text-muted-foreground">{t('docsPage.schemaRegistry.wildcardAll')}</p>
          <p className="text-sm font-mono text-muted-foreground">{t('docsPage.schemaRegistry.wildcardMiddle')}</p>
        </div>
      </section>

      {/* Compatibility Modes */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('docsPage.schemaRegistry.compatibilityModes')}</h2>
        <p className="text-muted-foreground">{t('docsPage.schemaRegistry.compatibilityModesDesc')}</p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-muted-foreground/50 mt-0.5 flex-shrink-0" /> {t('docsPage.schemaRegistry.compatNone')}</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" /> {t('docsPage.schemaRegistry.compatBackward')}</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" /> {t('docsPage.schemaRegistry.compatForward')}</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" /> {t('docsPage.schemaRegistry.compatFull')}</li>
        </ul>
      </section>
    </div>
  );
}

function SDKs() {
  const { t } = useTranslation();
  const [activeLang, setActiveLang] = useState<'node' | 'python' | 'php' | 'curl'>('node');
  const [activeSection, setActiveSDKSection] = useState('quickstart');

  const tabs = [
    { id: 'node' as const, name: 'Node.js', icon: NodeIcon },
    { id: 'python' as const, name: 'Python', icon: PythonIcon },
    { id: 'php' as const, name: 'PHP', icon: PhpIcon },
  ];

  const sections = [
    { id: 'quickstart', label: t('docsPage.sdks.quickStart') },
    { id: 'events', label: t('docsPage.sdks.events') },
    { id: 'endpoints', label: t('docsPage.sdks.endpoints') },
    { id: 'subscriptions', label: t('docsPage.sdks.subscriptions') },
    { id: 'deliveries', label: t('docsPage.sdks.deliveries') },
    { id: 'verify', label: t('docsPage.sdks.sigVerification') },
    { id: 'errors', label: t('docsPage.sdks.errorHandling') },
  ];

  const code: Record<string, Record<string, { code: string; label: string }>> = {
    quickstart: {
      node: { label: 'typescript', code: `import { Hookflow } from '@webhook-platform/node';

const client = new Hookflow({
  apiKey: 'wh_live_your_api_key',
  baseUrl: 'http://localhost:8080', // optional
});

// Send an event
const event = await client.events.send({
  type: 'order.completed',
  data: {
    orderId: 'ord_12345',
    amount: 99.99,
    currency: 'USD',
  },
});

console.log(\`Event created: \${event.eventId}\`);
console.log(\`Deliveries created: \${event.deliveriesCreated}\`);` },
      python: { label: 'python', code: `from hookflow import Hookflow, Event

client = Hookflow(
    api_key="wh_live_your_api_key",
    base_url="http://localhost:8080",  # optional
)

# Send an event
event = client.events.send(
    Event(
        type="order.completed",
        data={
            "order_id": "ord_12345",
            "amount": 99.99,
            "currency": "USD",
        },
    )
)

print(f"Event created: {event.event_id}")
print(f"Deliveries created: {event.deliveries_created}")` },
      php: { label: 'php', code: `<?php
use Hookflow\\Hookflow;

$client = new Hookflow(
    apiKey: 'wh_live_your_api_key',
    baseUrl: 'http://localhost:8080' // optional
);

// Send an event
$event = $client->events->send(
    type: 'order.completed',
    data: [
        'orderId' => 'ord_12345',
        'amount' => 99.99,
        'currency' => 'USD',
    ]
);

echo "Event created: {$event['eventId']}\\n";
echo "Deliveries created: {$event['deliveriesCreated']}\\n";` },
      curl: { label: 'bash', code: `# Send an event
curl -X POST http://localhost:8080/api/v1/events \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "order.completed",
    "data": {
      "orderId": "ord_12345",
      "amount": 99.99,
      "currency": "USD"
    }
  }'` },
    },
    events: {
      node: { label: 'typescript', code: `// Send event with idempotency key
const event = await client.events.send(
  { type: 'order.completed', data: { orderId: '123' } },
  'unique-idempotency-key'
);` },
      python: { label: 'python', code: `from hookflow import Event

# Send event with idempotency key
event = client.events.send(
    Event(type="order.completed", data={"order_id": "123"}),
    idempotency_key="unique-key",
)` },
      php: { label: 'php', code: `// Send event with idempotency key
$event = $client->events->send(
    type: 'order.completed',
    data: ['orderId' => '123'],
    idempotencyKey: 'unique-key'
);` },
      curl: { label: 'bash', code: `# Send event with idempotency key
curl -X POST http://localhost:8080/api/v1/events \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: unique-key" \\
  -d '{"type":"order.completed","data":{"orderId":"123"}}'` },
    },
    endpoints: {
      node: { label: 'typescript', code: `// Create endpoint
const endpoint = await client.endpoints.create(projectId, {
  url: 'https://api.example.com/webhooks',
  description: 'Production webhooks',
  enabled: true,
});

// List endpoints
const endpoints = await client.endpoints.list(projectId);

// Update endpoint
await client.endpoints.update(projectId, endpointId, {
  enabled: false,
});

// Delete endpoint
await client.endpoints.delete(projectId, endpointId);

// Rotate secret
const updated = await client.endpoints.rotateSecret(projectId, endpointId);
console.log(\`New secret: \${updated.secret}\`);

// Test endpoint connectivity
const result = await client.endpoints.test(projectId, endpointId);
console.log(\`Test \${result.success ? 'passed' : 'failed'}: \${result.latencyMs}ms\`);` },
      python: { label: 'python', code: `from hookflow import EndpointCreateParams, EndpointUpdateParams

# Create endpoint
endpoint = client.endpoints.create(
    project_id,
    EndpointCreateParams(
        url="https://api.example.com/webhooks",
        description="Production webhooks",
        enabled=True,
    ),
)

# List endpoints
endpoints = client.endpoints.list(project_id)

# Update endpoint
client.endpoints.update(
    project_id, endpoint_id,
    EndpointUpdateParams(enabled=False),
)

# Delete endpoint
client.endpoints.delete(project_id, endpoint_id)

# Rotate secret
updated = client.endpoints.rotate_secret(project_id, endpoint_id)
print(f"New secret: {updated.secret}")

# Test endpoint connectivity
result = client.endpoints.test(project_id, endpoint_id)
print(f"Test {'passed' if result.success else 'failed'}: {result.latency_ms}ms")` },
      php: { label: 'php', code: `// Create endpoint
$endpoint = $client->endpoints->create($projectId, [
    'url' => 'https://api.example.com/webhooks',
    'description' => 'Production webhooks',
    'enabled' => true,
]);

// List endpoints
$endpoints = $client->endpoints->list($projectId);

// Update endpoint
$client->endpoints->update($projectId, $endpointId, [
    'enabled' => false,
]);

// Delete endpoint
$client->endpoints->delete($projectId, $endpointId);

// Rotate secret
$updated = $client->endpoints->rotateSecret($projectId, $endpointId);
echo "New secret: {$updated['secret']}\\n";

// Test endpoint connectivity
$result = $client->endpoints->test($projectId, $endpointId);
$status = $result['success'] ? 'passed' : 'failed';
echo "Test {$status}: {$result['latencyMs']}ms\\n";` },
      curl: { label: 'bash', code: `# Create endpoint
curl -X POST http://localhost:8080/api/v1/projects/{projectId}/endpoints \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://api.example.com/webhooks","description":"Production","enabled":true}'

# List endpoints
curl http://localhost:8080/api/v1/projects/{projectId}/endpoints \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"

# Rotate secret
curl -X POST http://localhost:8080/api/v1/projects/{projectId}/endpoints/{id}/rotate-secret \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"` },
    },
    subscriptions: {
      node: { label: 'typescript', code: `// Subscribe endpoint to event type
const subscription = await client.subscriptions.create(projectId, {
  endpointId: endpoint.id,
  eventType: 'order.completed',
  enabled: true,
});

// List subscriptions
const subscriptions = await client.subscriptions.list(projectId);

// Update subscription
await client.subscriptions.update(projectId, subscriptionId, {
  eventType: 'order.shipped',
  enabled: true,
});

// Delete subscription
await client.subscriptions.delete(projectId, subscriptionId);` },
      python: { label: 'python', code: `from hookflow import SubscriptionCreateParams

# Subscribe endpoint to event type
subscription = client.subscriptions.create(
    project_id,
    SubscriptionCreateParams(
        endpoint_id=endpoint.id,
        event_type="order.completed",
        enabled=True,
    ),
)

# List subscriptions
subscriptions = client.subscriptions.list(project_id)

# Update subscription
client.subscriptions.update(
    project_id, subscription_id,
    event_type="order.shipped",
)

# Delete subscription
client.subscriptions.delete(project_id, subscription_id)` },
      php: { label: 'php', code: `// Subscribe endpoint to event type
$subscription = $client->subscriptions->create($projectId, [
    'endpointId' => $endpoint['id'],
    'eventType' => 'order.completed',
    'enabled' => true,
]);

// List subscriptions
$subscriptions = $client->subscriptions->list($projectId);

// Update subscription
$client->subscriptions->update($projectId, $subscriptionId, [
    'eventType' => 'order.shipped',
    'enabled' => true,
]);

// Delete subscription
$client->subscriptions->delete($projectId, $subscriptionId);` },
      curl: { label: 'bash', code: `# Create subscription
curl -X POST http://localhost:8080/api/v1/projects/{projectId}/subscriptions \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"endpointId":"endpoint-uuid","eventType":"order.completed","enabled":true}'

# List subscriptions
curl http://localhost:8080/api/v1/projects/{projectId}/subscriptions \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"` },
    },
    deliveries: {
      node: { label: 'typescript', code: `// List deliveries with filters
const deliveries = await client.deliveries.list(projectId, {
  status: 'FAILED',
  page: 0,
  size: 20,
});

console.log(\`Total failed: \${deliveries.totalElements}\`);

// Get delivery attempts
const attempts = await client.deliveries.getAttempts(deliveryId);
for (const attempt of attempts) {
  console.log(\`Attempt \${attempt.attemptNumber}: \${attempt.httpStatus} (\${attempt.latencyMs}ms)\`);
}

// Replay failed delivery
await client.deliveries.replay(deliveryId);` },
      python: { label: 'python', code: `from hookflow import DeliveryListParams, DeliveryStatus

# List deliveries with filters
deliveries = client.deliveries.list(
    project_id,
    DeliveryListParams(status=DeliveryStatus.FAILED, page=0, size=20),
)

print(f"Total failed: {deliveries.total_elements}")

# Get delivery attempts
attempts = client.deliveries.get_attempts(delivery_id)
for attempt in attempts:
    print(f"Attempt {attempt.attempt_number}: {attempt.http_status} ({attempt.latency_ms}ms)")

# Replay failed delivery
client.deliveries.replay(delivery_id)` },
      php: { label: 'php', code: `// List deliveries with filters
$deliveries = $client->deliveries->list($projectId, [
    'status' => 'FAILED',
    'page' => 0,
    'size' => 20,
]);

echo "Total failed: {$deliveries['totalElements']}\\n";

// Get delivery attempts
$attempts = $client->deliveries->getAttempts($deliveryId);
foreach ($attempts as $attempt) {
    echo "Attempt {$attempt['attemptNumber']}: {$attempt['httpStatus']} ({$attempt['latencyMs']}ms)\\n";
}

// Replay failed delivery
$client->deliveries->replay($deliveryId);` },
      curl: { label: 'bash', code: `# List failed deliveries
curl "http://localhost:8080/api/v1/deliveries/projects/{projectId}?status=FAILED&page=0&size=20" \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"

# Get delivery attempts
curl http://localhost:8080/api/v1/deliveries/{deliveryId}/attempts \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"

# Replay a delivery
curl -X POST http://localhost:8080/api/v1/deliveries/{deliveryId}/replay \\
  -H "X-API-Key: wh_live_YOUR_API_KEY"` },
    },
    verify: {
      node: { label: 'typescript', code: `import { verifySignature, constructEvent } from '@webhook-platform/node';

app.post('/webhooks', (req, res) => {
  const payload = req.body; // raw body string
  const signature = req.headers['x-signature'];
  const secret = process.env.WEBHOOK_SECRET;

  try {
    // Option 1: Just verify
    verifySignature(payload, signature, secret);

    // Option 2: Verify and parse
    const event = constructEvent(payload, req.headers, secret);

    console.log(\`Received \${event.type}:\`, event.data);

    switch (event.type) {
      case 'order.completed':
        handleOrderCompleted(event.data);
        break;
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    res.status(400).send('Invalid signature');
  }
});` },
      python: { label: 'python', code: `from hookflow import verify_signature, construct_event, HookflowError
from flask import Flask, request

app = Flask(__name__)

@app.route("/webhooks", methods=["POST"])
def handle_webhook():
    payload = request.get_data(as_text=True)
    headers = dict(request.headers)
    secret = os.environ["WEBHOOK_SECRET"]

    try:
        # Option 1: Just verify
        verify_signature(payload, headers.get("X-Signature", ""), secret)

        # Option 2: Verify and parse
        event = construct_event(payload, headers, secret)

        print(f"Received {event.type}: {event.data}")

        if event.type == "order.completed":
            handle_order_completed(event.data)

        return "OK", 200

    except HookflowError as e:
        print(f"Webhook verification failed: {e.message}")
        return "Invalid signature", 400` },
      php: { label: 'php', code: `<?php
use Hookflow\\Webhook;
use Hookflow\\Exception\\HookflowException;

$payload = file_get_contents('php://input');
$headers = getallheaders();
$secret = getenv('WEBHOOK_SECRET');

try {
    // Option 1: Just verify
    Webhook::verifySignature($payload, $headers['X-Signature'] ?? '', $secret);

    // Option 2: Verify and parse
    $event = Webhook::constructEvent($payload, $headers, $secret);

    echo "Received {$event['type']}: " . json_encode($event['data']) . "\\n";

    switch ($event['type']) {
        case 'order.completed':
            handleOrderCompleted($event['data']);
            break;
    }

    http_response_code(200);
    echo 'OK';

} catch (HookflowException $e) {
    error_log("Webhook verification failed: {$e->getMessage()}");
    http_response_code(400);
    echo 'Invalid signature';
}` },
      curl: { label: 'bash', code: `# Verify signature manually (HMAC-SHA256)
# The platform signs: timestamp.payload
# Header: X-Signature = t=<timestamp>,v1=<hmac>

PAYLOAD='{"type":"order.completed","data":{"orderId":"123"}}'
SECRET="whsec_your_endpoint_secret"
TIMESTAMP=$(date +%s)

SIGNATURE=$(echo -n "\${TIMESTAMP}.\${PAYLOAD}" | openssl dgst -sha256 -hmac "\${SECRET}" | cut -d' ' -f2)

curl -X POST http://localhost:3000/webhooks \\
  -H "Content-Type: application/json" \\
  -H "X-Signature: t=\${TIMESTAMP},v1=\${SIGNATURE}" \\
  -d "\${PAYLOAD}"` },
    },
    errors: {
      node: { label: 'typescript', code: `import {
  HookflowError,
  RateLimitError,
  AuthenticationError,
  ValidationError
} from '@webhook-platform/node';

try {
  await client.events.send({ type: 'test', data: {} });
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(\`Rate limited. Retry after \${err.retryAfter}ms\`);
    await sleep(err.retryAfter);
  } else if (err instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (err instanceof ValidationError) {
    console.error('Validation failed:', err.fieldErrors);
  } else if (err instanceof HookflowError) {
    console.error(\`Error \${err.status}: \${err.message}\`);
  }
}` },
      python: { label: 'python', code: `from hookflow import (
    HookflowError,
    RateLimitError,
    AuthenticationError,
    ValidationError,
)

try:
    client.events.send(Event(type="test", data={}))
except RateLimitError as e:
    print(f"Rate limited. Retry after {e.retry_after_ms}ms")
    time.sleep(e.retry_after_ms / 1000)
except AuthenticationError:
    print("Invalid API key")
except ValidationError as e:
    print(f"Validation failed: {e.field_errors}")
except HookflowError as e:
    print(f"Error {e.status}: {e.message}")` },
      php: { label: 'php', code: `<?php
use Hookflow\\Exception\\HookflowException;
use Hookflow\\Exception\\RateLimitException;
use Hookflow\\Exception\\AuthenticationException;
use Hookflow\\Exception\\ValidationException;

try {
    $client->events->send(type: 'test', data: []);
} catch (RateLimitException $e) {
    echo "Rate limited. Retry after {$e->getRetryAfterMs()}ms\\n";
    usleep($e->getRetryAfterMs() * 1000);
} catch (AuthenticationException $e) {
    echo "Invalid API key\\n";
} catch (ValidationException $e) {
    echo "Validation failed: " . json_encode($e->getFieldErrors()) . "\\n";
} catch (HookflowException $e) {
    echo "Error {$e->getStatusCode()}: {$e->getMessage()}\\n";
}` },
      curl: { label: 'bash', code: `# HTTP status codes:
# 200 — Success
# 201 — Created
# 400 — Validation error (check "message" field)
# 401 — Invalid or missing API key
# 404 — Resource not found
# 409 — Conflict (idempotency key reuse)
# 429 — Rate limited (check Retry-After header)
# 500 — Server error

# Example: check for rate limit
RESPONSE=$(curl -s -w "\\n%{http_code}" -X POST \\
  http://localhost:8080/api/v1/events \\
  -H "X-API-Key: wh_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"test","data":{}}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "429" ]; then
  echo "Rate limited — wait and retry"
fi` },
    },
  };

  const sdkMeta = [
    { id: 'node' as const, name: 'Node.js / TypeScript', pkg: '@webhook-platform/node', url: 'https://www.npmjs.com/package/@webhook-platform/node', badge: 'npm', install: 'npm install @webhook-platform/node', icon: NodeIcon },
    { id: 'python' as const, name: 'Python', pkg: 'webhook-platform', url: 'https://pypi.org/project/webhook-platform/', badge: 'PyPI', install: 'pip install webhook-platform', icon: PythonIcon },
    { id: 'php' as const, name: 'PHP', pkg: 'webhook-platform/php', url: 'https://packagist.org/packages/webhook-platform/php', badge: 'Packagist', install: 'composer require webhook-platform/php', icon: PhpIcon },
  ];

  const activeCode = code[activeSection]?.[activeLang];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('docsPage.sdks.title')}</h1>
        <p className="text-lg text-muted-foreground">
          {t('docsPage.sdks.subtitle')}
        </p>
      </div>

      {/* SDK cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {sdkMeta.map(sdk => (
          <a key={sdk.id} href={sdk.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-4 p-5 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-lg transition-all group">
            <sdk.icon className="h-10 w-10 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{sdk.name}</div>
              <div className="text-xs text-muted-foreground font-mono truncate">{sdk.pkg}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] px-2 py-0.5 bg-muted rounded-md text-muted-foreground font-mono uppercase">{sdk.badge}</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </a>
        ))}
      </div>

      {/* Installation */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">{t('docsPage.sdks.installation')}</h2>
        <div className="space-y-2">
          {sdkMeta.map(sdk => (
            <SdkCodeBlock key={sdk.id} label="terminal" copyText={sdk.install}>
              <code className="text-emerald-400">$ </code><code className="text-slate-200">{sdk.install}</code>
            </SdkCodeBlock>
          ))}
        </div>
      </div>

      {/* Section nav */}
      <div className="border-b border-border">
        <div className="flex gap-1 overflow-x-auto pb-px">
          {sections.map(s => (
            <button key={s.id} onClick={() => setActiveSDKSection(s.id)}
              className={`px-3 py-2 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeSection === s.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Language tabs + code */}
      <div>
        <div className="flex gap-1 mb-4">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveLang(t.id)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                activeLang === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
              }`}>
              <t.icon className="h-4 w-4" />
              {t.name}
            </button>
          ))}
          <button onClick={() => setActiveLang('curl')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
              activeLang === 'curl' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            }`}>
            <Code className="h-4 w-4" />
            cURL
          </button>
        </div>

        {activeCode && (
          <SdkCodeBlock label={activeCode.label} copyText={activeCode.code}>
            <code className="text-slate-200">{activeCode.code}</code>
          </SdkCodeBlock>
        )}
      </div>

      {/* Package links footer */}
      <div className="pt-4 border-t border-border/50">
        <div className="flex flex-wrap gap-4">
          {sdkMeta.map(sdk => (
            <a key={sdk.id} href={sdk.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
              <sdk.icon className="h-4 w-4" />
              {sdk.pkg}
              <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
