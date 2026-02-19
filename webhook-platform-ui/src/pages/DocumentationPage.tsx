import { ArrowRight, CheckCircle2, Code, Copy, Book, Key, Zap, Shield, RefreshCw, Webhook, Menu, X, Moon, Sun, ExternalLink, Package } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getTheme, setTheme } from '../lib/theme';

export default function DocumentationPage() {
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
            <span className="text-sm font-semibold flex-1">Documentation</span>
            <ThemeToggle />
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
            {activeSection === 'errors' && <Errors />}
            {activeSection === 'sdks' && <SDKs />}
          </div>
        </main>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const [, setToggle] = useState(false);
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return (
    <button
      onClick={() => { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); setToggle(p => !p); }}
      className="flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent w-full"
      title="Toggle theme"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}

function Sidebar({ activeSection, setActiveSection, mobileOpen, onMobileClose }: { activeSection: string; setActiveSection: (section: string) => void; mobileOpen: boolean; onMobileClose: () => void }) {
  const sections = [
    { id: 'overview', label: 'Overview', icon: Book },
    { id: 'authentication', label: 'Authentication', icon: Key },
    { id: 'getting-started', label: 'Getting Started', icon: Zap },
    { id: 'events-api', label: 'Events API', icon: Code },
    { id: 'endpoints-api', label: 'Endpoints API', icon: Shield },
    { id: 'subscriptions-api', label: 'Subscriptions API', icon: RefreshCw },
    { id: 'deliveries-api', label: 'Deliveries API', icon: CheckCircle2 },
    { id: 'webhook-security', label: 'Webhook Security', icon: Shield },
    { id: 'errors', label: 'Errors & Rate Limits', icon: Code },
    { id: 'sdks', label: 'SDKs', icon: Package },
  ];

  const navContent = (
    <div className="p-5">
      <Link to="/" className="flex items-center gap-2.5 mb-8">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <Webhook className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-base font-bold tracking-tight">Hookflow</span>
      </Link>
      <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">API Documentation</p>
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
          <ArrowRight className="h-4 w-4" /> Go to Dashboard
        </Link>
        <ThemeToggle />
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
              <span className="text-sm font-semibold">Navigation</span>
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
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">API Documentation</h1>
        <p className="text-xl text-muted-foreground">
          Complete reference for integrating webhook delivery into your application.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">What is Webhook Platform?</h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          Webhook Platform is a reliable webhook delivery service that handles event routing, retries, and monitoring for your application.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Send events via our API, and we'll deliver them to your configured endpoints with automatic retries, signatures, and full visibility.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">Core Concepts</h2>
        <div className="space-y-6">
          <ConceptCard
            title="Event"
            description="A data payload you send to our API that needs to be delivered to webhook endpoints."
          />
          <ConceptCard
            title="Endpoint"
            description="A URL where webhooks are delivered. Each endpoint has a unique secret for signature verification."
          />
          <ConceptCard
            title="Subscription"
            description="Links an endpoint to specific event types, controlling which events get delivered where."
          />
          <ConceptCard
            title="Delivery"
            description="A single webhook delivery attempt to an endpoint, with full attempt history and status."
          />
          <ConceptCard
            title="Attempt"
            description="Each retry of a delivery, including HTTP status, error message, and latency."
          />
        </div>
      </div>

      <div className="bg-muted/50 rounded-xl p-8 border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Event Flow</h3>
        <div className="flex items-center justify-between text-sm">
          <div className="text-center">
            <div className="w-16 h-16 rounded-lg bg-primary text-white flex items-center justify-center mb-2 mx-auto">
              <Code className="h-8 w-8" />
            </div>
            <div className="font-medium text-foreground">Your system</div>
          </div>
          <ArrowRight className="h-6 w-6 text-muted-foreground/60" />
          <div className="text-center">
            <div className="w-16 h-16 rounded-lg bg-primary text-white flex items-center justify-center mb-2 mx-auto">
              <Zap className="h-8 w-8" />
            </div>
            <div className="font-medium text-foreground">Events API</div>
          </div>
          <ArrowRight className="h-6 w-6 text-muted-foreground/60" />
          <div className="text-center">
            <div className="w-16 h-16 rounded-lg bg-primary text-white flex items-center justify-center mb-2 mx-auto">
              <RefreshCw className="h-8 w-8" />
            </div>
            <div className="font-medium text-foreground">Delivery engine</div>
          </div>
          <ArrowRight className="h-6 w-6 text-muted-foreground/60" />
          <div className="text-center">
            <div className="w-16 h-16 rounded-lg bg-primary text-white flex items-center justify-center mb-2 mx-auto">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="font-medium text-foreground">Customer endpoint</div>
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
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">Authentication</h1>
        <p className="text-xl text-muted-foreground">
          Two authentication methods: JWT for dashboard access and API keys for event ingestion.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">JWT Authentication (Dashboard API)</h2>
        <p className="text-muted-foreground mb-6">
          Use JWT tokens to access dashboard endpoints like projects, endpoints, and deliveries.
        </p>
        
        <h3 className="text-lg font-semibold text-foreground mb-3">Register</h3>
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

        <h3 className="text-lg font-semibold text-foreground mb-3">Login</h3>
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

        <h3 className="text-lg font-semibold text-foreground mb-3">Using JWT Token</h3>
        <p className="text-muted-foreground mb-4">Include the access token in the Authorization header for all authenticated requests:</p>
        <CodeBlock language="curl" setLanguage={() => {}}>
{`Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`}
        </CodeBlock>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">API Key Authentication (Events API)</h2>
        <p className="text-muted-foreground mb-6">
          Use API keys to send events to the platform. Each project has its own API keys.
        </p>
        
        <h3 className="text-lg font-semibold text-foreground mb-3">Header Format</h3>
        <CodeBlock language="curl" setLanguage={() => {}}>
{`X-API-Key: wh_live_1234567890abcdef`}
        </CodeBlock>
        
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Shield className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-900 text-sm">Security Note</div>
              <div className="text-amber-700 text-sm mt-1">
                Never expose API keys in client-side code or public repositories. Store them securely in environment variables.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GettingStarted({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">Getting Started</h1>
        <p className="text-xl text-muted-foreground">
          Complete workflow from registration to sending your first webhook.
        </p>
      </div>

      <StepSection number="1" title="Register and Login">
        <p className="text-muted-foreground mb-4">Create an account and get your JWT token.</p>
        <HTTPMethod method="POST" path="/api/v1/auth/register" />
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('register', activeLanguage)}
        </CodeBlock>
      </StepSection>

      <StepSection number="2" title="Create a Project">
        <p className="text-muted-foreground mb-4">Projects organize your webhooks, endpoints, and events.</p>
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

      <StepSection number="3" title="Create an API Key">
        <p className="text-muted-foreground mb-4">Generate an API key to send events.</p>
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

      <StepSection number="4" title="Create an Endpoint">
        <p className="text-muted-foreground mb-4">Add a URL where you want to receive webhooks.</p>
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

      <StepSection number="5" title="Create a Subscription">
        <p className="text-muted-foreground mb-4">Subscribe the endpoint to specific event types.</p>
        <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/subscriptions" />
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('createSubscription', activeLanguage)}
        </CodeBlock>
      </StepSection>

      <StepSection number="6" title="Send an Event">
        <p className="text-muted-foreground mb-4">Send your first event using the API key.</p>
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
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">Events API</h1>
        <p className="text-xl text-muted-foreground">
          Send events that will be delivered to subscribed webhook endpoints.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">Send Event</h2>
        <HTTPMethod method="POST" path="/api/v1/events" />
        <p className="text-muted-foreground mb-6">
          Send an event to be delivered to all subscribed endpoints. Events are processed asynchronously and queued for delivery.
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">Headers</h3>
        <ParamTable params={[
          { name: 'X-API-Key', type: 'string', required: true, description: 'API key for authentication' },
          { name: 'Content-Type', type: 'string', required: true, description: 'application/json' },
          { name: 'Idempotency-Key', type: 'string', required: false, description: 'Unique key to prevent duplicate processing' },
        ]} />

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">Request Body</h3>
        <ParamTable params={[
          { name: 'type', type: 'string', required: true, description: 'Event type (e.g., "order.completed")' },
          { name: 'data', type: 'object', required: true, description: 'Event payload data' },
        ]} />

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">Example</h3>
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('sendEvent', activeLanguage)}
        </CodeBlock>

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">Response</h3>
        <ResponseBlock>
{`{
  "eventId": "123e4567-e89b-12d3-a456-426614174000",
  "type": "order.completed",
  "createdAt": "2024-12-16T19:00:00Z",
  "deliveriesCreated": 3
}`}
        </ResponseBlock>

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">Response Fields</h3>
        <ParamTable params={[
          { name: 'eventId', type: 'uuid', required: true, description: 'Unique event identifier' },
          { name: 'type', type: 'string', required: true, description: 'Event type echoed back' },
          { name: 'createdAt', type: 'string', required: true, description: 'ISO 8601 timestamp' },
          { name: 'deliveriesCreated', type: 'integer', required: true, description: 'Number of deliveries created for this event' },
        ]} />

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Zap className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-blue-900 text-sm">Idempotency</div>
              <div className="text-blue-700 text-sm mt-1">
                Use the Idempotency-Key header to safely retry requests. If the same key is sent within 24 hours, the original response will be returned without creating duplicate events.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EndpointsAPI({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">Endpoints API</h1>
        <p className="text-xl text-muted-foreground">
          Manage webhook endpoints where events are delivered.
        </p>
      </div>

      <APIEndpoint
        method="POST"
        path="/api/v1/projects/{projectId}/endpoints"
        title="Create Endpoint"
        description="Add a new webhook endpoint to receive events."
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
        title="List Endpoints"
        description="Get all endpoints for a project."
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
        title="Get Endpoint"
        description="Returns endpoint details by ID."
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
        title="Update Endpoint"
        description="Updates endpoint configuration."
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
        title="Delete Endpoint"
        description="Deletes an endpoint and all its subscriptions."
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="deleteEndpoint"
        response="204 No Content"
      />

      <APIEndpoint
        method="POST"
        path="/api/v1/projects/{projectId}/endpoints/{id}/rotate-secret"
        title="Rotate Secret"
        description="Generate a new webhook secret for an endpoint."
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
        title="Test Endpoint"
        description="Sends a test webhook to verify endpoint connectivity."
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
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">Subscriptions API</h1>
        <p className="text-xl text-muted-foreground">
          Route specific event types to endpoints.
        </p>
      </div>

      <APIEndpoint
        method="POST"
        path="/api/v1/projects/{projectId}/subscriptions"
        title="Create Subscription"
        description="Subscribe an endpoint to event types."
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
        title="List Subscriptions"
        description="Get all subscriptions for a project."
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
        title="Get Subscription"
        description="Returns subscription details."
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
        title="Update Subscription"
        description="Updates subscription configuration."
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
        title="Delete Subscription"
        description="Removes a subscription."
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="deleteSubscription"
        response="204 No Content"
      />
    </div>
  );
}

function DeliveriesAPI({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">Deliveries API</h1>
        <p className="text-xl text-muted-foreground">
          Monitor and manage webhook deliveries.
        </p>
      </div>

      <APIEndpoint
        method="GET"
        path="/api/v1/deliveries/projects/{projectId}"
        title="List Deliveries"
        description="Get all deliveries for a project with filters."
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
        <h3 className="text-lg font-semibold text-foreground mb-3">Query Parameters</h3>
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
        title="Get Delivery"
        description="Returns delivery details by ID."
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
        title="Get Delivery Attempts"
        description="View all retry attempts for a delivery."
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
        title="Replay Delivery"
        description="Manually retry a failed delivery."
        activeLanguage={activeLanguage}
        setActiveLanguage={setActiveLanguage}
        example="replayDelivery"
        response="202 Accepted"
      />

      <APIEndpoint
        method="POST"
        path="/api/v1/deliveries/bulk-replay"
        title="Bulk Replay"
        description="Re-send multiple failed deliveries at once. Filter by status, endpoint, or provide specific delivery IDs."
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
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">Webhook Security</h1>
        <p className="text-xl text-muted-foreground">
          Verify webhook authenticity using HMAC signatures.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">Signature Verification</h2>
        <p className="text-muted-foreground mb-6">
          Every webhook includes an X-Signature header with an HMAC-SHA256 signature.
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">Headers</h3>
        <ParamTable params={[
          { name: 'X-Signature', type: 'string', required: true, description: 'Format: t=timestamp,v1=signature' },
          { name: 'X-Event-Id', type: 'uuid', required: true, description: 'Event identifier' },
          { name: 'X-Delivery-Id', type: 'uuid', required: true, description: 'Delivery identifier' },
          { name: 'X-Timestamp', type: 'integer', required: true, description: 'Unix timestamp in milliseconds' },
        ]} />

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">Verification Examples</h3>
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('verifySignature', activeLanguage)}
        </CodeBlock>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">Endpoint Verification</h2>
        <p className="text-muted-foreground mb-6">
          When you register an endpoint, we send a verification challenge to confirm you own the URL.
        </p>

        <h3 className="text-lg font-semibold text-foreground mb-3">Challenge Request</h3>
        <p className="text-muted-foreground mb-4">We POST a JSON payload with type <code className="bg-muted px-2 py-1 rounded">webhook.verification</code>:</p>
        <ResponseBlock>
{`POST https://your-endpoint.com/webhooks
Content-Type: application/json

{
  "type": "webhook.verification",
  "challenge": "whc_abc123xyz789...",
  "timestamp": "2024-01-15T10:30:00Z"
}`}
        </ResponseBlock>

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">Expected Response</h3>
        <p className="text-muted-foreground mb-4">Return the <code className="bg-muted px-2 py-1 rounded">challenge</code> value in your response:</p>
        <ResponseBlock>
{`HTTP/1.1 200 OK
Content-Type: application/json

{
  "challenge": "whc_abc123xyz789..."
}`}
        </ResponseBlock>

        <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">Implementation Examples</h3>
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('endpointVerification', activeLanguage)}
        </CodeBlock>
      </div>
    </div>
  );
}

function Errors() {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">Errors & Rate Limits</h1>
        <p className="text-xl text-muted-foreground">
          HTTP status codes, error responses, and rate limiting.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">Rate Limiting</h2>
        <p className="text-muted-foreground mb-4">
          The Events API is rate limited to protect the platform. Rate limit information is included in response headers.
        </p>
        <ParamTable params={[
          { name: 'X-RateLimit-Limit', type: 'integer', required: true, description: 'Maximum requests per second' },
          { name: 'X-RateLimit-Remaining', type: 'integer', required: true, description: 'Remaining requests in current window' },
          { name: 'X-RateLimit-Reset', type: 'timestamp', required: true, description: 'Unix timestamp when limit resets' },
          { name: 'Retry-After', type: 'integer', required: true, description: 'Seconds to wait before retrying (only on 429)' },
        ]} />
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="font-semibold text-amber-900 text-sm">Rate Limit Exceeded (429)</div>
          <div className="text-amber-700 text-sm mt-1">
            When rate limited, wait until X-RateLimit-Reset timestamp before retrying.
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">Error Response Format</h2>
        <ResponseBlock>
{`{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Please retry after 60 seconds.",
  "status": 429
}`}
        </ResponseBlock>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">Validation Errors</h2>
        <p className="text-muted-foreground mb-4">
          When request validation fails, you'll receive detailed field-level errors.
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
        <h2 className="text-2xl font-bold text-foreground mb-6">HTTP Status Codes</h2>
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

function SDKs() {
  const [activeLang, setActiveLang] = useState<'node' | 'python' | 'php'>('node');

  const sdks = [
    {
      id: 'node' as const,
      name: 'Node.js / TypeScript',
      pkg: '@webhook-platform/node',
      url: 'https://www.npmjs.com/package/@webhook-platform/node',
      badge: 'npm',
      icon: '🟢',
      install: 'npm install @webhook-platform/node',
      init: `import { WebhookPlatform } from '@webhook-platform/node';

const client = new WebhookPlatform({
  apiKey: 'wh_live_your_api_key',
  baseUrl: 'https://your-api.com/api/v1', // optional
});`,
      sendEvent: `const event = await client.events.send({
  type: 'order.completed',
  data: {
    orderId: 'ord_12345',
    amount: 99.99,
    currency: 'USD',
  },
});

console.log(event.eventId);          // "evt_..."
console.log(event.deliveriesCreated); // 1`,
      verify: `import { verifySignature } from '@webhook-platform/node';

app.post('/webhooks', (req, res) => {
  const isValid = verifySignature({
    payload: req.body.toString(),
    signature: req.headers['x-signature'],
    timestamp: req.headers['x-timestamp'],
    secret: process.env.WEBHOOK_SECRET,
  });

  if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

  const event = JSON.parse(req.body.toString());
  // handle event...
  res.json({ received: true });
});`,
    },
    {
      id: 'python' as const,
      name: 'Python',
      pkg: 'webhook-platform',
      url: 'https://pypi.org/project/webhook-platform/',
      badge: 'PyPI',
      icon: '🐍',
      install: 'pip install webhook-platform',
      init: `from webhook_platform import WebhookPlatform

client = WebhookPlatform(
    api_key="wh_live_your_api_key",
    base_url="https://your-api.com/api/v1",  # optional
)`,
      sendEvent: `event = client.events.send({
    "type": "order.completed",
    "data": {
        "orderId": "ord_12345",
        "amount": 99.99,
        "currency": "USD",
    },
})

print(event["eventId"])           # "evt_..."
print(event["deliveriesCreated"]) # 1`,
      verify: `from webhook_platform import verify_signature

@app.route('/webhooks', methods=['POST'])
def handle_webhook():
    is_valid = verify_signature(
        payload=request.get_data(as_text=True),
        signature=request.headers.get('X-Signature'),
        timestamp=request.headers.get('X-Timestamp'),
        secret=os.environ['WEBHOOK_SECRET'],
    )

    if not is_valid:
        return jsonify({"error": "Invalid signature"}), 401

    event = request.get_json()
    # handle event...
    return jsonify({"received": True})`,
    },
    {
      id: 'php' as const,
      name: 'PHP',
      pkg: 'webhook-platform/php',
      url: 'https://packagist.org/packages/webhook-platform/php',
      badge: 'Packagist',
      icon: '🐘',
      install: 'composer require webhook-platform/php',
      init: `<?php
use WebhookPlatform\\WebhookPlatform;

$client = new WebhookPlatform([
    'apiKey' => 'wh_live_your_api_key',
    'baseUrl' => 'https://your-api.com/api/v1', // optional
]);`,
      sendEvent: `$event = $client->events->send([
    'type' => 'order.completed',
    'data' => [
        'orderId' => 'ord_12345',
        'amount' => 99.99,
        'currency' => 'USD',
    ],
]);

echo $event['eventId'];           // "evt_..."
echo $event['deliveriesCreated']; // 1`,
      verify: `<?php
use WebhookPlatform\\Webhook;

$payload = file_get_contents('php://input');

$isValid = Webhook::verifySignature(
    payload: $payload,
    signature: $_SERVER['HTTP_X_SIGNATURE'] ?? '',
    timestamp: $_SERVER['HTTP_X_TIMESTAMP'] ?? '',
    secret: getenv('WEBHOOK_SECRET'),
);

if (!$isValid) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

$event = json_decode($payload, true);
// handle event...
http_response_code(200);
echo json_encode(['received' => true]);`,
    },
  ];

  const active = sdks.find(s => s.id === activeLang)!;

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">SDKs</h1>
        <p className="text-xl text-muted-foreground">
          Official client libraries for Node.js, Python, and PHP.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {sdks.map(sdk => (
          <button
            key={sdk.id}
            onClick={() => setActiveLang(sdk.id)}
            className={`text-left p-5 rounded-xl border transition-all ${
              activeLang === sdk.id
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                : 'border-border bg-card hover:border-primary/30 hover:shadow-md'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{sdk.icon}</span>
              <span className="text-[10px] px-2 py-0.5 bg-muted rounded-md text-muted-foreground font-mono uppercase">{sdk.badge}</span>
            </div>
            <div className="text-sm font-semibold text-foreground mb-0.5">{sdk.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{sdk.pkg}</div>
          </button>
        ))}
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">Installation</h2>
        <div className="bg-slate-950 rounded-xl overflow-hidden border border-border">
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs text-white/40">terminal</span>
            <a href={active.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              {active.badge} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <pre className="p-4 text-[13px] text-slate-100 font-mono"><span className="text-slate-500">$ </span>{active.install}</pre>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">Initialize the client</h2>
        <div className="bg-slate-950 rounded-xl overflow-hidden border border-border">
          <pre className="p-4 text-[13px] text-slate-100 font-mono overflow-x-auto leading-relaxed"><code>{active.init}</code></pre>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">Send an event</h2>
        <p className="text-muted-foreground mb-4">Use the client to send events. Deliveries are created automatically for all subscribed endpoints.</p>
        <div className="bg-slate-950 rounded-xl overflow-hidden border border-border">
          <pre className="p-4 text-[13px] text-slate-100 font-mono overflow-x-auto leading-relaxed"><code>{active.sendEvent}</code></pre>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-4">Verify webhook signatures</h2>
        <p className="text-muted-foreground mb-4">Every SDK includes a helper to verify HMAC-SHA256 signatures on incoming webhooks.</p>
        <div className="bg-slate-950 rounded-xl overflow-hidden border border-border">
          <pre className="p-4 text-[13px] text-slate-100 font-mono overflow-x-auto leading-relaxed"><code>{active.verify}</code></pre>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">Package links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {sdks.map(sdk => (
            <a key={sdk.id} href={sdk.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-lg transition-all group">
              <span className="text-3xl">{sdk.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{sdk.name}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">{sdk.pkg}</div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
