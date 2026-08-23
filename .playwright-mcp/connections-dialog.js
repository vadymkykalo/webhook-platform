// Walks the "New connection" dialog end to end and shoots each step.
async (page) => {
  const PID = '11111111-1111-1111-1111-111111111111';
  const user = {
    user: { id: 'u1', email: 'vadym@hookflow.dev', fullName: 'Vadym K', status: 'ACTIVE', emailVerified: true, createdAt: '2026-01-01T00:00:00Z' },
    organization: { id: 'o1', name: 'Acme Payments', createdAt: '2026-01-01T00:00:00Z' },
    role: 'OWNER',
  };
  const project = { id: PID, name: 'Production', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', schemaValidationEnabled: false, schemaValidationPolicy: 'OFF', idempotencyPolicy: 'NONE' };
  const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
  const endpoints = [
    { id: 'e1', projectId: PID, url: 'https://api.acme.com/hooks/orders', description: 'Order service', enabled: true, verificationStatus: 'VERIFIED', createdAt: iso(9e8), updatedAt: iso(1e7) },
  ];
  const eventTypes = ['order.created', 'order.updated', 'payment.succeeded'].map((name, i) => ({
    id: 'et' + i, projectId: PID, name, description: null, latestVersion: 1, activeVersionStatus: 'ACTIVE', hasBreakingChanges: false, createdAt: iso(9e8), updatedAt: iso(1e7),
  }));
  const paged = (content) => ({ content, totalElements: content.length, totalPages: 1, size: 20, number: 0, first: true, last: true, empty: content.length === 0 });

  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const method = req.method();
    const p = req.url().split('?')[0];
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (p.endsWith('/auth/refresh')) return json({ accessToken: 'fake.jwt.token', refreshToken: 'r', emailVerified: true });
    if (p.endsWith('/auth/me')) return json(user);
    if (p.endsWith('/api/v1/projects')) return json([project]);
    if (method === 'POST' && p.endsWith('/endpoints')) {
      const body = req.postDataJSON();
      return json({ id: 'e-new', projectId: PID, url: body.url, description: body.description, enabled: true, verificationStatus: 'PENDING', secret: body.secret, createdAt: iso(0), updatedAt: iso(0) });
    }
    if (method === 'POST' && /\/endpoints\/[^/]+\/test$/.test(p)) {
      return json({ success: true, httpStatusCode: 200, latencyMs: 142, message: 'Endpoint responded 200 OK' });
    }
    if (method === 'POST' && p.endsWith('/subscriptions')) {
      return json({ id: 's-new', projectId: PID, endpointId: 'e-new', eventType: 'order.created', enabled: true, orderingEnabled: false, maxAttempts: 7, timeoutSeconds: 30, retryDelays: '60,300,900,3600,21600,86400', payloadTemplate: null, customHeaders: null, transformationId: null, transformationName: null, createdAt: iso(0), updatedAt: iso(0) });
    }
    if (/\/deliveries\/projects\//.test(p)) return json(paged([]));
    if (/\/api\/v1\/projects\/[0-9a-f-]+$/.test(p)) return json(project);
    if (p.endsWith('/endpoints')) return json(paged(endpoints));
    if (p.endsWith('/subscriptions')) return json([]);
    if (p.endsWith('/schemas')) return json(eventTypes);
    return json(paged([]));
  });

  await page.addInitScript((u) => {
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('theme', 'light');
    localStorage.setItem('i18n_lng', 'en');
  }, user);

  const shot = async (name) => {
    await page.addStyleTag({ path: '/tmp/claude-1000/tw-out.css' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/home/vadym/myselfspace/webhook-platform/.playwright-mcp/conn-dialog-${name}.png` });
  };

  await page.goto(`http://localhost:5173/admin/projects/${PID}/connections`);
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: 'New connection' }).click();
  await page.waitForTimeout(400);
  await page.getByLabel('Endpoint URL').fill('https://api.acme.com/hooks/refunds');
  await shot('1-url');

  await page.getByRole('button', { name: 'Create Endpoint' }).click();
  await page.waitForTimeout(700);
  await shot('2-secret');

  // reveal the secret to prove the toggle works
  await page.getByRole('button', { name: 'Reveal secret' }).click();
  await page.waitForTimeout(200);
  await shot('2-secret-revealed');

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Send Test Ping' }).click();
  await page.waitForTimeout(600);
  await shot('3-test');

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '+ order.created' }).click();
  await page.waitForTimeout(200);
  await shot('4-events');

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(300);
  await shot('5-retry');

  const dark = await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    return document.documentElement.className;
  });
  await page.waitForTimeout(300);
  await shot('5-retry-dark');
  return { dark };
}
