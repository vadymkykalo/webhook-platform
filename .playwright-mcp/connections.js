// Mock harness for the Connections workstream: fakes auth and every endpoint
// the Connections / Endpoints / Subscriptions / Incoming sources tabs call.
async (page) => {
  const PID = '11111111-1111-1111-1111-111111111111';
  const user = {
    user: { id: 'u1', email: 'vadym@hookflow.dev', fullName: 'Vadym K', status: 'ACTIVE', emailVerified: true, createdAt: '2026-01-01T00:00:00Z' },
    organization: { id: 'o1', name: 'Acme Payments', createdAt: '2026-01-01T00:00:00Z' },
    role: 'OWNER',
  };
  const project = { id: PID, name: 'Production', description: 'Live traffic', schemaValidationEnabled: true, schemaValidationPolicy: 'WARN', idempotencyPolicy: 'STRICT', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };

  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();

  const endpoints = [
    { id: 'e1', projectId: PID, url: 'https://api.acme.com/hooks/orders', description: 'Order service', enabled: true, verificationStatus: 'VERIFIED', mtlsEnabled: false, rateLimitPerSecond: 50, createdAt: iso(9e8), updatedAt: iso(1e7) },
    { id: 'e2', projectId: PID, url: 'https://billing.internal.acme.com/webhooks', description: 'Billing', enabled: true, verificationStatus: 'PENDING', mtlsEnabled: true, createdAt: iso(8e8), updatedAt: iso(1e7) },
    { id: 'e3', projectId: PID, url: 'https://hooks.partner.io/v2/inbound', description: 'Partner sync', enabled: false, verificationStatus: 'FAILED', createdAt: iso(4e8), updatedAt: iso(2e6) },
    { id: 'e4', projectId: PID, url: 'https://ops.acme.com/alerting/webhook', description: 'Ops alerting', enabled: true, verificationStatus: 'SKIPPED', createdAt: iso(2e8), updatedAt: iso(2e6) },
  ];

  const subscriptions = [
    { id: 's1', projectId: PID, endpointId: 'e1', eventType: 'order.created', enabled: true, orderingEnabled: true, maxAttempts: 7, timeoutSeconds: 30, retryDelays: '60,300,900,3600,21600,86400', payloadTemplate: null, customHeaders: null, transformationId: null, transformationName: null, createdAt: iso(9e8), updatedAt: iso(1e7) },
    { id: 's2', projectId: PID, endpointId: 'e1', eventType: 'order.updated', enabled: true, orderingEnabled: false, maxAttempts: 7, timeoutSeconds: 30, retryDelays: '60,300,900,3600,21600,86400', payloadTemplate: null, customHeaders: null, transformationId: null, transformationName: null, createdAt: iso(9e8), updatedAt: iso(1e7) },
    { id: 's3', projectId: PID, endpointId: 'e1', eventType: 'payment.succeeded', enabled: false, orderingEnabled: false, maxAttempts: 5, timeoutSeconds: 20, retryDelays: '60,300,900', payloadTemplate: null, customHeaders: null, transformationId: null, transformationName: null, createdAt: iso(7e8), updatedAt: iso(1e7) },
    { id: 's4', projectId: PID, endpointId: 'e2', eventType: 'invoice.finalized', enabled: true, orderingEnabled: false, maxAttempts: 6, timeoutSeconds: 30, retryDelays: '60,300,900,3600', payloadTemplate: null, customHeaders: null, transformationId: null, transformationName: null, createdAt: iso(8e8), updatedAt: iso(1e7) },
    { id: 's5', projectId: PID, endpointId: 'e3', eventType: 'customer.created', enabled: true, orderingEnabled: false, maxAttempts: 4, timeoutSeconds: 15, retryDelays: '30,120,600', payloadTemplate: null, customHeaders: null, transformationId: null, transformationName: null, createdAt: iso(4e8), updatedAt: iso(2e6) },
  ];

  // e1 healthy, e2 retrying, e3 in DLQ, e4 no traffic.
  const deliveries = [
    ...Array.from({ length: 9 }, (_, i) => ({ id: 'd1' + i, eventId: 'ev' + i, endpointId: 'e1', subscriptionId: 's1', status: 'SUCCESS', attemptCount: 1, maxAttempts: 7, createdAt: iso(i * 4e5) })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: 'd2' + i, eventId: 'ev' + i, endpointId: 'e2', subscriptionId: 's4', status: i === 0 ? 'FAILED' : 'SUCCESS', attemptCount: 3, maxAttempts: 6, createdAt: iso(i * 4e5) })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: 'd3' + i, eventId: 'ev' + i, endpointId: 'e3', subscriptionId: 's5', status: i === 0 ? 'DLQ' : 'FAILED', attemptCount: 4, maxAttempts: 4, createdAt: iso(i * 4e5) })),
  ];

  const eventTypes = ['order.created', 'order.updated', 'payment.succeeded', 'invoice.finalized'].map((name, i) => ({
    id: 'et' + i, projectId: PID, name, description: null, latestVersion: i + 1, activeVersionStatus: 'ACTIVE', hasBreakingChanges: false, createdAt: iso(9e8), updatedAt: iso(1e7),
  }));

  const sources = [
    { id: 'src1', projectId: PID, name: 'Stripe', slug: 'stripe', providerType: 'STRIPE', status: 'ACTIVE', ingressPathToken: 'tok1', ingressUrl: 'https://in.hookflow.dev/ingress/tok1', verificationMode: 'PROVIDER', hmacHeaderName: 'Stripe-Signature', hmacSignaturePrefix: 'v1=', hmacSecretConfigured: true, rateLimitPerSecond: 100, createdAt: iso(9e8), updatedAt: iso(1e7) },
    { id: 'src2', projectId: PID, name: 'GitHub', slug: 'github', providerType: 'GITHUB', status: 'ACTIVE', ingressPathToken: 'tok2', ingressUrl: 'https://in.hookflow.dev/ingress/tok2', verificationMode: 'HMAC_GENERIC', hmacHeaderName: 'X-Hub-Signature-256', hmacSecretConfigured: true, rateLimitPerSecond: null, createdAt: iso(6e8), updatedAt: iso(1e7) },
    { id: 'src3', projectId: PID, name: 'Legacy CRM', slug: 'legacy-crm', providerType: 'GENERIC', status: 'DISABLED', ingressPathToken: 'tok3', ingressUrl: 'https://in.hookflow.dev/ingress/tok3', verificationMode: 'NONE', hmacSecretConfigured: false, rateLimitPerSecond: null, createdAt: iso(2e8), updatedAt: iso(2e6) },
  ];

  const destinations = [
    { id: 'dst1', incomingSourceId: 'src1', url: 'https://api.acme.com/inbox/stripe', authType: 'BEARER', authConfigured: true, enabled: true, maxAttempts: 5, timeoutSeconds: 30, retryDelays: '60,300,900,3600', transformationName: 'Stripe → internal', createdAt: iso(6e8), updatedAt: iso(1e7) },
    { id: 'dst2', incomingSourceId: 'src1', url: 'https://archive.acme.com/raw', authType: 'NONE', authConfigured: false, enabled: false, maxAttempts: 3, timeoutSeconds: 10, retryDelays: '30,120', createdAt: iso(3e8), updatedAt: iso(1e7) },
  ];

  const paged = (content) => ({ content, totalElements: content.length, totalPages: 1, size: 20, number: 0, first: true, last: true, empty: content.length === 0 });

  await page.route('**/api/v1/**', async (route) => {
    const p = route.request().url().split('?')[0];
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (p.endsWith('/auth/refresh')) return json({ accessToken: 'fake.jwt.token', refreshToken: 'r', emailVerified: true });
    if (p.endsWith('/auth/me')) return json(user);
    if (p.endsWith('/api/v1/projects')) return json([project]);
    if (/\/deliveries\/projects\//.test(p)) return json(paged(deliveries));
    if (/\/api\/v1\/projects\/[0-9a-f-]+$/.test(p)) return json(project);
    if (p.endsWith('/endpoints')) return json(paged(endpoints));
    if (p.endsWith('/subscriptions')) return json(subscriptions);
    if (p.endsWith('/schemas')) return json(eventTypes);
    if (p.endsWith('/transformations')) return json([]);
    if (p.endsWith('/incoming-sources')) return json(paged(sources));
    if (/\/incoming-sources\/[^/]+\/destinations$/.test(p)) return json(paged(destinations));
    if (/\/incoming-sources\/[^/]+$/.test(p)) return json(sources.find((s) => p.endsWith(s.id)) ?? sources[0]);
    if (p.endsWith('/onboarding')) return json({ hasEndpoints: true, hasSubscriptions: true, hasApiKeys: true, hasEvents: true, hasDeliveries: true, hasIncomingSources: true, hasIncomingDestinations: true });
    return json(paged([]));
  });

  await page.addInitScript((u) => {
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('theme', 'light');
    localStorage.setItem('i18n_lng', 'en');
  }, user);

  const base = `http://localhost:5173/admin/projects/${PID}`;
  const shots = [
    ['connections', `${base}/connections`],
    ['endpoints', `${base}/endpoints`],
    ['subscriptions', `${base}/subscriptions`],
    ['incoming-sources', `${base}/incoming-sources`],
    ['incoming-source-detail', `${base}/incoming-sources/src1`],
    ['connection-setup', `${base}/connection-setup`],
  ];
  // The long-running dev server was started before tailwind.config.js gained the
  // ok/retry/halt/idle colours, so its cached PostCSS build is missing those
  // utilities. Inject a freshly built stylesheet for the screenshots rather than
  // restarting a server other workstreams are using.
  const out = [];
  for (const [name, url] of shots) {
    await page.goto(url);
    await page.waitForTimeout(1500);
    await page.addStyleTag({ path: '/tmp/claude-1000/tw-out.css' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/home/vadym/myselfspace/webhook-platform/.playwright-mcp/conn-${name}.png`, fullPage: true });
    out.push(name + ' ' + page.url());
  }
  return { shots: out };
}
