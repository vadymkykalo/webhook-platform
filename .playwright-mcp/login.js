async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173/login');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '.playwright-mcp/login-light.png', scale: 'css', animations: 'disabled' });
  await page.evaluate(() => { localStorage.setItem('theme','dark'); document.documentElement.classList.add('dark'); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.playwright-mcp/login-dark.png', scale: 'css', animations: 'disabled' });
  await page.evaluate(() => { localStorage.setItem('theme','light'); document.documentElement.classList.remove('dark'); });
  return 'ok';
}
