async (page) => {
  const PID = '11111111-1111-1111-1111-111111111111';
  const OUT = '/home/vadym/myselfspace/webhook-platform/.playwright-mcp/an-';

  const user = {
    user: { id: 'u1', email: 'vadym@hookflow.dev', fullName: 'Vadym K', status: 'ACTIVE', emailVerified: true, createdAt: '2026-01-01T00:00:00Z' },
    organization: { id: 'o1', name: 'Acme Payments', createdAt: '2026-01-01T00:00:00Z' },
    role: 'OWNER',
  };
  const project = { id: PID, name: 'Production', description: 'Live traffic', schemaValidationEnabled: true, schemaValidationPolicy: 'WARN', idempotencyPolicy: 'STRICT', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };
  const project2 = { id: '22222222-2222-2222-2222-222222222222', name: 'Staging', description: 'Pre-prod', schemaValidationEnabled: false, schemaValidationPolicy: 'OFF', idempotencyPolicy: 'NONE', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };

  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const day = (n) => new Date(now - n * 864e5).toISOString().slice(0, 10);

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

  const pending = Array.from({ length: 4 }, (_, i) => ({
    id: ['01J8Z4K9', '01J8Z4M2', '01J8Z4N7', '01J8Z4P1'][i] + '-c3f2-7a19-b4de-6e1c9a2f30' + i,
    eventId: 'ev' + i,
    endpointId: endpoints[i % 3].id,
    subscriptionId: 's1',
    status: i === 1 ? 'PROCESSING' : 'PENDING',
    attemptCount: [1, 3, 5, 2][i],
    maxAttempts: 8,
    createdAt: iso(i * 9e5 + 4e5),
    lastAttemptAt: iso(i * 9e5),
  }));

  const stats = {
    deliveryStats: { totalDeliveries: 184203, successfulDeliveries: 182710, failedDeliveries: 1108, pendingDeliveries: 297, dlqDeliveries: 88, successRate: 99.19 },
    recentEvents: events.slice(0, 6).map((e) => ({ id: e.id, type: e.eventType, createdAt: e.createdAt, deliveryCount: e.deliveriesCreated })),
    endpointHealth: endpoints.map((e, i) => ({ id: e.id, url: e.url, enabled: e.enabled, totalDeliveries: 90000 - i * 22000, successfulDeliveries: 89100 - i * 22500, successRate: [99.7, 98.4, 91.2][i] })),
  };

  const emptyStats = {
    deliveryStats: { totalDeliveries: 0, successfulDeliveries: 0, failedDeliveries: 0, pendingDeliveries: 0, dlqDeliveries: 0, successRate: 0 },
    recentEvents: [],
    endpointHealth: [],
  };

  const series = Array.from({ length: 24 }, (_, i) => ({
    timestamp: iso((23 - i) * 36e5),
    total: 6000 + Math.round(Math.sin(i / 3) * 1800) + i * 40,
    success: 5900 + Math.round(Math.sin(i / 3) * 1750) + i * 38,
    failed: 40 + (i % 7) * 9 + (i === 14 ? 620 : 0),
    avgLatencyMs: 120 + (i % 5) * 22 + (i === 14 ? 380 : 0),
  }));

  const analytics = {
    timeRange: { from: iso(864e5), to: iso(0), granularity: 'HOUR' },
    overview: { totalEvents: 71204, totalDeliveries: 184203, successfulDeliveries: 182710, failedDeliveries: 1108, successRate: 99.19, avgLatencyMs: 142, p50LatencyMs: 96, p95LatencyMs: 410, p99LatencyMs: 1180, eventsPerSecond: 0.82, deliveriesPerSecond: 2.13 },
    deliveryTimeSeries: series,
    latencyTimeSeries: series,
    eventTypeBreakdown: ['order.completed', 'payment.failed', 'user.created', 'invoice.finalized', 'subscription.canceled'].map((t, i) => ({ eventType: t, count: 30000 - i * 6200, percentage: 42 - i * 8, successCount: 29800 - i * 6200, successRate: 99.4 - i * 0.7 })),
    endpointPerformance: endpoints.map((e, i) => ({ endpointId: e.id, url: e.url, enabled: e.enabled, totalDeliveries: 90000 - i * 22000, successfulDeliveries: 89100 - i * 22500, failedDeliveries: 900 + i * 400, successRate: [99.7, 98.4, 91.2][i], avgLatencyMs: 110 + i * 60, p95LatencyMs: 300 + i * 200, lastDeliveryAt: iso(i * 6e4), status: ['HEALTHY', 'DEGRADED', 'FAILING'][i] })),
    latencyPercentiles: { p50: 96, p75: 180, p90: 320, p95: 410, p99: 1180, max: 4200 },
  };

  const onboarding = { hasEndpoints: true, hasSubscriptions: true, hasApiKeys: true, hasEvents: true, hasDeliveries: true, hasIncomingSources: false, hasIncomingDestinations: false };

  const alertRules = [
    { id: 'ar1', projectId: PID, name: 'Order webhook failure rate', description: 'Order service is the money path', alertType: 'FAILURE_RATE', severity: 'CRITICAL', channel: 'SLACK', thresholdValue: 5, windowMinutes: 5, endpointId: 'e1', enabled: true, muted: false, snoozedUntil: null, webhookUrl: 'https://hooks.slack.com/services/T000/B000/xxxx', emailRecipients: null, createdAt: iso(9e8), updatedAt: iso(1e7) },
    { id: 'ar2', projectId: PID, name: 'DLQ growing', description: null, alertType: 'DLQ_THRESHOLD', severity: 'WARNING', channel: 'EMAIL', thresholdValue: 50, windowMinutes: 60, endpointId: null, enabled: true, muted: false, snoozedUntil: null, webhookUrl: null, emailRecipients: 'ops@acme.com, oncall@acme.com', createdAt: iso(8e8), updatedAt: iso(1e7) },
    { id: 'ar3', projectId: PID, name: 'Partner endpoint latency', description: 'Partner has been slow all month', alertType: 'LATENCY_THRESHOLD', severity: 'WARNING', channel: 'IN_APP', thresholdValue: 2000, windowMinutes: 15, endpointId: 'e3', enabled: true, muted: true, snoozedUntil: null, webhookUrl: null, emailRecipients: null, createdAt: iso(6e8), updatedAt: iso(1e7) },
    { id: 'ar4', projectId: PID, name: 'Consecutive failures', description: null, alertType: 'CONSECUTIVE_FAILURES', severity: 'INFO', channel: 'WEBHOOK', thresholdValue: 10, windowMinutes: 30, endpointId: null, enabled: false, muted: false, snoozedUntil: null, webhookUrl: 'https://ops.acme.com/hooks/alerts', emailRecipients: null, createdAt: iso(3e8), updatedAt: iso(1e7) },
  ];

  const alertEvents = [
    { id: 'ae1', alertRuleId: 'ar1', projectId: PID, severity: 'CRITICAL', title: 'Failure rate 12.4% on api.acme.com/hooks/orders', message: 'Twelve percent of deliveries to the order service failed in the last five minutes. Most responses were 503.', currentValue: 12.4, thresholdValue: 5, resolved: false, createdAt: iso(9e5) },
    { id: 'ae2', alertRuleId: 'ar2', projectId: PID, severity: 'WARNING', title: 'DLQ passed 50 deliveries', message: 'Eighty-eight deliveries have exhausted their retry ladder.', currentValue: 88, thresholdValue: 50, resolved: false, createdAt: iso(46e5) },
    { id: 'ae3', alertRuleId: 'ar3', projectId: PID, severity: 'WARNING', title: 'p95 latency 2.4s on hooks.partner.io', message: null, currentValue: 2412, thresholdValue: 2000, resolved: false, createdAt: iso(96e5) },
    { id: 'ae4', alertRuleId: 'ar4', projectId: PID, severity: 'INFO', title: 'Ten consecutive failures on billing.internal.acme.com', message: 'Cleared on its own after the billing deploy finished.', currentValue: 10, thresholdValue: 10, resolved: true, resolvedAt: iso(2e7), createdAt: iso(24e6) },
  ];

  const incidents = [
    { id: 'in1', projectId: PID, title: 'Order endpoint returning 503 since 14:02', status: 'OPEN', severity: 'CRITICAL', rcaNotes: null, resolvedAt: null, createdAt: iso(12e5), updatedAt: iso(9e5), timeline: null },
    { id: 'in2', projectId: PID, title: 'Partner sync timing out intermittently', status: 'INVESTIGATING', severity: 'WARNING', rcaNotes: 'Partner confirmed a rate limit change on their side.', resolvedAt: null, createdAt: iso(52e5), updatedAt: iso(2e5), timeline: null },
    { id: 'in3', projectId: PID, title: 'Billing webhooks delayed during deploy', status: 'RESOLVED', severity: 'INFO', rcaNotes: 'Rolling deploy held the ordering buffer for four minutes.', resolvedAt: iso(2e7), createdAt: iso(26e6), updatedAt: iso(2e7), timeline: null },
  ];

  const incidentDetail = {
    ...incidents[0],
    rcaNotes: 'Order service scaled down during a node drain; the pool never came back.',
    timeline: [
      { id: 'tl1', entryType: 'FAILURE', title: 'First 503 from api.acme.com/hooks/orders', detail: 'Attempt 1 of 8 failed with 503 Service Unavailable.', deliveryId: '01J8Z4K9-c3f2-7a19-b4de-6e1c9a2f3000', endpointId: 'e1', createdAt: iso(12e5) },
      { id: 'tl2', entryType: 'RETRY', title: 'Retry ladder reached rung 5', detail: null, deliveryId: null, endpointId: 'e1', createdAt: iso(9e5) },
      { id: 'tl3', entryType: 'NOTE', title: 'Paged the platform team', detail: 'Node drain suspected — checking the autoscaler.', deliveryId: null, endpointId: null, createdAt: iso(6e5) },
      { id: 'tl4', entryType: 'REPLAY', title: 'Replayed 240 deliveries', detail: null, deliveryId: null, endpointId: 'e1', createdAt: iso(3e5) },
    ],
  };

  const usageHistory = Array.from({ length: 30 }, (_, i) => {
    const spike = i === 12;
    return {
      date: day(29 - i),
      eventsCount: 2100 + Math.round(Math.sin(i / 4) * 500) + i * 12,
      deliveriesCount: 6100 + Math.round(Math.sin(i / 4) * 1200) + i * 30,
      successfulDeliveries: 6000 + Math.round(Math.sin(i / 4) * 1150) + i * 29,
      failedDeliveries: 40 + (i % 6) * 11 + (spike ? 380 : 0),
      dlqCount: (i % 9 === 0 ? 6 : 0) + (spike ? 22 : 0),
      incomingEventsCount: 300 + i * 4,
      incomingForwardsCount: 290 + i * 4,
      avgLatencyMs: 120 + (i % 5) * 18,
      p95LatencyMs: 380 + (i % 5) * 40,
    };
  });

  const projectUsage = {
    current: {
      totalEvents: 71204, totalDeliveries: 184203, successfulDeliveries: 182710,
      failedDeliveries: 1108, dlqDeliveries: 88, pendingDeliveries: 297,
      totalIncomingEvents: 9840, totalIncomingForwards: 9611,
      activeEndpoints: 3, activeIncomingSources: 2, activeAlertRules: 4,
    },
    history: usageHistory,
  };

  const billingUsage = {
    events: { current: 71204, limit: 100000, percentUsed: 71.2 },
    endpoints: { current: 3, limit: 25, percentUsed: 12 },
    projects: { current: 2, limit: 2, percentUsed: 100 },
    members: { current: 7, limit: 8, percentUsed: 87.5 },
    rateLimitPerSecond: 50,
    retentionDays: 30,
    periodStart: iso(18 * 864e5),
    periodEnd: iso(-12 * 864e5),
  };

  const paged = (content) => ({ content, totalElements: content.length, totalPages: 1, size: 20, number: 0, first: true, last: true, empty: content.length === 0 });

  // Flip to serve a brand-new project with nothing in it.
  let statsPayload = stats;

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const p = url.split('?')[0];
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (p.endsWith('/auth/refresh')) return json({ accessToken: 'fake.jwt.token', refreshToken: 'r', emailVerified: true });
    if (p.endsWith('/auth/me')) return json(user);
    if (p.endsWith('/api/v1/projects')) return json([project, project2]);
    if (/\/projects\/[0-9a-f-]+$/.test(p)) return json(project);
    if (/\/dashboard\/projects\/[^/]+$/.test(p)) return json(statsPayload);
    if (p.endsWith('/analytics')) return json(analytics);
    if (p.endsWith('/onboarding')) return json(onboarding);
    if (p.endsWith('/billing/usage')) return json(billingUsage);
    if (/\/projects\/[^/]+\/usage$/.test(p)) return json(statsPayload === stats ? projectUsage : { current: null, history: [] });
    if (p.endsWith('/alerts/rules')) return json(statsPayload === stats ? alertRules : []);
    if (p.endsWith('/alerts/events/unresolved-count')) return json({ count: statsPayload === stats ? 3 : 0 });
    if (p.endsWith('/alerts/events')) return json(paged(statsPayload === stats ? alertEvents : []));
    if (p.endsWith('/incidents/open-count')) return json({ count: statsPayload === stats ? 1 : 0 });
    if (/\/incidents\/in1$/.test(p)) return json(incidentDetail);
    if (p.endsWith('/incidents')) return json(paged(statsPayload === stats ? incidents : []));
    if (/\/deliveries\/projects\//.test(p)) return json(paged(statsPayload === stats ? pending : []));
    if (p.endsWith('/endpoints')) return json(paged(endpoints));
    if (p.endsWith('/events')) return json(paged(events));
    if (p.endsWith('/subscriptions')) return json(paged([]));
    if (p.endsWith('/api-keys')) return json([]);
    if (p.endsWith('/tunnels')) return json([]);
    return json(paged([]));
  });

  await page.addInitScript((u) => {
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('hookflow_wizard_seen', 'true');
    localStorage.setItem('i18n_lng', 'en');
  }, user);

  const setTheme = async (theme) => {
    await page.evaluate((t) => {
      localStorage.setItem('theme', t);
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(t);
    }, theme);
  };

  const base = 'http://localhost:5173/admin/projects/' + PID + '/';
  const shots = [];
  const pages = [
    ['dashboard', 'http://localhost:5173/admin/dashboard'],
    ['analytics', base + 'analytics'],
    ['alerts', base + 'alerts'],
    ['incidents', base + 'incidents'],
    ['usage', base + 'usage'],
  ];

  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const [name, url] of pages) {
    for (const theme of ['light', 'dark']) {
      await page.goto(url);
      await setTheme(theme);
      await page.waitForTimeout(2200);
      const file = OUT + name + '-' + theme + '.png';
      await page.screenshot({ path: file, fullPage: true });
      shots.push(file);
    }
  }

  // Expand the first incident so the timeline and RCA editor are visible.
  await page.goto(base + 'incidents');
  await setTheme('light');
  await page.waitForTimeout(1500);
  await page.getByText('Order endpoint returning 503 since 14:02').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + 'incident-expanded-light.png', fullPage: true });
  shots.push(OUT + 'incident-expanded-light.png');

  // A brand-new project: every counter zero, no alerts, no incidents, no usage.
  statsPayload = emptyStats;
  for (const [name, url] of [['dashboard', 'http://localhost:5173/admin/dashboard'], ['usage', base + 'usage']]) {
    await page.goto(url);
    await setTheme('light');
    await page.waitForTimeout(2000);
    const file = OUT + name + '-empty-light.png';
    await page.screenshot({ path: file, fullPage: true });
    shots.push(file);
  }

  // 390px, the responsive floor.
  statsPayload = stats;
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('http://localhost:5173/admin/dashboard');
  await setTheme('light');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: OUT + 'dashboard-390.png', fullPage: true });
  shots.push(OUT + 'dashboard-390.png');

  return { shots };
}
