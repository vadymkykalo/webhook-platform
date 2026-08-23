// Captures the real admin, redesigned, into public/shots/ for the landing page.
// Run AFTER the admin workstreams have landed. Reuses the same fixtures the
// mock harness uses so the screenshots show a plausible, busy account rather
// than an empty one.
async (page) => {
  const PID = '11111111-1111-1111-1111-111111111111';
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();

  const user = {
    user: { id: 'u1', email: 'alex@acme.com', fullName: 'Alex Rivera', status: 'ACTIVE', emailVerified: true, createdAt: iso(9e9) },
    organization: { id: 'o1', name: 'Acme Payments', createdAt: iso(9e9) },
    role: 'OWNER',
  };
  const project = { id: PID, name: 'Production', description: 'Live traffic', schemaValidationEnabled: true, schemaValidationPolicy: 'WARN', idempotencyPolicy: 'STRICT', createdAt: iso(9e9), updatedAt: iso(1e7) };
  const project2 = { id: '22222222-2222-2222-2222-222222222222', name: 'Staging', description: 'Pre-prod', schemaValidationEnabled: false, schemaValidationPolicy: 'OFF', idempotencyPolicy: 'NONE', createdAt: iso(5e9), updatedAt: iso(1e7) };

  const endpoints = [
    { id: 'e1', projectId: PID, url: 'https://api.acme.com/hooks/orders', description: 'Order service', enabled: true, verificationStatus: 'VERIFIED', mtlsEnabled: false, rateLimitPerSecond: 50, createdAt: iso(9e8), updatedAt: iso(1e7) },
    { id: 'e2', projectId: PID, url: 'https://billing.acme.com/webhooks', description: 'Billing', enabled: true, verificationStatus: 'VERIFIED', mtlsEnabled: true, createdAt: iso(8e8), updatedAt: iso(1e7) },
    { id: 'e3', projectId: PID, url: 'https://hooks.partner.io/v2/inbound', description: 'Partner sync', enabled: false, verificationStatus: 'FAILED', createdAt: iso(4e8), updatedAt: iso(2e6) },
  ];
  const TYPES = ['order.completed', 'payment.failed', 'user.created', 'invoice.finalized', 'subscription.canceled'];
  const events = Array.from({ length: 14 }, (_, i) => ({
    id: `evt_${(1e9 + i * 7919).toString(36)}`, projectId: PID, eventType: TYPES[i % 5],
    payload: JSON.stringify({ id: `obj_${i}`, amount: 1200 + i * 37, currency: 'USD' }),
    createdAt: iso(i * 6e5), deliveriesCreated: (i % 3) + 1,
  }));
  const deliveries = Array.from({ length: 16 }, (_, i) => ({
    id: `dlv_${(2e9 + i * 6271).toString(36)}`, eventId: events[i % 14].id,
    endpointId: endpoints[i % 3].id, subscriptionId: 's1',
    status: ['SUCCESS', 'SUCCESS', 'SUCCESS', 'SUCCESS', 'FAILED', 'PENDING', 'SUCCESS', 'DLQ'][i % 8],
    attemptCount: (i % 5) + 1, maxAttempts: 8,
    createdAt: iso(i * 4e5), lastAttemptAt: iso(i * 4e5 - 1000),
    succeededAt: i % 8 < 4 ? iso(i * 4e5 - 500) : undefined,
  }));
  const subscriptions = endpoints.map((e, i) => ({
    id: `s${i}`, projectId: PID, endpointId: e.id, eventType: ['order.*', 'payment.failed', '*'][i],
    enabled: true, createdAt: iso(9e8), updatedAt: iso(1e7),
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
    failed: 40 + (i % 7) * 9, avgLatencyMs: 120 + (i % 5) * 22,
  }));
  const analytics = {
    timeRange: { from: iso(864e5), to: iso(0), granularity: 'HOUR' },
    overview: { totalEvents: 71204, totalDeliveries: 184203, successfulDeliveries: 182710, failedDeliveries: 1108, successRate: 99.19, avgLatencyMs: 142, p50LatencyMs: 96, p95LatencyMs: 410, p99LatencyMs: 1180, eventsPerSecond: 0.82, deliveriesPerSecond: 2.13 },
    deliveryTimeSeries: series, latencyTimeSeries: series,
    eventTypeBreakdown: TYPES.slice(0, 4).map((t, i) => ({ eventType: t, count: 30000 - i * 7000, percentage: 42 - i * 9, successCount: 29800 - i * 7000, successRate: 99.4 - i * 0.7 })),
    endpointPerformance: endpoints.map((e, i) => ({ endpointId: e.id, url: e.url, enabled: e.enabled, totalDeliveries: 90000 - i * 22000, successfulDeliveries: 89100 - i * 22500, failedDeliveries: 900 + i * 400, successRate: [99.7, 98.4, 91.2][i], avgLatencyMs: 110 + i * 60, p95LatencyMs: 300 + i * 200, lastDeliveryAt: iso(i * 6e4), status: ['HEALTHY', 'HEALTHY', 'FAILING'][i] })),
    latencyPercentiles: { p50: 96, p75: 180, p90: 320, p95: 410, p99: 1180, max: 4200 },
  };
  const paged = (c) => ({ content: c, totalElements: c.length, totalPages: 1, size: 20, number: 0, first: true, last: true, empty: !c.length });

  await page.route('**/api/v1/**', async (route) => {
    const p = route.request().url().split('?')[0];
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (p.endsWith('/auth/refresh')) return json({ accessToken: 'tok', refreshToken: 'r', emailVerified: true });
    if (p.endsWith('/auth/me')) return json(user);
    if (p.endsWith('/api/v1/projects')) return json([project, project2]);
    if (/\/projects\/[0-9a-f-]+$/.test(p)) return json(project);
    if (/\/dashboard\/projects\/[^/]+$/.test(p)) return json(stats);
    if (p.endsWith('/analytics')) return json(analytics);
    if (p.endsWith('/onboarding')) return json({ hasEndpoints: true, hasSubscriptions: true, hasApiKeys: true, hasEvents: true, hasDeliveries: true, hasIncomingSources: false, hasIncomingDestinations: false });
    if (p.endsWith('/endpoints')) return json(paged(endpoints));
    if (p.endsWith('/events')) return json(paged(events));
    if (p.includes('/deliveries')) return json(paged(deliveries));
    if (p.endsWith('/subscriptions')) return json(paged(subscriptions));
    return json(paged([]));
  });

  await page.addInitScript((u) => {
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('theme', 'light');
    localStorage.setItem('sidebar-collapsed', '0');
  }, user);

  // Retina, so the landing can show them at half size and stay crisp.
  await page.setViewportSize({ width: 1440, height: 900 });

  const shots = [
    ['dashboard', `/admin/dashboard`],
    ['deliveries', `/admin/projects/${PID}/deliveries`],
    ['connections', `/admin/projects/${PID}/connections`],
    ['events', `/admin/projects/${PID}/events`],
    ['analytics', `/admin/projects/${PID}/analytics`],
  ];
  const out = [];
  for (const [name, path] of shots) {
    await page.goto('http://localhost:5173' + path);
    await page.waitForTimeout(2600);
    const target = 'webhook-platform-ui/public/shots/' + name + '.png';
    await page.screenshot({ path: target, scale: 'device', animations: 'disabled' });
    out.push({ name, url: page.url(), height: await page.evaluate(() => document.body.scrollHeight) });
  }
  return out;
}
