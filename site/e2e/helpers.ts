import type { Page } from '@playwright/test';

/** Pretend the intro was already seen unless a test wants it. */
export async function skipIntro(page: Page) {
  await page.addInitScript(() => { try { sessionStorage.setItem('intro', '1'); } catch { /* ignore */ } });
}
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text())) errors.push(m.text()); });
  return errors;
}
export async function scrollThrough(page: Page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 600) { await page.mouse.wheel(0, 600); await page.waitForTimeout(80); }
  await page.evaluate(() => window.scrollTo(0, 0));
}
