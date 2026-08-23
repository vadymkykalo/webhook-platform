/**
 * The code samples the guides show.
 *
 * Only samples that teach something live here: a first request, a signature
 * verification, a CLI session. Per-endpoint request/response examples used to
 * live in this file too — they now come from the spec, in `ApiReference`.
 */

const BASE = 'https://your-api.com';

export const authSamples = {
  login: {
    curl: `curl -X POST ${BASE}/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@company.com","password":"••••••••"}'`,
    node: `const res = await fetch('${BASE}/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'you@company.com', password: process.env.PASSWORD }),
});
const { accessToken } = await res.json();`,
    python: `import requests

res = requests.post(
    "${BASE}/api/v1/auth/login",
    json={"email": "you@company.com", "password": os.environ["PASSWORD"]},
)
access_token = res.json()["accessToken"]`,
  },
  bearer: `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`,
  apiKey: `X-API-Key: wh_live_1234567890abcdef`,
};

export const quickstartSamples = {
  project: `curl -X POST ${BASE}/api/v1/projects \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Production"}'`,
  apiKey: `curl -X POST ${BASE}/api/v1/projects/$PROJECT_ID/api-keys \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Production key"}'`,
  endpoint: `curl -X POST ${BASE}/api/v1/projects/$PROJECT_ID/endpoints \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://api.customer.com/webhooks","description":"Orders"}'`,
  subscription: `curl -X POST ${BASE}/api/v1/projects/$PROJECT_ID/subscriptions \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"endpointId":"$ENDPOINT_ID","eventType":"order.completed"}'`,
  event: `curl -X POST ${BASE}/api/v1/events \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-12345-completed" \\
  -d '{"type":"order.completed","data":{"orderId":"ord_12345","amount":99.99}}'`,
};

export const signatureSamples = {
  curl: `# Hookflow signs "<timestamp>.<raw body>" with the endpoint secret.
# X-Signature: t=<unix-ms>,v1=<hex hmac-sha256>

SIGNED="\${TIMESTAMP}.\${BODY}"
EXPECTED=$(printf '%s' "$SIGNED" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)
[ "$EXPECTED" = "$V1" ] || exit 1`,
  node: `import crypto from 'node:crypto';

export function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${parts.t}.\${rawBody}\`)
    .digest('hex');

  // Constant time — a fast reject leaks the signature one byte at a time.
  const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  // Reject anything older than five minutes so a captured request cannot be replayed.
  const fresh = Math.abs(Date.now() - Number(parts.t)) < 5 * 60 * 1000;
  return ok && fresh;
}`,
  python: `import hashlib, hmac, time

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    expected = hmac.new(
        secret.encode(), f"{parts['t']}.".encode() + raw_body, hashlib.sha256
    ).hexdigest()
    fresh = abs(time.time() * 1000 - int(parts["t"])) < 5 * 60 * 1000
    return hmac.compare_digest(expected, parts["v1"]) and fresh`,
};

export const challengeSamples = {
  request: `POST https://your-endpoint.com/webhooks
Content-Type: application/json

{
  "type": "webhook.verification",
  "challenge": "whc_abc123xyz789",
  "timestamp": "2024-01-15T10:30:00Z"
}`,
  response: `HTTP/1.1 200 OK
Content-Type: application/json

{ "challenge": "whc_abc123xyz789" }`,
};

export const replaySamples = {
  header: `Idempotency-Key: <event-idempotency-key>-<endpoint-id>
# under the AUTO policy, when the client sent no key:
Idempotency-Key: <event-id>-<endpoint-id>`,
  dryRun: `{
  "deliveryId": "…",
  "endpointUrl": "https://your-app.com/webhook",
  "eventType": "order.created",
  "idempotencyKey": "idem-key-123-endpoint-456",
  "plan": "WILL_SEND: POST https://your-app.com/webhook (attempt 4/7)",
  "previousAttemptCount": 3,
  "maxAttempts": 7,
  "currentStatus": "FAILED"
}`,
};

export const rulesSample = `curl -X POST ${BASE}/api/v1/projects/$PROJECT_ID/rules \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Route high-value orders to fraud detection",
    "enabled": true,
    "priority": 10,
    "eventTypePattern": "order.*",
    "conditions": {
      "type": "group",
      "op": "AND",
      "children": [
        { "type": "predicate", "field": "data.amount", "operator": "GTE", "value": 1000, "valueType": "NUMBER" },
        { "type": "predicate", "field": "data.currency", "operator": "IN", "value": ["USD","EUR"], "valueType": "ARRAY_STRING" }
      ]
    },
    "actions": [
      { "type": "ROUTE", "endpointId": "$FRAUD_ENDPOINT_ID", "sortOrder": 0 },
      { "type": "TAG", "config": { "tag": "high-value" }, "sortOrder": 1 }
    ]
  }'`;

export const schemaSample = `curl -X POST ${BASE}/api/v1/projects/$PROJECT_ID/schemas/$EVENT_TYPE_ID/versions \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "schemaJson": "{\\"type\\":\\"object\\",\\"required\\":[\\"order_id\\"],\\"properties\\":{\\"order_id\\":{\\"type\\":\\"string\\"}}}",
    "compatibilityMode": "BACKWARD"
  }'`;

export const errorSamples = {
  envelope: `{
  "error": "validation_error",
  "message": "Invalid request parameters",
  "status": 400,
  "fieldErrors": {
    "type": "Event type is required",
    "data": "Event data cannot be empty"
  }
}`,
};

export const cliSamples = {
  install: `curl -fsSL https://raw.githubusercontent.com/vadymkykalo/webhook-platform/main/webhook-platform-cli/install.sh | bash`,
  docker: `docker run --rm -it -v ~/.config/hookflow:/root/.config/hookflow \\
  ghcr.io/vadymkykalo/hookflow-cli:latest listen 3000`,
  login: `hookflow login

# ▸ Open: http://localhost:5173/device?code=ABCD-1234
# ▸ Code: ABCD-1234
# ✓ Logged in as you@company.com`,
  listen: `hookflow listen 3000

#   Public URL:  https://tun-x4k9.hookflow.dev/t/tun-x4k9
#   Forwarding:  → http://localhost:3000
#   Press Ctrl+C to stop`,
  profiles: `hookflow config profile create staging --url https://staging.company.com
hookflow config profile use staging && hookflow login
hookflow config profile list`,
};

export const sdkSamples = {
  node: `import { Hookflow } from '@webhook-platform/node';

const client = new Hookflow({ apiKey: process.env.HOOKFLOW_API_KEY });

const event = await client.events.send({
  type: 'order.completed',
  data: { orderId: 'ord_12345', amount: 99.99 },
});`,
  python: `from hookflow import Hookflow, Event

client = Hookflow(api_key=os.environ["HOOKFLOW_API_KEY"])

event = client.events.send(
    Event(type="order.completed", data={"order_id": "ord_12345", "amount": 99.99})
)`,
  php: `<?php
use Hookflow\\Hookflow;

$client = new Hookflow(apiKey: getenv('HOOKFLOW_API_KEY'));

$event = $client->events->send(
    type: 'order.completed',
    data: ['orderId' => 'ord_12345', 'amount' => 99.99],
);`,
};
