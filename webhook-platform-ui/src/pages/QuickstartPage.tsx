import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Copy, ArrowRight, RefreshCw, Shield, Clock, Zap, Moon, Sun, Webhook, Code, ExternalLink, Lock, Eye, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth.store';
import { getTheme, setTheme } from '../lib/theme';

export default function QuickstartPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 to-background">
      <Navigation />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <Header />
        <ProgressTimeline />
        <div className="space-y-20 mt-16">
          <Step1_CreateProject />
          <Step2_InstallSDK />
          <Step3_CreateEndpoint />
          <Step4_Subscribe />
          <Step5_SendEvent />
          <Step6_VerifySignature />
          <Step7_MonitorAndReplay />
        </div>
        <SDKSection />
        <FinalCTA />
      </div>
    </div>
  );
}

function ThemeToggle() {
  const [, setToggle] = useState(false);
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTheme(getTheme() === 'dark' ? 'light' : 'dark'); setToggle(p => !p); }}
      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      title="Toggle theme"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function Navigation() {
  const { isAuthenticated } = useAuth();
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Webhook className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">Hookflow</span>
          </Link>
          <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Docs</Link>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {isAuthenticated ? (
            <Link to="/admin/projects" className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-all">
              Dashboard <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
              <Link to="/register" className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-all">
                Get started <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function Header() {
  return (
    <div className="mb-12">
      <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to home
      </Link>
      <div className="text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full mb-4">
          <Zap className="h-3 w-3 mr-1.5" /> 5-minute quickstart
        </div>
        <h1 className="text-5xl font-bold text-foreground mb-4 tracking-tight">
          From zero to first webhook
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          Complete walkthrough: create a project, install an SDK, configure endpoints, send events, verify signatures, and monitor deliveries.
        </p>
      </div>
    </div>
  );
}

function ProgressTimeline() {
  const steps = [
    { num: 1, label: 'Project' },
    { num: 2, label: 'SDK' },
    { num: 3, label: 'Endpoint' },
    { num: 4, label: 'Subscribe' },
    { num: 5, label: 'Send' },
    { num: 6, label: 'Verify' },
    { num: 7, label: 'Monitor' },
  ];
  return (
    <div className="flex items-center justify-center gap-1 overflow-x-auto pb-2">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{s.num}</div>
            <span className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className="w-8 lg:w-12 h-px bg-border mx-1 mt-[-10px]" />}
        </div>
      ))}
    </div>
  );
}

/* ─── Shared components ─── */

function StepBadge({ step, total = 7 }: { step: number; total?: number }) {
  return (
    <div className="inline-flex items-center px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full mb-4">
      Step {step} of {total}
    </div>
  );
}

function CodeBlock({ title, children, lang }: { title?: string; children: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden border border-border shadow-lg">
      {title && (
        <div className="bg-slate-900 px-4 py-2 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
            </div>
            <span className="text-xs text-white/40 ml-2">{title}</span>
          </div>
          {lang && <span className="text-[10px] text-white/30 uppercase">{lang}</span>}
        </div>
      )}
      <div className="relative bg-slate-950">
        <pre className="p-4 text-[13px] text-slate-100 overflow-x-auto leading-relaxed font-mono"><code>{children}</code></pre>
        <button
          onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="absolute top-2.5 right-2.5 px-2 py-1 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 text-xs rounded transition-colors"
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function LanguageTabs({ active, onChange }: { active: string; onChange: (v: string) => void }) {
  const tabs = [
    { id: 'node', label: 'Node.js' },
    { id: 'python', label: 'Python' },
    { id: 'php', label: 'PHP' },
    { id: 'curl', label: 'cURL' },
  ];
  return (
    <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit mb-4">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${active === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Step 1 ─── */

function Step1_CreateProject() {
  return (
    <section id="step-1">
      <StepBadge step={1} />
      <h2 className="text-3xl font-bold text-foreground mb-3">Create a project</h2>
      <p className="text-lg text-muted-foreground mb-6 max-w-2xl">
        A project organizes your webhooks, endpoints, API keys, and events. Sign up and create your first project from the dashboard, or use the API:
      </p>
      <CodeBlock title="terminal" lang="bash">{`# Register & login
curl -X POST https://your-api.com/api/v1/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"email": "dev@company.com", "password": "securePass123!", "name": "Dev Team"}'

# Create project (use the accessToken from login response)
curl -X POST https://your-api.com/api/v1/projects \\
  -H "Authorization: Bearer <accessToken>" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Production Webhooks"}'`}</CodeBlock>
      <div className="mt-6 bg-card rounded-xl border border-border p-5">
        <div className="text-sm font-medium text-foreground mb-2">Response</div>
        <pre className="text-sm text-muted-foreground font-mono">{`{
  "id": "proj_a1b2c3d4-...",
  "name": "Production Webhooks",
  "organizationId": "org_x1y2z3...",
  "createdAt": "2025-02-19T12:00:00Z"
}`}</pre>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-green-600" /> Retries enabled by default</div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-green-600" /> HMAC signatures configured</div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-green-600" /> Rate limiting built-in</div>
      </div>
    </section>
  );
}

/* ─── Step 2 ─── */

function Step2_InstallSDK() {
  const [lang, setLang] = useState('node');
  const installs: Record<string, string> = {
    node: 'npm install @webhook-platform/node',
    python: 'pip install webhook-platform',
    php: 'composer require webhook-platform/php',
    curl: '# No installation needed — use cURL directly',
  };
  const inits: Record<string, string> = {
    node: `import { WebhookPlatform } from '@webhook-platform/node';

const client = new WebhookPlatform({
  apiKey: 'wh_live_your_api_key',
  // Optional: custom base URL
  // baseUrl: 'https://your-api.com/api/v1'
});`,
    python: `from webhook_platform import WebhookPlatform

client = WebhookPlatform(
    api_key="wh_live_your_api_key",
    # Optional: custom base URL
    # base_url="https://your-api.com/api/v1"
)`,
    php: `<?php
use WebhookPlatform\\WebhookPlatform;

$client = new WebhookPlatform([
    'apiKey' => 'wh_live_your_api_key',
    // Optional: custom base URL
    // 'baseUrl' => 'https://your-api.com/api/v1'
]);`,
    curl: `# Set your API key as an environment variable
export WEBHOOK_API_KEY="wh_live_your_api_key"
export WEBHOOK_BASE_URL="https://your-api.com/api/v1"`,
  };

  return (
    <section id="step-2">
      <StepBadge step={2} />
      <h2 className="text-3xl font-bold text-foreground mb-3">Install an SDK</h2>
      <p className="text-lg text-muted-foreground mb-6 max-w-2xl">
        Official SDKs for Node.js, Python, and PHP. Or use the REST API directly with cURL or any HTTP client.
      </p>
      <LanguageTabs active={lang} onChange={setLang} />
      <div className="space-y-4">
        <CodeBlock title="Install" lang={lang}>{installs[lang]}</CodeBlock>
        <CodeBlock title="Initialize" lang={lang}>{inits[lang]}</CodeBlock>
      </div>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { name: 'Node.js', pkg: '@webhook-platform/node', url: 'https://www.npmjs.com/package/@webhook-platform/node', logo: '/logos/nodejs.svg' },
          { name: 'Python', pkg: 'webhook-platform', url: 'https://pypi.org/project/webhook-platform/', logo: '/logos/python.svg' },
          { name: 'PHP', pkg: 'webhook-platform/php', url: 'https://packagist.org/packages/webhook-platform/php', logo: '/logos/php.svg' },
        ].map(sdk => (
          <a key={sdk.name} href={sdk.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all group">
            <img src={sdk.logo} alt={sdk.name} className="h-7 w-7" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{sdk.name}</div>
              <div className="text-xs text-muted-foreground truncate font-mono">{sdk.pkg}</div>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
          </a>
        ))}
      </div>
    </section>
  );
}

/* ─── Step 3 ─── */

function Step3_CreateEndpoint() {
  const [lang, setLang] = useState('node');
  const examples: Record<string, string> = {
    node: `const endpoint = await client.endpoints.create('proj_a1b2c3d4', {
  url: 'https://api.customer.com/webhooks',
  description: 'Production webhook receiver',
});

console.log(endpoint.id);     // "ep_x1y2z3..."
console.log(endpoint.secret); // "whsec_..." — save this for verification`,
    python: `endpoint = client.endpoints.create("proj_a1b2c3d4", {
    "url": "https://api.customer.com/webhooks",
    "description": "Production webhook receiver",
})

print(endpoint["id"])      # "ep_x1y2z3..."
print(endpoint["secret"])  # "whsec_..." — save this for verification`,
    php: `$endpoint = $client->endpoints->create('proj_a1b2c3d4', [
    'url' => 'https://api.customer.com/webhooks',
    'description' => 'Production webhook receiver',
]);

echo $endpoint['id'];      // "ep_x1y2z3..."
echo $endpoint['secret'];  // "whsec_..." — save this for verification`,
    curl: `curl -X POST https://your-api.com/api/v1/projects/proj_a1b2c3d4/endpoints \\
  -H "Authorization: Bearer <accessToken>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://api.customer.com/webhooks",
    "description": "Production webhook receiver"
  }'`,
  };

  return (
    <section id="step-3">
      <StepBadge step={3} />
      <h2 className="text-3xl font-bold text-foreground mb-3">Create a webhook endpoint</h2>
      <p className="text-lg text-muted-foreground mb-6 max-w-2xl">
        Register the URL where you want to receive webhooks. Each endpoint gets a unique signing secret for HMAC verification.
      </p>
      <LanguageTabs active={lang} onChange={setLang} />
      <CodeBlock title="Create endpoint" lang={lang}>{examples[lang]}</CodeBlock>
      <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-sm text-foreground">Save the endpoint secret</div>
            <div className="text-sm text-muted-foreground mt-1">The <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">secret</code> is shown only once. Store it securely — you'll need it to verify webhook signatures in Step 6.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Step 4 ─── */

function Step4_Subscribe() {
  const [lang, setLang] = useState('node');
  const examples: Record<string, string> = {
    node: `// Subscribe endpoint to specific event types
const subscription = await client.subscriptions.create('proj_a1b2c3d4', {
  endpointId: 'ep_x1y2z3',
  eventTypes: ['order.completed', 'order.refunded', 'payment.failed'],
});

console.log(subscription.id); // "sub_..."`,
    python: `# Subscribe endpoint to specific event types
subscription = client.subscriptions.create("proj_a1b2c3d4", {
    "endpointId": "ep_x1y2z3",
    "eventTypes": ["order.completed", "order.refunded", "payment.failed"],
})

print(subscription["id"])  # "sub_..."`,
    php: `// Subscribe endpoint to specific event types
$subscription = $client->subscriptions->create('proj_a1b2c3d4', [
    'endpointId' => 'ep_x1y2z3',
    'eventTypes' => ['order.completed', 'order.refunded', 'payment.failed'],
]);

echo $subscription['id'];  // "sub_..."`,
    curl: `curl -X POST https://your-api.com/api/v1/projects/proj_a1b2c3d4/subscriptions \\
  -H "Authorization: Bearer <accessToken>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "endpointId": "ep_x1y2z3",
    "eventTypes": ["order.completed", "order.refunded", "payment.failed"]
  }'`,
  };

  return (
    <section id="step-4">
      <StepBadge step={4} />
      <h2 className="text-3xl font-bold text-foreground mb-3">Subscribe to event types</h2>
      <p className="text-lg text-muted-foreground mb-6 max-w-2xl">
        Link your endpoint to specific event types. Only matching events will be delivered — no noise, no filtering on your side.
      </p>
      <LanguageTabs active={lang} onChange={setLang} />
      <CodeBlock title="Create subscription" lang={lang}>{examples[lang]}</CodeBlock>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {['order.completed', 'payment.failed', 'user.created'].map(evt => (
          <div key={evt} className="flex items-center gap-2 p-3 bg-card rounded-lg border border-border">
            <Code className="h-4 w-4 text-primary" />
            <code className="text-sm font-mono text-foreground">{evt}</code>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground mt-3">You define the event types. Use dot notation for namespacing (e.g. <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">resource.action</code>).</p>
    </section>
  );
}

/* ─── Step 5 ─── */

function Step5_SendEvent() {
  const [lang, setLang] = useState('node');
  const examples: Record<string, string> = {
    node: `// Send an event — uses API key, not JWT
const event = await client.events.send({
  type: 'order.completed',
  data: {
    orderId: 'ord_12345',
    customerId: 'cust_67890',
    amount: 99.99,
    currency: 'USD',
    items: [
      { name: 'Pro Plan', quantity: 1, price: 99.99 }
    ]
  }
});

console.log(event.eventId);          // "evt_..."
console.log(event.deliveriesCreated); // 1`,
    python: `# Send an event — uses API key, not JWT
event = client.events.send({
    "type": "order.completed",
    "data": {
        "orderId": "ord_12345",
        "customerId": "cust_67890",
        "amount": 99.99,
        "currency": "USD",
        "items": [
            {"name": "Pro Plan", "quantity": 1, "price": 99.99}
        ]
    }
})

print(event["eventId"])           # "evt_..."
print(event["deliveriesCreated"]) # 1`,
    php: `// Send an event — uses API key, not JWT
$event = $client->events->send([
    'type' => 'order.completed',
    'data' => [
        'orderId' => 'ord_12345',
        'customerId' => 'cust_67890',
        'amount' => 99.99,
        'currency' => 'USD',
        'items' => [
            ['name' => 'Pro Plan', 'quantity' => 1, 'price' => 99.99]
        ]
    ]
]);

echo $event['eventId'];           // "evt_..."
echo $event['deliveriesCreated']; // 1`,
    curl: `curl -X POST https://your-api.com/api/v1/events \\
  -H "X-API-Key: wh_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: ord_12345_completed" \\
  -d '{
    "type": "order.completed",
    "data": {
      "orderId": "ord_12345",
      "customerId": "cust_67890",
      "amount": 99.99,
      "currency": "USD",
      "items": [{"name": "Pro Plan", "quantity": 1, "price": 99.99}]
    }
  }'`,
  };

  return (
    <section id="step-5">
      <StepBadge step={5} />
      <h2 className="text-3xl font-bold text-foreground mb-3">Send your first event</h2>
      <p className="text-lg text-muted-foreground mb-6 max-w-2xl">
        Events are sent using your <strong>API key</strong> (not JWT). The platform routes them to all subscribed endpoints automatically.
      </p>
      <LanguageTabs active={lang} onChange={setLang} />
      <CodeBlock title="Send event" lang={lang}>{examples[lang]}</CodeBlock>
      <div className="mt-6 bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <span className="text-sm font-medium text-foreground">What happens next</span>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { icon: Zap, title: 'Event received', desc: 'Platform accepts the event' },
            { icon: Code, title: 'Matched', desc: 'Finds subscribed endpoints' },
            { icon: ArrowRight, title: 'Delivered', desc: 'POST to your endpoint URL' },
            { icon: CheckCircle2, title: 'Confirmed', desc: 'HTTP 2xx = success' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex flex-col items-center text-center p-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="text-sm font-semibold text-foreground">{title}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Step 6 ─── */

function Step6_VerifySignature() {
  const [lang, setLang] = useState('node');
  const examples: Record<string, string> = {
    node: `import { verifySignature } from '@webhook-platform/node';
import express from 'express';

const app = express();
app.use(express.raw({ type: 'application/json' }));

app.post('/webhooks', (req, res) => {
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];
  const body = req.body.toString();

  const isValid = verifySignature({
    payload: body,
    signature,
    timestamp,
    secret: process.env.WEBHOOK_SECRET,  // whsec_...
  });

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(body);
  console.log('Received:', event.type, event.data);

  // Process the event
  switch (event.type) {
    case 'order.completed':
      // handle order completion
      break;
    case 'payment.failed':
      // handle payment failure
      break;
  }

  res.status(200).json({ received: true });
});`,
    python: `from webhook_platform import verify_signature
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/webhooks', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-Signature')
    timestamp = request.headers.get('X-Timestamp')
    body = request.get_data(as_text=True)

    is_valid = verify_signature(
        payload=body,
        signature=signature,
        timestamp=timestamp,
        secret=os.environ['WEBHOOK_SECRET'],  # whsec_...
    )

    if not is_valid:
        return jsonify({"error": "Invalid signature"}), 401

    event = request.get_json()
    print(f"Received: {event['type']}")

    # Process the event
    if event['type'] == 'order.completed':
        # handle order completion
        pass
    elif event['type'] == 'payment.failed':
        # handle payment failure
        pass

    return jsonify({"received": True}), 200`,
    php: `<?php
use WebhookPlatform\\Webhook;

// Get the raw payload
$payload = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
$timestamp = $_SERVER['HTTP_X_TIMESTAMP'] ?? '';

$isValid = Webhook::verifySignature(
    payload: $payload,
    signature: $signature,
    timestamp: $timestamp,
    secret: getenv('WEBHOOK_SECRET'),  // whsec_...
);

if (!$isValid) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

$event = json_decode($payload, true);
error_log("Received: " . $event['type']);

// Process the event
switch ($event['type']) {
    case 'order.completed':
        // handle order completion
        break;
    case 'payment.failed':
        // handle payment failure
        break;
}

http_response_code(200);
echo json_encode(['received' => true]);`,
    curl: `# Signature format in the X-Signature header:
# t=1708358400,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
#
# To verify manually:
# 1. Extract timestamp (t) and signature (v1)
# 2. Concatenate: timestamp + "." + raw_body
# 3. Compute HMAC-SHA256 with your endpoint secret
# 4. Compare with the v1 value

echo -n "1708358400.{\\"type\\":\\"order.completed\\",\\"data\\":{}}" \\
  | openssl dgst -sha256 -hmac "whsec_your_secret"`,
  };

  return (
    <section id="step-6">
      <StepBadge step={6} />
      <h2 className="text-3xl font-bold text-foreground mb-3">Verify webhook signatures</h2>
      <p className="text-lg text-muted-foreground mb-6 max-w-2xl">
        Every webhook includes an <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">X-Signature</code> header. Always verify it to ensure the request came from Hookflow, not a third party.
      </p>
      <LanguageTabs active={lang} onChange={setLang} />
      <CodeBlock title="Verify & handle webhook" lang={lang}>{examples[lang]}</CodeBlock>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Lock, title: 'HMAC-SHA256', desc: 'Industry-standard signing' },
          { icon: Clock, title: 'Timestamp check', desc: 'Prevents replay attacks' },
          { icon: Shield, title: 'Per-endpoint secrets', desc: 'Unique secret per URL' },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-start gap-3 p-4 bg-card rounded-xl border border-border">
            <Icon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-foreground">{title}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Step 7 ─── */

function Step7_MonitorAndReplay() {
  return (
    <section id="step-7">
      <StepBadge step={7} />
      <h2 className="text-3xl font-bold text-foreground mb-3">Monitor deliveries & replay failures</h2>
      <p className="text-lg text-muted-foreground mb-6 max-w-2xl">
        Every delivery is tracked with full attempt history. If something fails, replay it with one click — no code changes required.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border overflow-hidden shadow-lg">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Recent Deliveries</span>
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
          <div className="divide-y divide-border">
            {[
              { event: 'order.completed', endpoint: 'api.customer.com', status: 'success', code: 200, time: '2s ago' },
              { event: 'payment.failed', endpoint: 'notify.stripe.com', status: 'retrying', code: 503, time: '15s ago' },
              { event: 'user.created', endpoint: 'api.partner.com', status: 'success', code: 200, time: '1m ago' },
              { event: 'subscription.canceled', endpoint: 'hooks.internal.io', status: 'failed', code: 500, time: '3m ago' },
            ].map((d, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground font-mono">{d.event}</div>
                  <div className="text-xs text-muted-foreground">{d.endpoint}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono ${d.status === 'success' ? 'text-green-600' : d.status === 'retrying' ? 'text-amber-600' : 'text-red-600'}`}>{d.code}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    d.status === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : d.status === 'retrying' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>{d.status === 'success' ? 'Delivered' : d.status === 'retrying' ? 'Retrying' : 'Failed'}</span>
                  <span className="text-xs text-muted-foreground">{d.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-5 shadow-lg">
            <div className="flex items-start gap-3 mb-4">
              <Eye className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-foreground">Full visibility</div>
                <div className="text-sm text-muted-foreground">See HTTP status, response body, headers, latency, and error messages for every attempt.</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 shadow-lg">
            <div className="flex items-start gap-3 mb-4">
              <RotateCcw className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-foreground">One-click replay</div>
                <div className="text-sm text-muted-foreground">Replay any failed delivery from the dashboard. Same payload, same endpoint — no code changes.</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 shadow-lg">
            <div className="flex items-start gap-3 mb-4">
              <RefreshCw className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-foreground">Automatic retries</div>
                <div className="text-sm text-muted-foreground">Failed deliveries retry automatically with exponential backoff: 30s → 2m → 15m → 1h → 6h. Up to 5 attempts.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── SDK Section ─── */

function SDKSection() {
  return (
    <section className="mt-20 mb-8">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-foreground mb-3">Official SDKs</h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          First-class SDKs with type safety, automatic retries, and signature verification built-in.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            name: 'Node.js / TypeScript',
            pkg: '@webhook-platform/node',
            url: 'https://www.npmjs.com/package/@webhook-platform/node',
            logo: '/logos/nodejs.svg',
            install: 'npm install @webhook-platform/node',
            badge: 'npm',
          },
          {
            name: 'Python',
            pkg: 'webhook-platform',
            url: 'https://pypi.org/project/webhook-platform/',
            logo: '/logos/python.svg',
            install: 'pip install webhook-platform',
            badge: 'PyPI',
          },
          {
            name: 'PHP',
            pkg: 'webhook-platform/php',
            url: 'https://packagist.org/packages/webhook-platform/php',
            logo: '/logos/php.svg',
            install: 'composer require webhook-platform/php',
            badge: 'Packagist',
          },
        ].map(sdk => (
          <a key={sdk.name} href={sdk.url} target="_blank" rel="noopener noreferrer"
            className="block bg-card rounded-xl border border-border p-6 hover:border-primary/30 hover:shadow-xl transition-all group">
            <div className="flex items-center justify-between mb-4">
              <img src={sdk.logo} alt={sdk.name} className="h-9 w-9" />
              <span className="text-xs px-2 py-1 bg-muted rounded-md text-muted-foreground font-mono">{sdk.badge}</span>
            </div>
            <div className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-1">{sdk.name}</div>
            <div className="text-sm text-muted-foreground font-mono mb-4">{sdk.pkg}</div>
            <div className="bg-slate-950 rounded-lg px-4 py-2.5 font-mono text-xs text-slate-300">
              <span className="text-slate-500">$</span> {sdk.install}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-primary mt-4 font-medium">
              View on {sdk.badge} <ExternalLink className="h-3 w-3" />
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ─── Final CTA ─── */

function FinalCTA() {
  return (
    <section className="mt-16 text-center">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-12 lg:p-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djZoLTZWMzRoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAgLTEydjZoLTZ2LTZoNnptLTI0IDI0djZIMnYtNmg2em0wLTMwdjZIMlY0aDZ6bTAgMjR2Nkgydi02aDZ6bTAtMTJ2Nkgydi02aDZ6bTEyIDEydjZoLTZ2LTZoNnptMC0zMHY2aC02VjRoNnptMCAyNHY2aC02di02aDZ6bTAtMTJ2NmgtNnYtNmg2eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative z-10">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">You're all set 🚀</h2>
          <p className="text-lg text-slate-300 mb-10 max-w-2xl mx-auto">
            Your webhook infrastructure is ready. Explore the dashboard, check delivery logs, and invite your team.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/admin/dashboard" className="inline-flex items-center px-8 py-4 bg-white text-slate-900 text-base font-semibold rounded-lg hover:bg-slate-100 transition-all hover:scale-105 shadow-xl">
              Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link to="/docs" className="inline-flex items-center px-8 py-4 border-2 border-white/20 text-white text-base font-semibold rounded-lg hover:bg-white/10 transition-colors">
              Read full docs
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
