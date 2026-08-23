// Mock harness for the events-and-deliveries workstream.
// Extends .playwright-mcp/mock.js with the endpoints these pages call:
// deliveries (list/detail/attempts), DLQ (+stats), replay sessions, incoming
// events (+forward attempts) and per-event debug links.
//
// Usage: browser_run_code_unsafe with filename: .playwright-mcp/mock-events.js
// then navigate to the page you want. `globalThis.__gotoPath(page, path)` jumps
// to another admin route without re-installing the routes.
async (page) => {
  const PID = '11111111-1111-1111-1111-111111111111';
  const user = {
    user: { id: 'u1', email: 'vadym@hookflow.dev', fullName: 'Vadym K', status: 'ACTIVE', emailVerified: true, createdAt: '2026-01-01T00:00:00Z' },
    organization: { id: 'o1', name: 'Acme Payments', createdAt: '2026-01-01T00:00:00Z' },
    role: 'OWNER',
  };
  const project = { id: PID, name: 'Production', description: 'Live traffic', schemaValidationEnabled: true, schemaValidationPolicy: 'WARN', idempotencyPolicy: 'STRICT', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };
  const project2 = { id: '22222222-2222-2222-2222-222222222222', name: 'Staging', description: 'Pre-prod', schemaValidationEnabled: false, schemaValidationPolicy: 'OFF', idempotencyPolicy: 'NONE', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };

  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const isoIn = (msAhead) => new Date(now + msAhead).toISOString();

  const endpoints = [
    { id: 'e1', projectId: PID, url: 'https://api.acme.com/hooks/orders', description: 'Order service', enabled: true, verificationStatus: 'VERIFIED', mtlsEnabled: false, rateLimitPerSecond: 50, createdAt: iso(9e8), updatedAt: iso(1e7) },
    { id: 'e2', projectId: PID, url: 'https://billing.internal.acme.com/webhooks', description: 'Billing', enabled: true, verificationStatus: 'VERIFIED', mtlsEnabled: true, createdAt: iso(8e8), updatedAt: iso(1e7) },
    { id: 'e3', projectId: PID, url: 'https://hooks.partner.io/v2/inbound', description: 'Partner sync', enabled: false, verificationStatus: 'FAILED', createdAt: iso(4e8), updatedAt: iso(2e6) },
  ];

  const eventIds = Array.from({ length: 12 }, (_, i) => `01H8K${i}QF9ZR4TB2MC7XA${i}D3`);
  const events = eventIds.map((id, i) => ({
    id,
    projectId: PID,
    eventType: ['order.completed', 'payment.failed', 'user.created', 'invoice.finalized', 'subscription.canceled'][i % 5],
    payload: JSON.stringify({ id: 'obj_' + i, amount: 1200 + i * 37, currency: 'USD', customer: { id: 'cus_' + i, email: 'buyer@example.com' } }),
    createdAt: iso(i * 6e5),
    deliveriesCreated: i === 4 ? 0 : (i % 3) + 1,
  }));

  const STATUSES = ['SUCCESS', 'SUCCESS', 'PENDING', 'FAILED', 'SUCCESS', 'DLQ', 'PROCESSING', 'SUCCESS'];
  const deliveries = Array.from({ length: 16 }, (_, i) => {
    const status = STATUSES[i % STATUSES.length];
    const attemptCount = status === 'SUCCESS' ? (i % 3) + 1 : status === 'DLQ' ? 8 : (i % 4) + 2;
    return {
      id: `d${i}f4a2b7c9e1d${i}`,
      eventId: eventIds[i % eventIds.length],
      endpointId: endpoints[i % 3].id,
      subscriptionId: 's1',
      status,
      attemptCount,
      maxAttempts: 8,
      createdAt: iso(i * 4e5),
      lastAttemptAt: iso(i * 4e5 - 1000),
      nextRetryAt: status === 'PENDING' ? isoIn(9e5 + i * 6e4) : undefined,
      succeededAt: status === 'SUCCESS' ? iso(i * 4e5 - 500) : undefined,
      failedAt: status === 'DLQ' || status === 'FAILED' ? iso(i * 4e5 - 500) : undefined,
    };
  });

  const attemptsFor = (deliveryId) => {
    const d = deliveries.find((x) => x.id === deliveryId) || deliveries[0];
    const waits = [0, 60_000, 300_000, 900_000, 3_600_000, 21_600_000, 86_400_000, 172_800_000];
    const base = new Date(d.createdAt).getTime();
    return Array.from({ length: d.attemptCount }, (_, i) => {
      const last = i === d.attemptCount - 1;
      const ok = last && d.status === 'SUCCESS';
      return {
        id: `${d.id}-a${i + 1}`,
        deliveryId: d.id,
        attemptNumber: i + 1,
        requestHeaders: JSON.stringify({ 'Content-Type': 'application/json', 'X-Request-Id': 'req_' + i, 'X-Hookflow-Signature': 'v1=9f2c…' }),
        requestBody: JSON.stringify({ id: 'evt_' + i, type: 'order.completed' }),
        httpStatusCode: ok ? 200 : [500, 502, 503, 429][i % 4],
        responseHeaders: JSON.stringify({ 'content-type': 'text/plain' }),
        responseBody: ok ? '{"received":true}' : 'upstream timeout',
        errorMessage: ok ? undefined : 'Connection reset by peer',
        durationMs: 120 + i * 90,
        createdAt: new Date(base + waits[Math.min(i, waits.length - 1)]).toISOString(),
      };
    });
  };

  const dlqItems = Array.from({ length: 6 }, (_, i) => ({
    deliveryId: `dlq${i}c3f8a1b4e7`,
    eventId: eventIds[i],
    endpointId: endpoints[i % 3].id,
    subscriptionId: 's1',
    eventType: events[i].eventType,
    endpointUrl: endpoints[i % 3].url,
    attemptCount: 8,
    maxAttempts: 8,
    lastError: ['Connection reset by peer', 'HTTP 500 Internal Server Error', 'Read timeout after 30s'][i % 3],
    failedAt: iso(i * 12e5),
    createdAt: iso(i * 12e5 + 9e5),
  }));

  const dlqStats = { totalItems: 6, last24Hours: 4, last7Days: 6 };

  const replaySessions = [
    { id: 'r1', projectId: PID, createdBy: 'u1', status: 'RUNNING', fromDate: iso(864e5), toDate: iso(0), eventType: 'order.completed', endpointId: 'e1', totalEvents: 4210, processedEvents: 1804, deliveriesCreated: 3120, errors: 0, progressPercent: 43, startedAt: iso(3e5), createdAt: iso(36e4) },
    { id: 'r2', projectId: PID, createdBy: 'u1', status: 'COMPLETED', fromDate: iso(1728e5), toDate: iso(864e5), totalEvents: 980, processedEvents: 980, deliveriesCreated: 1740, errors: 0, progressPercent: 100, completedAt: iso(72e6), createdAt: iso(73e6), durationMs: 184000 },
    { id: 'r3', projectId: PID, createdBy: 'u1', status: 'FAILED', fromDate: iso(2592e5), toDate: iso(1728e5), eventType: 'payment.failed', totalEvents: 120, processedEvents: 44, deliveriesCreated: 60, errors: 9, progressPercent: 36, errorMessage: 'Endpoint e3 refused connection', createdAt: iso(15e7) },
  ];

  const sources = [
    { id: 'src1', projectId: PID, name: 'Stripe', slug: 'stripe', providerType: 'STRIPE', status: 'ACTIVE', ingressPathToken: 'tok_stripe', ingressUrl: 'https://in.hookflow.dev/tok_stripe', verificationMode: 'HMAC_GENERIC', hmacSecretConfigured: true, createdAt: iso(9e8), updatedAt: iso(1e7) },
    { id: 'src2', projectId: PID, name: 'GitHub', slug: 'github', providerType: 'GITHUB', status: 'ACTIVE', ingressPathToken: 'tok_gh', ingressUrl: 'https://in.hookflow.dev/tok_gh', verificationMode: 'HMAC_GENERIC', hmacSecretConfigured: true, createdAt: iso(9e8), updatedAt: iso(1e7) },
  ];

  const incomingEvents = Array.from({ length: 10 }, (_, i) => ({
    id: 'in' + i,
    incomingSourceId: sources[i % 2].id,
    sourceName: sources[i % 2].name,
    requestId: `req_7fa3c${i}b2e8d1`,
    method: 'POST',
    path: '/' + sources[i % 2].ingressPathToken,
    headersJson: JSON.stringify({ 'content-type': 'application/json', 'stripe-signature': 't=1699,v1=abc…' }),
    bodyRaw: JSON.stringify({ id: 'evt_' + i, type: 'charge.succeeded', amount: 4200 }),
    contentType: 'application/json',
    clientIp: '54.187.174.' + (i + 3),
    verified: i % 4 === 3 ? false : i % 5 === 4 ? null : true,
    verificationError: i % 4 === 3 ? 'Signature mismatch' : undefined,
    receivedAt: iso(i * 5e5),
  }));

  const forwardAttempts = [
    { id: 'fa1', incomingEventId: 'in0', destinationId: 'dst1', destinationUrl: 'https://acme.internal/ingest/stripe', attemptNumber: 1, status: 'FAILED', responseCode: 503, errorMessage: 'Service unavailable', startedAt: iso(5e5), finishedAt: iso(5e5 - 400), createdAt: iso(5e5) },
    { id: 'fa2', incomingEventId: 'in0', destinationId: 'dst1', destinationUrl: 'https://acme.internal/ingest/stripe', attemptNumber: 2, status: 'FAILED', responseCode: 503, errorMessage: 'Service unavailable', startedAt: iso(44e4), finishedAt: iso(44e4 - 300), nextRetryAt: isoIn(6e5), createdAt: iso(44e4) },
    { id: 'fa3', incomingEventId: 'in0', destinationId: 'dst1', destinationUrl: 'https://acme.internal/ingest/stripe', attemptNumber: 3, status: 'SUCCESS', responseCode: 200, responseBodySnippet: '{"ok":true}', startedAt: iso(14e4), finishedAt: iso(14e4 - 120), createdAt: iso(14e4) },
    { id: 'fa4', incomingEventId: 'in0', destinationId: 'dst2', destinationUrl: 'https://analytics.acme.com/hooks', attemptNumber: 1, status: 'SUCCESS', responseCode: 202, startedAt: iso(5e5), finishedAt: iso(5e5 - 90), createdAt: iso(5e5) },
  ];

  const debugLinks = [
    { id: 'dl1', projectId: PID, eventId: eventIds[0], token: 'tok_share_1', shareUrl: 'https://app.hookflow.dev/shared/tok_share_1', expiresAt: isoIn(864e5), createdAt: iso(36e5), viewCount: 3 },
  ];

  const stats = {
    deliveryStats: { totalDeliveries: 184203, successfulDeliveries: 182710, failedDeliveries: 1108, pendingDeliveries: 297, dlqDeliveries: 88, successRate: 99.19 },
    recentEvents: events.slice(0, 6).map((e) => ({ id: e.id, type: e.eventType, createdAt: e.createdAt, deliveryCount: e.deliveriesCreated })),
    endpointHealth: endpoints.map((e, i) => ({ id: e.id, url: e.url, enabled: e.enabled, totalDeliveries: 90000 - i * 22000, successfulDeliveries: 89100 - i * 22500, successRate: [99.7, 98.4, 91.2][i] })),
  };

  const onboarding = { hasEndpoints: true, hasSubscriptions: true, hasApiKeys: true, hasEvents: true, hasDeliveries: true, hasIncomingSources: true, hasIncomingDestinations: true };
  const paged = (content) => ({ content, totalElements: content.length, totalPages: 1, size: 20, number: 0, first: true, last: true, empty: content.length === 0 });

  await page.route('**/api/v1/**', async (route) => {
    const p = route.request().url().split('?')[0];
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (p.endsWith('/auth/refresh')) return json({ accessToken: 'fake.jwt.token', refreshToken: 'r', emailVerified: true });
    if (p.endsWith('/auth/me')) return json(user);

    // Deliveries live under /deliveries/... — matched before the project rule,
    // whose /projects/{id}$ pattern would otherwise swallow the list URL.
    if (/\/deliveries\/projects\/[^/]+$/.test(p)) return json(paged(deliveries));
    if (/\/deliveries\/[^/]+\/attempts$/.test(p)) return json(attemptsFor(p.split('/').slice(-2)[0]));
    if (p.includes('/bulk-replay')) return json({ totalRequested: 3, replayed: 3, skipped: 0, totalMatched: 3, hasMore: false, message: 'Replayed 3 deliveries' });
    if (/\/deliveries\/[^/]+$/.test(p)) {
      const id = p.split('/').pop();
      return json(deliveries.find((d) => d.id === id) || deliveries[0]);
    }

    if (p.endsWith('/dlq/stats')) return json(dlqStats);
    if (p.endsWith('/dlq')) return json({ content: dlqItems, totalElements: dlqItems.length, totalPages: 1, size: 20, number: 0 });
    if (p.endsWith('/replay')) return json(paged(replaySessions));
    if (p.endsWith('/replay/estimate')) return json({ totalEvents: 4210, estimatedDeliveries: 6820, activeSubscriptions: 3 });

    if (p.endsWith('/incoming-events')) return json(paged(incomingEvents));
    if (/\/incoming-events\/[^/]+\/attempts$/.test(p)) return json(paged(forwardAttempts));
    if (p.endsWith('/incoming-sources')) return json(paged(sources));

    if (p.endsWith('/debug-links')) return json(debugLinks);
    if (p.endsWith('/events')) return json(paged(events));
    if (/\/events\/[^/]+$/.test(p)) {
      const id = p.split('/').pop();
      return json(events.find((e) => e.id === id) || events[0]);
    }

    if (p.endsWith('/api/v1/projects')) return json([project, project2]);
    if (/\/projects\/[0-9a-f-]+$/.test(p)) return json(project);
    if (/\/dashboard\/projects\/[^/]+$/.test(p)) return json(stats);
    if (p.endsWith('/onboarding')) return json(onboarding);
    if (p.endsWith('/endpoints')) return json(paged(endpoints));
    if (p.endsWith('/subscriptions')) return json(paged(endpoints.map((e, i) => ({ id: 's' + i, projectId: PID, endpointId: e.id, eventType: ['order.*', 'payment.failed', '*'][i], enabled: true, createdAt: iso(9e8), updatedAt: iso(1e7) }))));
    if (p.endsWith('/schemas')) return json(paged([]));
    if (p.endsWith('/members')) return json([{ id: 'm1', userId: 'u1', email: 'vadym@hookflow.dev', fullName: 'Vadym K', role: 'OWNER', status: 'ACTIVE', createdAt: iso(9e8) }]);
    return json(paged([]));
  });

  await page.addInitScript((u) => {
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('theme', 'light');
  }, user);

  await page.goto(`http://localhost:5173/admin/projects/${PID}/events`);
  await page.waitForTimeout(2500);
  return { url: page.url() };
}
