async (page) => {
  const PID = '11111111-1111-1111-1111-111111111111';
  await page.goto(`http://localhost:5173/admin/projects/${PID}/events`);
  await page.waitForTimeout(1500);
  // expand advanced + all collapsed sections
  await page.evaluate(() => {
    const clickAll = () => {
      document.querySelectorAll('aside button').forEach(b => {
        const t = (b.textContent||'').toLowerCase();
        if (t.includes('розширен') || t.includes('advanced')) b.click();
      });
    };
    clickAll();
  });
  await page.waitForTimeout(600);
  // open every collapsed section header (chevron-right ones)
  for (let i = 0; i < 6; i++) {
    const opened = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('aside nav button').forEach(b => {
        const svg = b.querySelector('svg.lucide-chevron-right');
        if (svg) { b.click(); n++; }
      });
      return n;
    });
    if (!opened) break;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(600);
  const nav = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    const items = [...aside.querySelectorAll('a,button')].map(el => (el.textContent||'').trim().replace(/\s+/g,' ')).filter(Boolean);
    const navEl = aside.querySelector('nav');
    return { count: items.length, items, navScrollHeight: navEl?.scrollHeight, navClientHeight: navEl?.clientHeight };
  });
  await page.screenshot({ path: '.playwright-mcp/shot-nav-expanded.png', scale: 'css' });
  return nav;
}
