async (page) => {
  const PID = '11111111-1111-1111-1111-111111111111';
  await page.goto(`http://localhost:5173/admin/projects/${PID}/events`);
  await page.waitForTimeout(2200);
  const m = await page.evaluate(() => {
    const nav = document.querySelector('aside nav');
    const aside = document.querySelector('aside');
    return {
      navScrollHeight: nav?.scrollHeight,
      navClientHeight: nav?.clientHeight,
      overflows: nav ? nav.scrollHeight > nav.clientHeight : null,
      railItems: aside ? [...aside.querySelectorAll('nav a')].map(a => a.textContent.trim()) : [],
      tabs: [...document.querySelectorAll('[role="tab"]')].map(a => a.textContent.trim()),
    };
  });
  await page.screenshot({ path: '.playwright-mcp/shell-events.png', scale: 'css' });
  return m;
}
