import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { scrollThrough, skipIntro } from './helpers';

// Run with: SHOTS=1 npx playwright test e2e/screenshots.spec.ts   (writes docs/site/*.png)
const out = new URL('../../docs/site/', import.meta.url).pathname;
test.skip(!process.env.SHOTS, 'screenshots are opt-in');
mkdirSync(out, { recursive: true });

for (const scheme of ['dark', 'light'] as const) {
  test(`screenshots (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await skipIntro(page);
    const shot = (name: string, full = false) => page.screenshot({ path: `${out}${name}-${scheme}.png`, fullPage: full });
    await page.goto('/'); await page.waitForTimeout(2500); await shot('home');
    await page.goto('/work/'); await page.waitForTimeout(800); await shot('work', true);
    await page.goto('/work/?tag=rls'); await page.waitForTimeout(600); await shot('work-filtered');
    await page.goto('/work/sample-sales-analytics/'); await page.waitForTimeout(800); await scrollThrough(page); await shot('case-study', true);
    await page.goto('/live-lab/?report=insurance-employer'); await page.waitForSelector('.ll-embed svg'); await page.waitForTimeout(500); await shot('live-lab');
    await page.goto('/apps/'); await page.waitForTimeout(600); await shot('apps');
    await page.goto('/design/'); await page.waitForTimeout(600); await shot('design-tokens', true);
    await page.goto('/'); await page.waitForTimeout(800);
    await page.keyboard.press('Control+K'); await page.getByRole('combobox', { name: 'Search' }).fill('rls'); await page.waitForTimeout(400); await shot('palette');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open info panel' }).click(); await page.waitForTimeout(700); await shot('info-panel');
    await ctx.close();
  });
}
test('screenshots: mobile, intro', async ({ browser }) => {
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const mp = await m.newPage(); await skipIntro(mp);
  await mp.goto('/'); await mp.waitForTimeout(1500); await mp.screenshot({ path: `${out}mobile-home.png` });
  await mp.goto('/work/'); await mp.waitForTimeout(800); await mp.screenshot({ path: `${out}mobile-work.png` });
  await m.close();
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('/'); await p.waitForTimeout(1500); await p.screenshot({ path: `${out}intro.png` });
  await c.close();
});
