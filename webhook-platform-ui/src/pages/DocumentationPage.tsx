import { BookOpen, Code, Key, Webhook, Send, Shield, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export default function DocumentationPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="text-muted-foreground mt-1">
          Learn how to integrate webhooks into your application
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <CardTitle>Quick Start</CardTitle>
            </div>
            <CardDescription>Get started with webhooks in minutes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">1. Create a Project</h3>
              <p className="text-sm text-muted-foreground">
                Navigate to Projects and create a new project to organize your webhooks.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">2. Generate API Key</h3>
              <p className="text-sm text-muted-foreground">
                Go to your project's API Keys section and create a new key for authentication.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">3. Configure Endpoint</h3>
              <p className="text-sm text-muted-foreground">
                Add a webhook endpoint URL where you want to receive events.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">4. Create Subscription</h3>
              <p className="text-sm text-muted-foreground">
                Subscribe your endpoint to specific event types.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              <CardTitle>Sending Events</CardTitle>
            </div>
            <CardDescription>How to send webhook events to your endpoints</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Using cURL</h3>
                <div className="bg-muted p-4 rounded-lg">
                  <pre className="text-xs font-mono overflow-x-auto">
{`curl -X POST https://your-domain.com/api/v1/events \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: unique-request-id" \\
  -d '{
    "type": "user.created",
    "data": {
      "userId": "user123",
      "email": "user@example.com",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  }'`}
                  </pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              <CardTitle>Receiving Webhooks</CardTitle>
            </div>
            <CardDescription>What your endpoint will receive</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Request Headers</h3>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• <code className="text-xs bg-muted px-1 py-0.5 rounded">X-Signature</code> - HMAC signature for verification</li>
                  <li>• <code className="text-xs bg-muted px-1 py-0.5 rounded">X-Event-Id</code> - Unique event identifier</li>
                  <li>• <code className="text-xs bg-muted px-1 py-0.5 rounded">X-Delivery-Id</code> - Unique delivery identifier</li>
                  <li>• <code className="text-xs bg-muted px-1 py-0.5 rounded">X-Timestamp</code> - Unix timestamp (milliseconds)</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Request Body</h3>
                <div className="bg-muted p-4 rounded-lg">
                  <pre className="text-xs font-mono overflow-x-auto">
{`{
  "type": "user.created",
  "data": {
    "userId": "user123",
    "email": "user@example.com",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}`}
                  </pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Signature Verification</CardTitle>
            </div>
            <CardDescription>Verify webhook authenticity with HMAC-SHA256</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Signature Format</h3>
                <div className="bg-muted p-3 rounded-lg">
                  <code className="text-xs font-mono">X-Signature: t=1702654321000,v1=abc123def456...</code>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Verification Example (Node.js)</h3>
                <div className="bg-muted p-4 rounded-lg">
                  <pre className="text-xs font-mono overflow-x-auto">
{`const crypto = require('crypto');

function verifySignature(signature, timestamp, body, secret) {
  const payload = timestamp + '.' + body;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return signature === expectedSignature;
}

// Usage
const signature = req.headers['x-signature'].split('v1=')[1];
const timestamp = req.headers['x-timestamp'];
const isValid = verifySignature(
  signature,
  timestamp,
  JSON.stringify(req.body),
  'your_webhook_secret'
);`}
                  </pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code className="h-5 w-5 text-primary" />
              <CardTitle>API Reference</CardTitle>
            </div>
            <CardDescription>Complete API endpoints documentation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between p-2 rounded hover:bg-accent">
                <span className="font-mono text-xs">POST /api/v1/events</span>
                <span className="text-muted-foreground">Send event</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded hover:bg-accent">
                <span className="font-mono text-xs">GET /api/v1/deliveries</span>
                <span className="text-muted-foreground">List deliveries</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded hover:bg-accent">
                <span className="font-mono text-xs">POST /api/v1/deliveries/:id/replay</span>
                <span className="text-muted-foreground">Replay failed delivery</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded hover:bg-accent">
                <span className="font-mono text-xs">GET /actuator/health</span>
                <span className="text-muted-foreground">Health check</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <CardTitle>Best Practices</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Always verify webhook signatures before processing events</li>
              <li>• Use idempotency keys to prevent duplicate event processing</li>
              <li>• Respond with 2xx status codes quickly (within 30 seconds)</li>
              <li>• Handle retries gracefully - webhooks will be retried on failure</li>
              <li>• Store webhook secrets securely (use environment variables)</li>
              <li>• Monitor delivery attempts in the dashboard</li>
              <li>• Set up rate limiting for your endpoints if needed</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
