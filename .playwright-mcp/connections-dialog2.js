async (page) => {
  const p2 = await page.context().newPage();
  const PID = '11111111-1111-1111-1111-111111111111';
  const user = { user: { id: 'u1', email: 'v@h.dev', fullName: 'V', status: 'ACTIVE' }, organization: { id: 'o1', name: 'Acme' }, role: 'OWNER' };
  const project = { id: PID, name: 'Production', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', schemaValidationEnabled: false, schemaValidationPolicy: 'OFF', idempotencyPolicy: 'NONE' };
  const iso = () => new Date().toISOString();
  const paged = (c) => ({ content: c, totalElements: c.length, totalPages: 1, size: 20, number: 0, first: true, last: true });
  await p2.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const p = req.url().split('?')[0];
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (p.endsWith('/auth/me')) return json(user);
    if (p.endsWith('/auth/refresh')) return json({ accessToken: 't', refreshToken: 'r' });
    if (p.endsWith('/api/v1/projects')) return json([project]);
    if (req.method() === 'POST' && p.endsWith('/endpoints')) {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch (e) { body = {}; }
      return json({ id: 'e-new', projectId: PID, url: body.url || 'https://x', enabled: true, verificationStatus: 'PENDING', secret: body.secret || 'abc', createdAt: iso(), updatedAt: iso() });
    }
    if (/\/api\/v1\/projects\/[0-9a-f-]+$/.test(p)) return json(project);
    if (p.endsWith('/endpoints')) return json(paged([{ id: 'e1', projectId: PID, url: 'https://api.acme.com/hooks/orders', enabled: true, verificationStatus: 'VERIFIED', createdAt: iso(), updatedAt: iso() }]));
    if (p.endsWith('/subscriptions')) return json([]);
    return json(paged([]));
  });
  await p2.addInitScript((u) => {
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('theme', 'light');
    localStorage.setItem('i18n_lng', 'en');
  }, user);
  await p2.setViewportSize({ width: 1440, height: 900 });
  await p2.goto('http://localhost:5173/admin/projects/' + PID + '/connections');
  await p2.waitForTimeout(2000);
  await p2.locator('button:has-text("New connection")').first().click();
  await p2.waitForTimeout(600);
  await p2.locator('#connection-url').fill('https://api.acme.com/hooks/refunds');
  await p2.locator('button[type=submit]').click();
  await p2.waitForTimeout(1000);
  await p2.addStyleTag({ path: '/tmp/claude-1000/tw-out.css' });
  await p2.waitForTimeout(300);
  await p2.locator('[role=dialog]').screenshot({ path: '/home/vadym/myselfspace/webhook-platform/.playwright-mcp/conn-dialog-secret-masked.png', scale: 'device' });
  const box = await p2.evaluate(() => {
    const dlg = document.querySelector('[role=dialog]');
    const r = dlg.getBoundingClientRect();
    const widest = [...dlg.querySelectorAll('*')].reduce((acc, c) => {
      const b = c.getBoundingClientRect();
      return b.right > acc.right ? { right: b.right, cls: String(c.className).slice(0, 60) } : acc;
    }, { right: 0, cls: '' });
    return JSON.stringify({ dlgRight: Math.round(r.right), dlgW: Math.round(r.width), widestRight: Math.round(widest.right), widestCls: widest.cls, scrollW: dlg.scrollWidth, clientW: dlg.clientWidth });
  });
  await p2.close();
  return { box };
}
