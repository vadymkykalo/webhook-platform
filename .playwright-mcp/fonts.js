async (page) => {
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2500);
  return await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts].map(f => `${f.family} ${f.weight} ${f.status}`);
    const h = document.querySelector('h1') || document.querySelector('h2');
    const body = document.body;
    return {
      loadedFaces: [...new Set(loaded)],
      h1Family: h ? getComputedStyle(h).fontFamily : null,
      h1Weight: h ? getComputedStyle(h).fontWeight : null,
      bodyFamily: getComputedStyle(body).fontFamily,
      bricolageAvailable: document.fonts.check('600 48px "Bricolage Grotesque"'),
    };
  });
}
