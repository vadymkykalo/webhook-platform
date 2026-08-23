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

  const endpoints = [
    { id: 'e1', projectId: PID, url: 'https://api.acme.com/hooks/orders', description: 'Order service', enabled: true, verificationStatus: 'VERIFIED', mtlsEnabled: false, rateLimitPerSecond: 50, createdAt: iso(9e8), updatedAt: iso(1e7) },
    { id: 'e2', projectId: PID, url: 'https://billing.internal.acme.com/webhooks', description: 'Billing', enabled: true, verificationStatus: 'VERIFIED', mtlsEnabled: true, createdAt: iso(8e8), updatedAt: iso(1e7) },
    { id: 'e3', projectId: PID, url: 'https://hooks.partner.io/v2/inbound', description: 'Partner sync', enabled: false, verificationStatus: 'FAILED', createdAt: iso(4e8), updatedAt: iso(2e6) },
  ];

  const events = Array.from({ length: 12 }, (_, i) => ({
    id: 'ev' + i,
    projectId: PID,
    eventType: ['order.completed', 'payment.failed', 'user.created', 'invoice.finalized', 'subscription.canceled'][i % 5],
    payload: JSON.stringify({ id: 'obj_' + i, amount: 1200 + i * 37, currency: 'USD' }),
    createdAt: iso(i * 6e5),
    deliveriesCreated: (i % 3) + 1,
  }));

  const deliveries = Array.from({ length: 14 }, (_, i) => ({
    id: 'd' + i,
    eventId: 'ev' + (i % 12),
    endpointId: endpoints[i % 3].id,
    subscriptionId: 's1',
    status: ['SUCCESS', 'SUCCESS', 'SUCCESS', 'FAILED', 'PENDING', 'DLQ'][i % 6],
    attemptCount: (i % 4) + 1,
    maxAttempts: 8,
    createdAt: iso(i * 4e5),
    lastAttemptAt: iso(i * 4e5 - 1000),
    succeededAt: i % 6 < 3 ? iso(i * 4e5 - 500) : undefined,
  }));

  const subscriptions = endpoints.map((e, i) => ({
    id: 's' + i, projectId: PID, endpointId: e.id, eventType: ['order.*', 'payment.failed', '*'][i], enabled: true, createdAt: iso(9e8), updatedAt: iso(1e7),
  }));

  const stats = {
    deliveryStats: { totalDeliveries: 184203, successfulDeliveries: 182710, failedDeliveries: 1108, pendingDeliveries: 297, dlqDeliveries: 88, successRate: 99.19 },
    recentEvents: events.slice(0, 6).map((e) => ({ id: e.id, type: e.eventType, createdAt: e.createdAt, deliveryCount: e.deliveriesCreated })),
    endpointHealth: endpoints.map((e, i) => ({ id: e.id, url: e.url, enabled: e.enabled, totalDeliveries: 90000 - i * 22000, successfulDeliveries: 89100 - i * 22500, successRate: [99.7, 98.4, 91.2][i] })),
  };

  const series = Array.from({ length: 24 }, (_, i) => ({
    timestamp: iso((23 - i) * 36e5),
    total: 6000 + Math.round(Math.sin(i / 3) * 1800) + i * 40,
    success: 5900 + Math.round(Math.sin(i / 3) * 1750) + i * 38,
    failed: 40 + (i % 7) * 9,
    avgLatencyMs: 120 + (i % 5) * 22,
  }));

  const analytics = {
    timeRange: { from: iso(864e5), to: iso(0), granularity: 'HOUR' },
    overview: { totalEvents: 71204, totalDeliveries: 184203, successfulDeliveries: 182710, failedDeliveries: 1108, successRate: 99.19, avgLatencyMs: 142, p50LatencyMs: 96, p95LatencyMs: 410, p99LatencyMs: 1180, eventsPerSecond: 0.82, deliveriesPerSecond: 2.13 },
    deliveryTimeSeries: series,
    latencyTimeSeries: series,
    eventTypeBreakdown: ['order.completed', 'payment.failed', 'user.created', 'invoice.finalized'].map((t, i) => ({ eventType: t, count: 30000 - i * 7000, percentage: 42 - i * 9, successCount: 29800 - i * 7000, successRate: 99.4 - i * 0.7 })),
    endpointPerformance: endpoints.map((e, i) => ({ endpointId: e.id, url: e.url, enabled: e.enabled, totalDeliveries: 90000 - i * 22000, successfulDeliveries: 89100 - i * 22500, failedDeliveries: 900 + i * 400, successRate: [99.7, 98.4, 91.2][i], avgLatencyMs: 110 + i * 60, p95LatencyMs: 300 + i * 200, lastDeliveryAt: iso(i * 6e4), status: ['HEALTHY', 'HEALTHY', 'FAILING'][i] })),
    latencyPercentiles: { p50: 96, p75: 180, p90: 320, p95: 410, p99: 1180, max: 4200 },
  };

  const onboarding = { hasEndpoints: true, hasSubscriptions: true, hasApiKeys: true, hasEvents: true, hasDeliveries: true, hasIncomingSources: false, hasIncomingDestinations: false };

  const paged = (content) => ({ content, totalElements: content.length, totalPages: 1, size: 20, number: 0, first: true, last: true, empty: content.length === 0 });

  await page.route('**/api/v1/**', async (route) => {
    const p = route.request().url().split('?')[0];
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (p.endsWith('/auth/refresh')) return json({ accessToken: 'fake.jwt.token', refreshToken: 'r', emailVerified: true });
    if (p.endsWith('/auth/me')) return json(user);
    if (p.endsWith('/api/v1/projects')) return json([project, project2]);
    if (/\/projects\/[0-9a-f-]+$/.test(p)) return json(project);
    if (/\/dashboard\/projects\/[^/]+$/.test(p)) return json(stats);
    if (p.endsWith('/analytics')) return json(analytics);
    if (p.endsWith('/onboarding')) return json(onboarding);
    if (p.endsWith('/endpoints')) return json(paged(endpoints));
    if (p.endsWith('/events')) return json(paged(events));
    if (p.endsWith('/deliveries')) return json(paged(deliveries));
    if (p.endsWith('/subscriptions')) return json(paged(subscriptions));
    if (p.endsWith('/members')) return json([{ id: 'm1', userId: 'u1', email: 'vadym@hookflow.dev', fullName: 'Vadym K', role: 'OWNER', status: 'ACTIVE', createdAt: iso(9e8) }]);
    if (p.endsWith('/tunnels')) return json([]);
    if (p.endsWith('/api-keys')) return json([]);
    return json(paged([]));
  });

  await page.addInitScript((u) => {
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('theme', 'light');
  }, user);

  await page.goto('http://localhost:5173/admin/projects/11111111-1111-1111-1111-111111111111/events');
  await page.waitForTimeout(2500);
  return { url: page.url() };
}
