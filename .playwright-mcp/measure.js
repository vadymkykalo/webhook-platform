async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => ({
    scrollHeight: document.body.scrollHeight,
    sections: [...document.querySelectorAll('section')].map(s => ({
      h: Math.round(s.offsetHeight),
      head: (s.querySelector('h2,h1')||{}).textContent?.replace(/\s+/g,' ').slice(0,64)
    })),
    hardcodedViolet: [...document.querySelectorAll('*')].filter(el => {
      const s = getComputedStyle(el);
      return /rgb\((12[0-9]|1[0-3][0-9]), *(5[0-9]|6[0-9]), *(23[0-9]|2[0-4][0-9])\)/.test(s.backgroundColor)
        || /gradient/.test(s.backgroundImage) && /124, 58, 237|109, 40, 217|139, 92, 246/.test(s.backgroundImage);
    }).length,
  }));
  await page.screenshot({ path: '.playwright-mcp/landing-now.png', scale: 'css', animations: 'disabled' });
  return m;
}
