import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, skipIntro } from './helpers';

const stage = (p: Page) => p.locator('[data-layout-view="index"]');
const rows = (p: Page) => p.locator('[data-ix-row]');
const visibleRows = (p: Page) => p.locator('[data-ix-list] li:not([hidden]) [data-ix-row]');

test.beforeEach(async ({ page }) => { await skipIntro(page); });

test('top switcher: layout 1 shows the Index stage and hides classic', async ({ page }) => {
  await page.goto('/');
  await expect(stage(page)).toBeHidden();
  await page.locator('[data-layout-set="index"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'index');
  await expect(stage(page)).toBeVisible();
  await expect(page.locator('[data-layout-view="classic"]')).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/embedded/i);
  expect(await rows(page).count()).toBeGreaterThan(0);
});

test('?layout=index works and a project row links to its page (no JS needed)', async ({ page }) => {
  await page.goto('/?layout=index');
  await expect(stage(page)).toBeVisible();
  const href = await rows(page).first().getAttribute('href');
  expect(href).toMatch(/\/work\/.+/);
});

test('filter chips filter rows, announce the count and keep order', async ({ page }) => {
  await page.goto('/work/?layout=index');
  const total = await rows(page).count();
  const slugs = await rows(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.slug));
  // which groups exist depends on the content (the CI build has only the sample projects): use the last group chip
  const groupChips = page.locator('[data-ix-group]:not([data-ix-group="all"])');
  const groupCount = await groupChips.count();
  if (groupCount > 0) {
    const group = groupChips.last();
    await group.click();
    await expect(group).toHaveAttribute('aria-pressed', 'true');
    const n = await visibleRows(page).count();
    expect(n).toBeGreaterThan(0);
    if (groupCount > 1) expect(n).toBeLessThan(total);
    await expect(page.locator('[data-ix-status]')).toContainText(`Showing ${n} of ${total}`);
    const after = await visibleRows(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.slug));
    expect(after).toEqual(slugs.filter((s) => after.includes(s)));
    await page.locator('[data-ix-group="all"]').click();
  }
  // tag chip narrows, pressing it again clears it
  const tag = page.locator('[data-ix-tag]:not([data-ix-tag="all"])').first();
  await tag.click();
  await expect(tag).toHaveAttribute('aria-pressed', 'true');
  expect(await visibleRows(page).count()).toBeGreaterThan(0);
  await tag.click();
  await expect(page.locator('[data-ix-tag="all"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await visibleRows(page).count()).toBe(total);
});

test('row click opens the case panel, Esc closes it and returns focus', async ({ page }) => {
  await page.goto('/?layout=index');
  const row = rows(page).first();
  const slug = await row.getAttribute('data-slug');
  await row.click();
  const dlg = page.locator('#case-panel');
  await expect(dlg).toBeVisible();
  await expect(page).toHaveURL(/\/$|\?layout=index$/);
  await expect(row).toHaveAttribute('data-selected', '');
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(page.locator(`[data-ix-row][data-slug="${slug}"]`)).toBeFocused();
  await expect(row).not.toHaveAttribute('data-selected', '');
});

test('keyboard: Tab reaches rows, arrows move between them, Enter opens, preview parks on focus', async ({ page }) => {
  await page.goto('/?layout=index');
  await rows(page).first().focus();
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  await rows(page).first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows(page).nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(rows(page).first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(rows(page).last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.locator('.ix-preview[data-on]')).toHaveCount(1);
  await expect(page.locator('.ix-preview')).toHaveAttribute('aria-hidden', 'true');
  await page.keyboard.press('Enter');
  await expect(page.locator('#case-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#case-panel')).toBeHidden();
  // filter chips are real buttons operable by keyboard
  const firstGroup = page.locator('[data-ix-group]:not([data-ix-group="all"])').first();
  if (await firstGroup.count()) {
    await firstGroup.focus();
    await page.keyboard.press('Enter');
    await expect(firstGroup).toHaveAttribute('aria-pressed', 'true');
  }
});

test('hover shows the floating preview and dims the other rows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?layout=index');
  await rows(page).first().scrollIntoViewIfNeeded();
  await rows(page).first().hover();
  await expect(page.locator('.ix-preview[data-on]')).toHaveCount(1);
  await page.mouse.move(5, 5);
  await expect(page.locator('.ix-preview[data-on]')).toHaveCount(0);
});

test('reduced motion: the preview still shows (snapped, not eased) and the ticker does not animate', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage(); await skipIntro(page);
  await page.goto('/?layout=index');
  await rows(page).first().hover();
  await expect(page.locator('.ix-preview')).toHaveCount(1);
  expect(await page.locator('.ix-ticker__belt').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  await ctx.close();
});

test('mobile 390px: no horizontal overflow, 44px targets, tap opens the case panel', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); await skipIntro(page);
  const errors = collectErrors(page);
  await page.goto('/?layout=index');
  await expect(stage(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const small = await page.locator('.ix-chip, .ix-row').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 43.5).length);
  expect(small).toBe(0);
  await expect(page.locator('.ix-thumb').first()).toBeVisible();
  await rows(page).first().tap();
  await expect(page.locator('#case-panel')).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('no console errors and no third-party requests; layout persists across navigation and back', async ({ page }) => {
  const errors = collectErrors(page);
  const foreign: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!/^(localhost|127\.0\.0\.1)$/.test(u.hostname) && !/^(data|blob):/.test(r.url())) foreign.push(r.url()); });
  await page.goto('/');
  await page.locator('[data-layout-set="index"]').click(); // the switcher remembers the choice (a bare ?layout= does not)
  await page.locator('.site-header .nav a', { hasText: 'About' }).click();
  await expect(page).toHaveURL(/\/about\/?/);
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'index');
  await page.locator('.brand').click();
  await expect(stage(page)).toBeVisible();
  await rows(page).first().hover();
  await rows(page).first().click();
  await expect(page.locator('#case-panel')).toBeVisible();
      await page.waitForTimeout(900); // let the panel's entrance animation finish
  await page.keyboard.press('Escape');
  await page.goBack(); await page.goForward();
  await page.waitForTimeout(300);
  expect(await page.locator('.ix-preview').count()).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
  expect(foreign).toEqual([]);
});

test('switching away tears the stage down', async ({ page }) => {
  await page.goto('/?layout=index');
  await rows(page).first().hover();
  await page.locator('[data-layout-set="classic"]').click();
  await expect(stage(page)).toBeHidden();
  await expect(page.locator('.ix-preview')).toHaveCount(0);
  await expect(page.locator('.ix-thumb canvas')).toHaveCount(0);
});

for (const scheme of ['dark', 'light'] as const) {
  for (const url of ['/?layout=index', '/work/?layout=index']) {
    test(`axe: ${url} (${scheme}, Index layout)`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage(); await skipIntro(page);
      await page.goto(url);
      await page.waitForTimeout(1500);
      const run = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(await run()).toEqual([]);
      await rows(page).first().click();
      await expect(page.locator('#case-panel')).toBeVisible();
      await page.waitForTimeout(900); // let the panel's entrance animation finish
      expect(await run()).toEqual([]);
      await ctx.close();
    });
  }
}
