async (page) => {
  const PID = '11111111-1111-1111-1111-111111111111';
  const pages = [
    ['dashboard', `/admin/dashboard`],
    ['events', `/admin/projects/${PID}/events`],
    ['deliveries', `/admin/projects/${PID}/deliveries`],
    ['endpoints', `/admin/projects/${PID}/endpoints`],
    ['analytics', `/admin/projects/${PID}/analytics`],
    ['connections', `/admin/projects/${PID}/connections`],
    ['projects', `/admin/projects`],
  ];
  const out = [];
  for (const [name, path] of pages) {
    await page.goto('http://localhost:5173' + path);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `.playwright-mcp/shot-${name}.png`, scale: 'css' });
    out.push({ name, url: page.url(), h: await page.evaluate(() => document.body.scrollHeight) });
  }
  return out;
}
