async (page) => {
  const OUT = '/home/vadym/myselfspace/webhook-platform/.playwright-mcp/shots-auth';
  const routes = [
    ['login', '/login'],
    ['register', '/register'],
    ['forgot', '/forgot-password'],
    ['reset', '/reset-password?token=x'],
    ['reset-invalid', '/reset-password'],
    ['verify', '/verify-email?token=x'],
    ['invite', '/accept-invite?token=x&orgId=o1'],
    ['device', '/device?code=ABCD-1234'],
  ];

  // Auth endpoints: make them fail deterministically so outcome screens land on
  // their error state rather than hanging on the spinner.
  await page.route('**/api/v1/**', (route) => {
    const u = route.request().url();
    if (u.includes('/auth/refresh') || u.includes('/auth/me')) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'This link has expired. Ask for a new one.' }),
    });
  });

  const done = [];
  for (const theme of ['light', 'dark']) {
    for (const [name, path] of routes) {
      await page.addInitScript((t) => {
        localStorage.setItem('theme', t);
        localStorage.removeItem('auth_user');
      }, theme);
      await page.setViewportSize({ width: 1440, height: 950 });
      await page.goto('http://localhost:5173' + path);
      await page.waitForTimeout(1200);
      const f = `${OUT}/auth-${name}-${theme}.png`;
      try {
      await page.screenshot({ path: f, animations: 'disabled', caret: 'hide', timeout: 15000 });
      done.push(f); } catch (e) { done.push(f + ' FAILED: ' + e.message); }
    }
  }

  // 390px check, light only — the layout drops the left panel below lg.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, path] of routes) {
    await page.goto('http://localhost:5173' + path);
    await page.waitForTimeout(900);
    const f = `${OUT}/auth-${name}-390.png`;
    try {
    await page.screenshot({ path: f, fullPage: true, animations: 'disabled', caret: 'hide', timeout: 15000 });
    done.push(f); } catch (e) { done.push(f + ' FAILED: ' + e.message); }
  }
  return done;
}
