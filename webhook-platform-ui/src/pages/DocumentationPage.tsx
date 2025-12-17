import { ArrowRight, CheckCircle2, Code, Copy, Book, Key, Zap, Shield, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function DocumentationPage() {
  const [activeSection, setActiveSection] = useState('overview');
  const [activeLanguage, setActiveLanguage] = useState<'curl' | 'node' | 'python'>('curl');

  return (
    <div className="min-h-screen bg-white">
      <div className="flex">
        <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />
        <main className="flex-1 pl-64">
          <div className="max-w-4xl mx-auto px-8 py-12">
            {activeSection === 'overview' && <Overview />}
            {activeSection === 'authentication' && <Authentication activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'getting-started' && <GettingStarted activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'events-api' && <EventsAPI activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'endpoints-api' && <EndpointsAPI activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'subscriptions-api' && <SubscriptionsAPI activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'deliveries-api' && <DeliveriesAPI activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'webhook-security' && <WebhookSecurity activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage} />}
            {activeSection === 'errors' && <Errors />}
          </div>
        </main>
      </div>
    </div>
  );
}

function Sidebar({ activeSection, setActiveSection }: { activeSection: string; setActiveSection: (section: string) => void }) {
  const sections = [
    { id: 'overview', label: 'Overview', icon: Book },
    { id: 'authentication', label: 'Authentication', icon: Key },
    { id: 'getting-started', label: 'Getting Started', icon: Zap },
    { id: 'events-api', label: 'Events API', icon: Code },
    { id: 'endpoints-api', label: 'Endpoints API', icon: Shield },
    { id: 'subscriptions-api', label: 'Subscriptions API', icon: RefreshCw },
    { id: 'deliveries-api', label: 'Deliveries API', icon: CheckCircle2 },
    { id: 'webhook-security', label: 'Webhook Security', icon: Shield },
    { id: 'errors', label: 'Errors', icon: Code },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-gray-200 bg-white overflow-y-auto">
      <div className="p-6">
        <Link to="/" className="flex items-center space-x-2 mb-8">
          <div className="text-xl font-bold text-gray-900">Webhook Platform</div>
        </Link>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">API Documentation</div>
        <nav className="space-y-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSection === section.id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <section.icon className="h-4 w-4" />
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function Overview() {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">API Documentation</h1>
        <p className="text-xl text-gray-600">
          Complete reference for integrating webhook delivery into your application.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">What is Webhook Platform?</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          Webhook Platform is a reliable webhook delivery service that handles event routing, retries, and monitoring for your application.
        </p>
        <p className="text-gray-600 leading-relaxed">
          Send events via our API, and we'll deliver them to your configured endpoints with automatic retries, signatures, and full visibility.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Core Concepts</h2>
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

      <div className="bg-gray-50 rounded-xl p-8 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Event Flow</h3>
        <div className="flex items-center justify-between text-sm">
          <div className="text-center">
            <div className="w-16 h-16 rounded-lg bg-gray-900 text-white flex items-center justify-center mb-2 mx-auto">
              <Code className="h-8 w-8" />
            </div>
            <div className="font-medium text-gray-900">Your system</div>
          </div>
          <ArrowRight className="h-6 w-6 text-gray-400" />
          <div className="text-center">
            <div className="w-16 h-16 rounded-lg bg-gray-900 text-white flex items-center justify-center mb-2 mx-auto">
              <Zap className="h-8 w-8" />
            </div>
            <div className="font-medium text-gray-900">Events API</div>
          </div>
          <ArrowRight className="h-6 w-6 text-gray-400" />
          <div className="text-center">
            <div className="w-16 h-16 rounded-lg bg-gray-900 text-white flex items-center justify-center mb-2 mx-auto">
              <RefreshCw className="h-8 w-8" />
            </div>
            <div className="font-medium text-gray-900">Delivery engine</div>
          </div>
          <ArrowRight className="h-6 w-6 text-gray-400" />
          <div className="text-center">
            <div className="w-16 h-16 rounded-lg bg-gray-900 text-white flex items-center justify-center mb-2 mx-auto">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="font-medium text-gray-900">Customer endpoint</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConceptCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-l-4 border-gray-900 pl-4">
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}

function Authentication({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Authentication</h1>
        <p className="text-xl text-gray-600">
          Two authentication methods: JWT for dashboard access and API keys for event ingestion.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">JWT Authentication (Dashboard API)</h2>
        <p className="text-gray-600 mb-6">
          Use JWT tokens to access dashboard endpoints like projects, endpoints, and deliveries.
        </p>
        
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Register</h3>
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

        <h3 className="text-lg font-semibold text-gray-900 mb-3">Login</h3>
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

        <h3 className="text-lg font-semibold text-gray-900 mb-3">Using JWT Token</h3>
        <p className="text-gray-600 mb-4">Include the access token in the Authorization header for all authenticated requests:</p>
        <CodeBlock language="curl" setLanguage={() => {}}>
{`Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`}
        </CodeBlock>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">API Key Authentication (Events API)</h2>
        <p className="text-gray-600 mb-6">
          Use API keys to send events to the platform. Each project has its own API keys.
        </p>
        
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Header Format</h3>
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
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Getting Started</h1>
        <p className="text-xl text-gray-600">
          Complete workflow from registration to sending your first webhook.
        </p>
      </div>

      <StepSection number="1" title="Register and Login">
        <p className="text-gray-600 mb-4">Create an account and get your JWT token.</p>
        <HTTPMethod method="POST" path="/api/v1/auth/register" />
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('register', activeLanguage)}
        </CodeBlock>
      </StepSection>

      <StepSection number="2" title="Create a Project">
        <p className="text-gray-600 mb-4">Projects organize your webhooks, endpoints, and events.</p>
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
        <p className="text-gray-600 mb-4">Generate an API key to send events.</p>
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
        <p className="text-gray-600 mb-4">Add a URL where you want to receive webhooks.</p>
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
        <p className="text-gray-600 mb-4">Subscribe the endpoint to specific event types.</p>
        <HTTPMethod method="POST" path="/api/v1/projects/{projectId}/subscriptions" />
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('createSubscription', activeLanguage)}
        </CodeBlock>
      </StepSection>

      <StepSection number="6" title="Send an Event">
        <p className="text-gray-600 mb-4">Send your first event using the API key.</p>
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
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Events API</h1>
        <p className="text-xl text-gray-600">
          Send events that will be delivered to subscribed webhook endpoints.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Send Event</h2>
        <HTTPMethod method="POST" path="/api/v1/events" />
        <p className="text-gray-600 mb-6">
          Send an event to be delivered to all subscribed endpoints. Events are processed asynchronously and queued for delivery.
        </p>

        <h3 className="text-lg font-semibold text-gray-900 mb-3">Headers</h3>
        <ParamTable params={[
          { name: 'X-API-Key', type: 'string', required: true, description: 'API key for authentication' },
          { name: 'Content-Type', type: 'string', required: true, description: 'application/json' },
          { name: 'Idempotency-Key', type: 'string', required: false, description: 'Unique key to prevent duplicate processing' },
        ]} />

        <h3 className="text-lg font-semibold text-gray-900 mb-3 mt-6">Request Body</h3>
        <ParamTable params={[
          { name: 'type', type: 'string', required: true, description: 'Event type (e.g., "order.completed")' },
          { name: 'data', type: 'object', required: true, description: 'Event payload data' },
        ]} />

        <h3 className="text-lg font-semibold text-gray-900 mb-3 mt-6">Example</h3>
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('sendEvent', activeLanguage)}
        </CodeBlock>

        <h3 className="text-lg font-semibold text-gray-900 mb-3 mt-6">Response</h3>
        <ResponseBlock>
{`{
  "eventId": "123e4567-e89b-12d3-a456-426614174000",
  "type": "order.completed",
  "createdAt": "2024-12-16T19:00:00Z",
  "deliveriesCreated": 3
}`}
        </ResponseBlock>

        <h3 className="text-lg font-semibold text-gray-900 mb-3 mt-6">Response Fields</h3>
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
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Endpoints API</h1>
        <p className="text-xl text-gray-600">
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
    </div>
  );
}

function SubscriptionsAPI({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Subscriptions API</h1>
        <p className="text-xl text-gray-600">
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
  "eventTypes": ["order.completed", "order.cancelled"],
  "enabled": true,
  "createdAt": "2024-12-16T19:00:00Z"
}`}
      />
    </div>
  );
}

function DeliveriesAPI({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Deliveries API</h1>
        <p className="text-xl text-gray-600">
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
    </div>
  );
}

function WebhookSecurity({ activeLanguage, setActiveLanguage }: LanguageTabsProps) {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Webhook Security</h1>
        <p className="text-xl text-gray-600">
          Verify webhook authenticity using HMAC signatures.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Signature Verification</h2>
        <p className="text-gray-600 mb-6">
          Every webhook includes an X-Signature header with an HMAC-SHA256 signature.
        </p>

        <h3 className="text-lg font-semibold text-gray-900 mb-3">Headers</h3>
        <ParamTable params={[
          { name: 'X-Signature', type: 'string', required: true, description: 'Format: t=timestamp,v1=signature' },
          { name: 'X-Event-Id', type: 'uuid', required: true, description: 'Event identifier' },
          { name: 'X-Delivery-Id', type: 'uuid', required: true, description: 'Delivery identifier' },
          { name: 'X-Timestamp', type: 'integer', required: true, description: 'Unix timestamp in milliseconds' },
        ]} />

        <h3 className="text-lg font-semibold text-gray-900 mb-3 mt-6">Verification Examples</h3>
        <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
          {getCodeExample('verifySignature', activeLanguage)}
        </CodeBlock>
      </div>
    </div>
  );
}

function Errors() {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Errors</h1>
        <p className="text-xl text-gray-600">
          HTTP status codes and error responses.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Error Response Format</h2>
        <ResponseBlock>
{`{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Please retry after 60 seconds.",
  "status": 429
}`}
        </ResponseBlock>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">HTTP Status Codes</h2>
        <div className="space-y-4">
          <ErrorCode code="200" title="OK" description="Request succeeded" />
          <ErrorCode code="201" title="Created" description="Resource created successfully" />
          <ErrorCode code="202" title="Accepted" description="Request accepted for processing" />
          <ErrorCode code="400" title="Bad Request" description="Invalid request format or parameters" />
          <ErrorCode code="401" title="Unauthorized" description="Invalid or missing authentication" />
          <ErrorCode code="403" title="Forbidden" description="Insufficient permissions" />
          <ErrorCode code="404" title="Not Found" description="Resource not found" />
          <ErrorCode code="429" title="Too Many Requests" description="Rate limit exceeded" />
          <ErrorCode code="500" title="Internal Server Error" description="Server error" />
          <ErrorCode code="503" title="Service Unavailable" description="Service temporarily unavailable" />
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
    GET: 'bg-blue-100 text-blue-800',
    POST: 'bg-green-100 text-green-800',
    PUT: 'bg-amber-100 text-amber-800',
    DELETE: 'bg-red-100 text-red-800',
  };

  return (
    <div className="flex items-center space-x-3 mb-4">
      <span className={`px-3 py-1 rounded-md text-xs font-semibold ${methodColors[method]}`}>
        {method}
      </span>
      <code className="text-sm font-mono text-gray-900">{path}</code>
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
      <div className="flex items-center justify-between mb-2">
        <div className="flex space-x-2">
          {(['curl', 'node', 'python'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                language === lang
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {lang === 'curl' ? 'cURL' : lang === 'node' ? 'Node.js' : 'Python'}
            </button>
          ))}
        </div>
        <button
          onClick={handleCopy}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
        <code className="text-sm">{children}</code>
      </pre>
    </div>
  );
}

function ResponseBlock({ children }: { children: string }) {
  return (
    <div className="my-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Response</div>
      <pre className="bg-gray-50 border border-gray-200 text-gray-900 p-4 rounded-lg overflow-x-auto">
        <code className="text-sm">{children}</code>
      </pre>
    </div>
  );
}

function ParamTable({ params }: { params: Array<{ name: string; type: string; required: boolean; description: string }> }) {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Parameter</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Required</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Description</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {params.map((param, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-mono text-gray-900">{param.name}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{param.type}</td>
              <td className="px-4 py-3 text-sm">
                {param.required ? (
                  <span className="text-xs font-medium text-red-600">Required</span>
                ) : (
                  <span className="text-xs font-medium text-gray-400">Optional</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{param.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StepSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-4 border-gray-900 pl-6">
      <div className="flex items-center space-x-3 mb-4">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold">
          {number}
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
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
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{title}</h2>
      <HTTPMethod method={method} path={path} />
      <p className="text-gray-600 mb-6">{description}</p>
      <CodeBlock language={activeLanguage} setLanguage={setActiveLanguage}>
        {getCodeExample(example, activeLanguage)}
      </CodeBlock>
      <ResponseBlock>{response}</ResponseBlock>
    </div>
  );
}

function ErrorCode({ code, title, description }: { code: string; title: string; description: string }) {
  return (
    <div className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <code className="flex-shrink-0 px-3 py-1 bg-gray-900 text-white text-sm font-mono rounded">{code}</code>
      <div>
        <div className="font-semibold text-gray-900">{title}</div>
        <div className="text-sm text-gray-600">{description}</div>
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
    "eventTypes": ["order.completed", "order.cancelled"],
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
    eventTypes: ['order.completed', 'order.cancelled'],
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
        'eventTypes': ['order.completed', 'order.cancelled'],
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
  };

  return examples[type]?.[language] || `// Example not available for ${language}`;
}
