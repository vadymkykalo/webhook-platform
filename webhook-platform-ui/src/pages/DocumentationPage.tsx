import { ArrowRight, CheckCircle2, Code, Copy, Book, Key, Zap, Shield, RefreshCw, Menu, X, ExternalLink, Package, ArrowDownToLine, FileCheck, GitBranch } from 'lucide-react';
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
            {activeSection === 'webhook-security' && <WebhookSecurity activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'incoming-webhooks' && <IncomingWebhooks activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'schema-registry' && <SchemaRegistryDocs activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
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
    { id: 'webhook-security', label: t('docsPage.sections.webhookSecurity'), icon: Shield },
    { id: 'incoming-webhooks', label: t('docsPage.sections.incomingWebhooks'), icon: ArrowDownToLine },
    { id: 'schema-registry', label: t('docsPage.sections.schemaRegistry'), icon: FileCheck },
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
      curl: `curl -X POST http://localhost:8080/api/v1/projects \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Production",
    "description": "Production webhooks"
  }'`,
      node: `const response = await fetch('http://localhost:8080/api/v1/projects', {
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
      python: `import requests

response = requests.post(
    'http://localhost:8080/api/v1/projects',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'},
    json={'name': 'Production', 'description': 'Production webhooks'}
)
project = response.json()`,
    },
    createApiKey: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/api-keys \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Production API Key"
  }'`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/api-keys\`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ name: 'Production API Key' })
});
const apiKey = await response.json();`,
      python: `import requests

response = requests.post(
    f'http://localhost:8080/api/v1/projects/{project_id}/api-keys',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'},
    json={'name': 'Production API Key'}
)
api_key = response.json()`,
    },
    createEndpoint: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/endpoints \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://api.customer.com/webhooks",
    "description": "Production webhooks",
    "enabled": true
  }'`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/endpoints\`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: 'https://api.customer.com/webhooks',
    description: 'Production webhooks',
    enabled: true
  })
});
const endpoint = await response.json();`,
      python: `import requests

response = requests.post(
    f'http://localhost:8080/api/v1/projects/{project_id}/endpoints',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'},
    json={
        'url': 'https://api.customer.com/webhooks',
        'description': 'Production webhooks',
        'enabled': True
    }
)
endpoint = response.json()`,
    },
    createSubscription: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/subscriptions \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "endpointId": "endpoint-uuid",
    "eventType": "order.completed",
    "enabled": true
  }'`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/subscriptions\`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    endpointId: 'endpoint-uuid',
    eventType: 'order.completed',
    enabled: true
  })
});
const subscription = await response.json();`,
      python: `import requests

response = requests.post(
    f'http://localhost:8080/api/v1/projects/{project_id}/subscriptions',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'},
    json={
        'endpointId': 'endpoint-uuid',
        'eventType': 'order.completed',
        'enabled': True
    }
)
subscription = response.json()`,
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
      node: `const response = await fetch('http://localhost:8080/api/v1/events', {
  method: 'POST',
  headers: {
    'X-API-Key': 'wh_live_YOUR_API_KEY',
    'Content-Type': 'application/json',
    'Idempotency-Key': 'unique-request-id'
  },
  body: JSON.stringify({
    type: 'order.completed',
    data: {
      orderId: 'ord_12345',
      amount: 99.99,
      currency: 'USD'
    }
  })
});
const event = await response.json();`,
      python: `import requests

response = requests.post(
    'http://localhost:8080/api/v1/events',
    headers={
        'X-API-Key': 'wh_live_YOUR_API_KEY',
        'Idempotency-Key': 'unique-request-id'
    },
    json={
        'type': 'order.completed',
        'data': {
            'orderId': 'ord_12345',
            'amount': 99.99,
            'currency': 'USD'
        }
    }
)
event = response.json()`,
    },
    verifySignature: {
      curl: `# Signature verification is done server-side`,
      node: `const crypto = require('crypto');

function verifyWebhookSignature(req) {
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];
  const body = JSON.stringify(req.body);
  
  const [, sig] = signature.split('v1=');
  const secret = process.env.WEBHOOK_SECRET;
  
  const payload = \`\${timestamp}.\${body}\`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(expectedSig)
  );
}`,
      python: `import hmac
import hashlib

def verify_webhook_signature(request):
    signature = request.headers.get('X-Signature')
    timestamp = request.headers.get('X-Timestamp')
    body = request.get_data(as_text=True)
    
    sig = signature.split('v1=')[1]
    secret = os.environ['WEBHOOK_SECRET']
    
    payload = f"{timestamp}.{body}"
    expected_sig = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(sig, expected_sig)`,
    },
    listEndpoints: {
      curl: `curl -X GET http://localhost:8080/api/v1/projects/{projectId}/endpoints \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/endpoints\`, {
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});
const endpoints = await response.json();`,
      python: `import requests

response = requests.get(
    f'http://localhost:8080/api/v1/projects/{project_id}/endpoints',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'}
)
endpoints = response.json()`,
    },
    rotateSecret: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/endpoints/{id}/rotate-secret \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/endpoints/\${endpointId}/rotate-secret\`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});
const endpoint = await response.json();`,
      python: `import requests

response = requests.post(
    f'http://localhost:8080/api/v1/projects/{project_id}/endpoints/{endpoint_id}/rotate-secret',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'}
)
endpoint = response.json()`,
    },
    listDeliveries: {
      curl: `curl -X GET "http://localhost:8080/api/v1/deliveries/projects/{projectId}?status=FAILED&page=0&size=20" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/deliveries/projects/\${projectId}?status=FAILED&page=0&size=20\`, {
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});
const deliveries = await response.json();`,
      python: `import requests

response = requests.get(
    f'http://localhost:8080/api/v1/deliveries/projects/{project_id}',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'},
    params={'status': 'FAILED', 'page': 0, 'size': 20}
)
deliveries = response.json()`,
    },
    getAttempts: {
      curl: `curl -X GET http://localhost:8080/api/v1/deliveries/{deliveryId}/attempts \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/deliveries/\${deliveryId}/attempts\`, {
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});
const attempts = await response.json();`,
      python: `import requests

response = requests.get(
    f'http://localhost:8080/api/v1/deliveries/{delivery_id}/attempts',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'}
)
attempts = response.json()`,
    },
    replayDelivery: {
      curl: `curl -X POST http://localhost:8080/api/v1/deliveries/{deliveryId}/replay \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/deliveries/\${deliveryId}/replay\`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});`,
      python: `import requests

response = requests.post(
    f'http://localhost:8080/api/v1/deliveries/{delivery_id}/replay',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'}
)`,
    },
    getEndpoint: {
      curl: `curl -X GET http://localhost:8080/api/v1/projects/{projectId}/endpoints/{id} \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/endpoints/\${endpointId}\`, {
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});
const endpoint = await response.json();`,
      python: `import requests

response = requests.get(
    f'http://localhost:8080/api/v1/projects/{project_id}/endpoints/{endpoint_id}',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'}
)
endpoint = response.json()`,
    },
    updateEndpoint: {
      curl: `curl -X PUT http://localhost:8080/api/v1/projects/{projectId}/endpoints/{id} \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://api.customer.com/webhooks/v2", "enabled": true}'`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/endpoints/\${endpointId}\`, {
  method: 'PUT',
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://api.customer.com/webhooks/v2', enabled: true })
});`,
      python: `import requests

response = requests.put(
    f'http://localhost:8080/api/v1/projects/{project_id}/endpoints/{endpoint_id}',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'},
    json={'url': 'https://api.customer.com/webhooks/v2', 'enabled': True}
)`,
    },
    deleteEndpoint: {
      curl: `curl -X DELETE http://localhost:8080/api/v1/projects/{projectId}/endpoints/{id} \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/endpoints/\${endpointId}\`, {
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});`,
      python: `import requests

response = requests.delete(
    f'http://localhost:8080/api/v1/projects/{project_id}/endpoints/{endpoint_id}',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'}
)`,
    },
    testEndpoint: {
      curl: `curl -X POST http://localhost:8080/api/v1/projects/{projectId}/endpoints/{id}/test \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/endpoints/\${endpointId}/test\`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});
const result = await response.json();`,
      python: `import requests

response = requests.post(
    f'http://localhost:8080/api/v1/projects/{project_id}/endpoints/{endpoint_id}/test',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'}
)
result = response.json()`,
    },
    listSubscriptions: {
      curl: `curl -X GET http://localhost:8080/api/v1/projects/{projectId}/subscriptions \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/subscriptions\`, {
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});
const subscriptions = await response.json();`,
      python: `import requests

response = requests.get(
    f'http://localhost:8080/api/v1/projects/{project_id}/subscriptions',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'}
)
subscriptions = response.json()`,
    },
    getSubscription: {
      curl: `curl -X GET http://localhost:8080/api/v1/projects/{projectId}/subscriptions/{id} \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/subscriptions/\${subscriptionId}\`, {
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});
const subscription = await response.json();`,
      python: `import requests

response = requests.get(
    f'http://localhost:8080/api/v1/projects/{project_id}/subscriptions/{subscription_id}',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'}
)
subscription = response.json()`,
    },
    updateSubscription: {
      curl: `curl -X PUT http://localhost:8080/api/v1/projects/{projectId}/subscriptions/{id} \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"eventType": "order.completed", "enabled": true}'`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/subscriptions/\${subscriptionId}\`, {
  method: 'PUT',
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ eventType: 'order.completed', enabled: true })
});`,
      python: `import requests

response = requests.put(
    f'http://localhost:8080/api/v1/projects/{project_id}/subscriptions/{subscription_id}',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'},
    json={'eventType': 'order.completed', 'enabled': True}
)`,
    },
    deleteSubscription: {
      curl: `curl -X DELETE http://localhost:8080/api/v1/projects/{projectId}/subscriptions/{id} \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `await fetch(\`http://localhost:8080/api/v1/projects/\${projectId}/subscriptions/\${subscriptionId}\`, {
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});`,
      python: `import requests

response = requests.delete(
    f'http://localhost:8080/api/v1/projects/{project_id}/subscriptions/{subscription_id}',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'}
)`,
    },
    getDelivery: {
      curl: `curl -X GET http://localhost:8080/api/v1/deliveries/{deliveryId} \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
      node: `const response = await fetch(\`http://localhost:8080/api/v1/deliveries/\${deliveryId}\`, {
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});
const delivery = await response.json();`,
      python: `import requests

response = requests.get(
    f'http://localhost:8080/api/v1/deliveries/{delivery_id}',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'}
)
delivery = response.json()`,
    },
    bulkReplay: {
      curl: `curl -X POST http://localhost:8080/api/v1/deliveries/bulk-replay \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"projectId": "project-uuid", "status": "FAILED"}'`,
      node: `const response = await fetch('http://localhost:8080/api/v1/deliveries/bulk-replay', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId: 'project-uuid', status: 'FAILED' })
});
const result = await response.json();`,
      python: `import requests

response = requests.post(
    'http://localhost:8080/api/v1/deliveries/bulk-replay',
    headers={'Authorization': 'Bearer YOUR_JWT_TOKEN'},
    json={'projectId': 'project-uuid', 'status': 'FAILED'}
)
result = response.json()`,
    },
    endpointVerification: {
      curl: `# Your endpoint receives:
# POST with {"type": "webhook.verification", "challenge": "whc_..."}
# You must return the challenge value in response`,
      node: `app.post('/webhooks', (req, res) => {
  // Handle verification challenge
  if (req.body.type === 'webhook.verification') {
    return res.json({ challenge: req.body.challenge });
  }
  
  // Process normal webhooks
  console.log('Received:', req.body);
  res.status(200).send('OK');
});`,
      python: `from flask import Flask, request, jsonify

@app.post("/webhooks")
def handle_webhook():
    data = request.json
    
    # Handle verification challenge
    if data.get("type") == "webhook.verification":
        return jsonify({"challenge": data["challenge"]})
    
    # Process normal webhooks
    print("Received:", data)
    return {"status": "ok"}`,
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
    curl: `curl -X POST https://your-api.com/api/v1/projects/{projectId}/incoming-sources \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Stripe Webhooks",
    "slug": "stripe",
    "providerType": "STRIPE",
    "verificationMode": "HMAC_GENERIC",
    "hmacSecret": "whsec_...",
    "hmacHeaderName": "Stripe-Signature"
  }'`,
    node: `const source = await client.incomingSources.create(projectId, {
  name: 'Stripe Webhooks',
  slug: 'stripe',
  providerType: 'STRIPE',
  verificationMode: 'HMAC_GENERIC',
  hmacSecret: 'whsec_...',
  hmacHeaderName: 'Stripe-Signature'
});`,
    python: `from hookflow.types import IncomingSourceCreateParams

source = client.incoming_sources.create(
    project_id,
    IncomingSourceCreateParams(
        name="Stripe Webhooks",
        slug="stripe",
        provider_type="STRIPE",
        verification_mode="HMAC_GENERIC",
        hmac_secret="whsec_...",
        hmac_header_name="Stripe-Signature"
    )
)`
  };

  const createDestCode = {
    curl: `curl -X POST https://your-api.com/api/v1/projects/{projectId}/incoming-sources/{sourceId}/destinations \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-api.com/webhooks/stripe",
    "enabled": true,
    "maxAttempts": 5,
    "timeoutSeconds": 30
  }'`,
    node: `const dest = await client.incomingSources.createDestination(projectId, sourceId, {
  url: 'https://your-api.com/webhooks/stripe',
  enabled: true,
  maxAttempts: 5,
  timeoutSeconds: 30
});`,
    python: `from hookflow.types import IncomingDestinationCreateParams

dest = client.incoming_sources.create_destination(
    project_id,
    source_id,
    IncomingDestinationCreateParams(
        url="https://your-api.com/webhooks/stripe",
        enabled=True,
        max_attempts=5,
        timeout_seconds=30
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

function SchemaRegistryDocs({ activeLanguage, setActiveLanguage }: { activeLanguage: 'curl' | 'node' | 'python'; setActiveLanguage: (l: 'curl' | 'node' | 'python') => void }) {
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
  -H "Authorization: Bearer YOUR_API_KEY" \\
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
  -H "Authorization: Bearer YOUR_API_KEY" \\
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
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://api.example.com/webhooks","description":"Production","enabled":true}'

# List endpoints
curl http://localhost:8080/api/v1/projects/{projectId}/endpoints \\
  -H "Authorization: Bearer YOUR_API_KEY"

# Rotate secret
curl -X POST http://localhost:8080/api/v1/projects/{projectId}/endpoints/{id}/rotate-secret \\
  -H "Authorization: Bearer YOUR_API_KEY"` },
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
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"endpointId":"endpoint-uuid","eventType":"order.completed","enabled":true}'

# List subscriptions
curl http://localhost:8080/api/v1/projects/{projectId}/subscriptions \\
  -H "Authorization: Bearer YOUR_API_KEY"` },
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
curl "http://localhost:8080/api/v1/projects/{projectId}/deliveries?status=FAILED&page=0&size=20" \\
  -H "Authorization: Bearer YOUR_API_KEY"

# Get delivery attempts
curl http://localhost:8080/api/v1/deliveries/{deliveryId}/attempts \\
  -H "Authorization: Bearer YOUR_API_KEY"

# Replay a delivery
curl -X POST http://localhost:8080/api/v1/deliveries/{deliveryId}/replay \\
  -H "Authorization: Bearer YOUR_API_KEY"` },
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
  -H "Authorization: Bearer YOUR_API_KEY" \\
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
