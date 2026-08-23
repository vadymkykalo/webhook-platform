async (page) => {
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2000);
  const ys = [1233, 2236, 3777, 4782, 7412, 10193, 12150];
  for (const y of ys) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `.playwright-mcp/land-${y}.png`, scale: 'css' });
  }
  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
  await page.screenshot({ path: '.playwright-mcp/land-mobile.png', scale: 'css' });
  await page.goto('http://localhost:5173/admin/projects/11111111-1111-1111-1111-111111111111/events');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: '.playwright-mcp/admin-mobile.png', scale: 'css' });
  await page.setViewportSize({ width: 1440, height: 900 });
  return 'ok';
}
