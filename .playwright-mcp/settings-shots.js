// Settings & organization workstream — mock harness + screenshots.
// Built from mock.js; adds the org-level endpoints those pages call.
async (page) => {
  const PID = '11111111-1111-1111-1111-111111111111';
  const user = {
    user: { id: 'u1', email: 'vadym@hookflow.dev', fullName: 'Vadym K', status: 'ACTIVE', emailVerified: true, createdAt: '2026-01-01T00:00:00Z' },
    organization: { id: 'o1', name: 'Acme Payments', createdAt: '2026-01-01T00:00:00Z' },
    role: 'OWNER',
  };
  const project = { id: PID, name: 'Production', description: 'Live traffic from the checkout and billing services', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };
  const project2 = { id: '22222222-2222-2222-2222-222222222222', name: 'Staging', description: 'Pre-prod', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };

  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const paged = (content, total) => ({ content, totalElements: total ?? content.length, totalPages: Math.max(1, Math.ceil((total ?? content.length) / 20)), size: 20, number: 0, first: true, last: (total ?? content.length) <= 20, empty: content.length === 0 });

  const members = [
    { userId: 'u1', email: 'vadym@hookflow.dev', role: 'OWNER', status: 'ACTIVE', createdAt: iso(9e8) },
    { userId: 'u2', email: 'dana@acme.com', role: 'DEVELOPER', status: 'ACTIVE', createdAt: iso(6e8) },
    { userId: 'u3', email: 'lee@acme.com', role: 'DEVELOPER', status: 'INVITED', createdAt: iso(2e6) },
    { userId: 'u4', email: 'auditor@partner.io', role: 'VIEWER', status: 'ACTIVE', createdAt: iso(3e8) },
  ];

  const plans = [
    { id: 'p1', name: 'free', displayName: 'Free', maxEventsPerMonth: 10000, maxEndpointsPerProject: 5, maxProjects: 3, maxMembers: 5, maxActiveTunnels: 0, rateLimitPerSecond: 10, maxRetentionDays: 7, features: { workflows: false, rules: false, replay: false, mTLS: false, sso: false }, priceMonthlyCents: 0, priceYearlyCents: 0 },
    { id: 'p2', name: 'starter', displayName: 'Starter', maxEventsPerMonth: 100000, maxEndpointsPerProject: 20, maxProjects: 10, maxMembers: 10, maxActiveTunnels: 2, rateLimitPerSecond: 50, maxRetentionDays: 30, features: { workflows: true, rules: true, replay: true, mTLS: false, sso: false }, priceMonthlyCents: 2900, priceYearlyCents: 29000 },
    { id: 'p3', name: 'pro', displayName: 'Pro', maxEventsPerMonth: 1000000, maxEndpointsPerProject: 100, maxProjects: 50, maxMembers: 50, maxActiveTunnels: 10, rateLimitPerSecond: 200, maxRetentionDays: 90, features: { workflows: true, rules: true, replay: true, mTLS: true, sso: false }, priceMonthlyCents: 9900, priceYearlyCents: 99000 },
    { id: 'p4', name: 'enterprise', displayName: 'Enterprise', maxEventsPerMonth: -1, maxEndpointsPerProject: -1, maxProjects: -1, maxMembers: -1, maxActiveTunnels: -1, rateLimitPerSecond: 1000, maxRetentionDays: 365, features: { workflows: true, rules: true, replay: true, mTLS: true, sso: true }, priceMonthlyCents: -1, priceYearlyCents: -1 },
  ];

  const billing = { organizationId: 'o1', plan: plans[1], billingStatus: 'ACTIVE', billingEmail: 'finance@acme.com', usage: { eventsThisMonth: 81240, eventsLimit: 100000, projects: 2, projectsLimit: 10 } };
  const usage = {
    events: { current: 81240, limit: 100000, percentUsed: 81.2 },
    endpoints: { current: 21, limit: 20, percentUsed: 105 },
    projects: { current: 2, limit: 10, percentUsed: 20 },
    members: { current: 4, limit: -1, percentUsed: 0 },
    rateLimitPerSecond: 50, retentionDays: 30,
    periodStart: iso(20 * 864e5), periodEnd: iso(-10 * 864e5),
  };
  const invoices = [
    { id: 'i1', status: 'paid', amountCents: 2900, currency: 'usd', planName: 'Starter', periodStart: iso(50 * 864e5), periodEnd: iso(20 * 864e5), paidAt: iso(20 * 864e5), invoiceUrl: 'https://example.com/i1' },
    { id: 'i2', status: 'paid', amountCents: 2900, currency: 'usd', planName: 'Starter', periodStart: iso(80 * 864e5), periodEnd: iso(50 * 864e5), paidAt: iso(50 * 864e5), invoiceUrl: 'https://example.com/i2' },
  ];

  const apiKeys = [
    { id: 'k1', projectId: PID, name: 'Checkout service', keyPrefix: 'hf_live_9f2a', lastUsedAt: iso(3e5), createdAt: iso(9e8), revokedAt: null, expiresAt: null, scope: 'READ_WRITE' },
    { id: 'k2', projectId: PID, name: 'Analytics reader', keyPrefix: 'hf_live_1c77', lastUsedAt: iso(6e7), createdAt: iso(4e8), revokedAt: null, expiresAt: iso(-30 * 864e5), scope: 'READ_ONLY' },
    { id: 'k3', projectId: PID, name: 'Old CI runner', keyPrefix: 'hf_live_be04', lastUsedAt: null, createdAt: iso(2e9), revokedAt: null, expiresAt: iso(5 * 864e5), scope: 'READ_WRITE' },
  ];

  const tunnels = [
    { id: 't1', organizationId: 'o1', userId: 'u1', projectId: PID, publicSlug: 'brave-otter-41', publicUrl: 'https://brave-otter-41.tunnel.hookflow.dev', localPort: 3000, status: 'ACTIVE', createdAt: iso(12e5), lastHeartbeat: iso(4000), closedAt: null, clientInfo: 'hookflow-cli/2.4.0 darwin' },
    { id: 't2', organizationId: 'o1', userId: 'u2', projectId: null, publicSlug: 'quiet-falcon-08', publicUrl: 'https://quiet-falcon-08.tunnel.hookflow.dev', localPort: 8080, status: 'ACTIVE', createdAt: iso(36e5), lastHeartbeat: iso(9000), closedAt: null, clientInfo: 'hookflow-cli/2.3.1 linux' },
  ];

  const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'ROTATE_SECRET', 'REVOKE', 'LOGIN', 'MEMBER_INVITED', 'MEMBER_ROLE_CHANGED', 'TEST_WEBHOOK'];
  const RES = ['Endpoint', 'ApiKey', 'Project', 'Member', 'Subscription', 'IncomingSource'];
  const auditEntries = Array.from({ length: 20 }, (_, i) => ({
    id: 'a' + i,
    action: ACTIONS[i % ACTIONS.length],
    resourceType: RES[i % RES.length],
    resourceId: '7f3c9a2b-' + i + '-4d1e-9f8a-2b6c4e1d0a55',
    userId: members[i % 4].userId,
    userEmail: members[i % 4].email,
    organizationId: 'o1',
    status: i % 7 === 3 ? 'FAILURE' : 'SUCCESS',
    errorMessage: i % 7 === 3 ? 'Endpoint returned 500 Internal Server Error' : null,
    durationMs: 12 + (i * 7) % 220,
    clientIp: '203.0.113.' + (10 + i),
    details: i % 5 === 0 ? JSON.stringify({ before: { enabled: false }, after: { enabled: true } }) : null,
    createdAt: iso(i * 12e5),
  }));

  const stats = {
    deliveryStats: { totalDeliveries: 184203, successfulDeliveries: 182710, failedDeliveries: 1108, pendingDeliveries: 297, dlqDeliveries: 88, successRate: 99.19 },
    recentEvents: [{ id: 'ev0', type: 'order.completed', createdAt: iso(6e5), deliveryCount: 3 }],
    endpointHealth: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
  };
  const stats2 = { ...stats, deliveryStats: { ...stats.deliveryStats, successRate: 86.4 } };

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const p = url.split('?')[0];
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (p.endsWith('/auth/refresh')) return json({ accessToken: 'fake.jwt.token', refreshToken: 'r', emailVerified: true });
    if (p.endsWith('/auth/me')) return json(user);
    if (p.endsWith('/api/v1/projects')) return json([project, project2]);
    if (/\/projects\/[0-9a-f-]+$/.test(p)) return json(project);
    if (/\/dashboard\/projects\/22222222/.test(p)) return json(stats2);
    if (/\/dashboard\/projects\//.test(p)) return json(stats);
    if (p.endsWith('/members')) return json(members);
    if (p.endsWith('/billing/plans')) return json(plans);
    if (p.endsWith('/billing/organization')) return json(billing);
    if (p.endsWith('/billing/usage')) return json(usage);
    if (p.endsWith('/billing/invoices')) return json(invoices);
    if (p.endsWith('/api-keys')) return json(paged(apiKeys));
    if (p.endsWith('/tunnels/status')) return json({ activeTunnels: 2, pendingRequests: 1, myTunnels: [tunnels[0]] });
    if (p.endsWith('/tunnels')) return json(tunnels);
    if (p.endsWith('/audit-log')) return json({ content: auditEntries, totalElements: 137, totalPages: 7, number: 0, size: 20 });
    if (p.endsWith('/onboarding')) return json({ hasEndpoints: true, hasSubscriptions: true, hasApiKeys: true, hasEvents: true, hasDeliveries: true });
    return json(paged([]));
  });

  await page.addInitScript((u) => {
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('auth_token', 'fake.jwt.token');
    localStorage.setItem('theme', 'light');
    localStorage.setItem('sidebar-collapsed', '0');
  }, user);

  const shots = [];
  const go = async (name, path, width = 1440, height = 1500) => {
    await page.setViewportSize({ width, height });
    await page.goto('http://localhost:5173' + path);
    await page.waitForTimeout(1400);
    const file = '/home/vadym/myselfspace/webhook-platform/.playwright-mcp/set-' + name + '.png';
    await page.screenshot({ path: file, animations: 'disabled', timeout: 15000 });
    shots.push(name + ' ' + page.url());
  };

  await go('settings', '/admin/settings');
  await go('org', '/admin/org-settings');
  await go('members', '/admin/members');
  await go('billing', '/admin/billing');
  await go('audit', '/admin/audit-log');
  await go('projects', '/admin/projects');
  await go('apikeys', '/admin/projects/' + PID + '/api-keys');
  await go('tunnels', '/admin/tunnels');
  await go('404', '/admin/nowhere');
  return shots;
}
