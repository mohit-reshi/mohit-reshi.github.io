import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { scrollThrough, skipIntro } from './helpers';

const pages = ['/', '/work/', '/work/sample-sales-analytics/', '/work/sample-retention-model/', '/work/sample-nl-query-app/', '/live-lab/', '/apps/', '/about/', '/design/'];
for (const scheme of ['dark', 'light'] as const) {
  for (const url of pages) {
    test(`axe: ${url} (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      await skipIntro(page);
      await page.goto(url);
      if (url === '/live-lab/') await page.waitForSelector('.ll-root', { timeout: 10_000 });
      await scrollThrough(page);
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const bad = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(bad, bad.join('\n')).toEqual([]);
      await ctx.close();
    });
  }
}
test('keyboard: every interactive element on the work page shows a visible focus indicator', async ({ page }) => {
  await skipIntro(page);
  await page.goto('/work/');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const ok = await page.evaluate(() => { const e = document.activeElement as HTMLElement; if (!e || e === document.body) return true; const cs = getComputedStyle(e); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2; });
    expect(ok).toBe(true);
  }
});
test('mobile: no horizontal scroll on any page', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await skipIntro(page);
  for (const url of pages) {
    await page.goto(url);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${url} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
});
