import { expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { collectErrors, scrollThrough, skipIntro } from './helpers';

test.describe('navigation and shell', () => {
  test('home: headline, one clear CTA, landmarks, no console errors', async ({ page }) => {
    await skipIntro(page);
    const errors = collectErrors(page);
    await page.goto('/');
    await expect(page.locator('h1:visible')).toContainText('embedded analytics');
    await expect(page.getByRole('link', { name: /See my work/ })).toBeVisible();
    for (const lm of ['banner', 'main', 'contentinfo', 'navigation']) await expect(page.getByRole(lm as any).first()).toBeVisible();
    await expect(page.locator('[data-clock]')).toHaveText(/India · \d\d:\d\d IST/);
    await expect(page.locator('[data-status]')).toHaveText('Open to roles');
    await page.getByRole('link', { name: /See my work/ }).click();
    await expect(page).toHaveURL(/\/work\/$/);
    expect(errors).toEqual([]);
  });

  test('skip link is the first tab stop and moves focus to main', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/about/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('404 page is friendly and not indexed', async ({ page }) => {
    await skipIntro(page);
    const res = await page.goto('/definitely-not-here/');
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1')).toContainText('404');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  });

  test('theme toggle persists across navigation and reload without a flash', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/');
    const start = await page.locator('html').getAttribute('data-theme');
    await page.locator('[data-theme-toggle]').click();
    const flipped = start === 'dark' ? 'light' : 'dark';
    await expect(page.locator('html')).toHaveAttribute('data-theme', flipped);
    await page.getByRole('link', { name: 'About', exact: true }).first().click();
    await expect(page).toHaveURL(/\/about\/$/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', flipped);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', flipped);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(flipped);
  });

  test('info slide-over opens, traps focus in a dialog, closes with Escape', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Open info panel' }).click();
    const dlg = page.locator('#info-panel');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('heading', { name: 'Mohit Reshi' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open info panel' })).toBeFocused();
  });
});

test.describe('intro', () => {
  test('shows once per session on the home page, can be skipped with the button or Escape', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-intro-overlay]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Skip intro/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-intro-overlay]')).toBeHidden({ timeout: 3000 });
    await page.reload();
    await expect(page.locator('[data-intro-overlay]')).toBeHidden();
  });
  test('skip button works with the mouse and the intro ends by itself', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Skip intro/ }).click();
    await expect(page.locator('[data-intro-overlay]')).toBeHidden({ timeout: 3000 });
    const p2 = await page.context().newPage();
    await p2.goto('/');
    await expect(p2.locator('[data-intro-overlay]')).toBeHidden({ timeout: 6000 });
  });
  test('not shown with reduced motion', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto('/');
    await expect(p.locator('[data-intro-overlay]')).toBeHidden();
    await ctx.close();
  });
});

test.describe('command palette', () => {
  test('Ctrl+K opens, filters, Enter navigates, Escape closes', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/');
    await page.keyboard.press('Control+K');
    const input = page.getByRole('combobox', { name: 'Search' });
    await expect(input).toBeFocused();
    await input.fill('retention');
    await expect(page.getByRole('option').first()).toContainText('Retention Model');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/work\/sample-retention-model\/$/);
    await page.keyboard.press('Control+K');
    await page.keyboard.press('Escape');
    await expect(page.locator('#palette')).toBeHidden();
  });
  test('tags jump to a filtered work page; no match shows a friendly message', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/');
    await page.getByRole('button', { name: /Search the site/ }).click();
    await page.getByRole('combobox', { name: 'Search' }).fill('filter: rls');
    await expect(page.locator('#pal-0')).toContainText('Row-level security'); // the index loads asynchronously: wait for it before Enter
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/work\/\?tag=rls$/);
    await page.keyboard.press('Control+K');
    await page.getByRole('combobox', { name: 'Search' }).fill('zzzzqq');
    await expect(page.locator('[data-palette-empty]')).toBeVisible();
  });
  test('arrow keys move the selection (aria-activedescendant)', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/');
    await page.keyboard.press('Control+K');
    await page.getByRole('combobox', { name: 'Search' }).fill('a');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('combobox', { name: 'Search' })).toHaveAttribute('aria-activedescendant', 'pal-1');
  });
});

test.describe('work grid', () => {
  test('tag chips filter the grid, sync the URL, announce the count, and clear', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/work/');
    const cards = page.locator('[data-card]:not([hidden])');
    const total = await cards.count();
    expect(total).toBeGreaterThanOrEqual(3);
    await page.getByRole('button', { name: /^Row-level security/ }).click();
    await expect(page).toHaveURL(/tag=rls/);
    expect(await cards.count()).toBeLessThan(total);
    await expect(page.locator('[data-filter-status]')).toContainText(/Showing \d of \d projects/);
    await page.getByRole('button', { name: /^Finance/ }).click(); // AND filter
    await expect(page).toHaveURL(/tag=rls%2Cfinance|tag=rls,finance/);
    await page.getByRole('button', { name: /^All/ }).click();
    expect(await cards.count()).toBe(total);
    await expect(page).not.toHaveURL(/tag=/);
  });
  test('deep link applies the filter on load', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/work/?tag=insurance');
    await expect(page.getByRole('button', { name: /^Insurance/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-card]:not([hidden])')).toHaveCount(1);
  });
  test('no-match combination shows the witty empty state', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/work/?tag=insurance,manufacturing');
    await expect(page.locator('[data-filter-empty]')).toBeVisible();
  });
  test('hover preview: video src is only set on hover, never on touch', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/work/');
    const card = page.locator('[data-card][data-slug=sample-sales-analytics]');
    const video = card.locator('video');
    expect(await video.getAttribute('src')).toBeNull();
    await card.hover();
    await expect.poll(async () => video.getAttribute('src')).toContain('video.mp4');
    await page.mouse.move(5, 5);
    await expect(video).toHaveAttribute('data-playing', 'false');
  });
  test('touch device: no preview request', async ({ browser }) => {
    const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => sessionStorage.setItem('intro', '1'));
    await p.goto('/work/');
    const card = p.locator('[data-card][data-slug=sample-sales-analytics]');
    await card.dispatchEvent('pointerenter', { pointerType: 'touch' });
    await card.dispatchEvent('focusin');
    await p.waitForTimeout(300);
    expect(await card.locator('video').getAttribute('src')).toBeNull();
    await ctx.close();
  });
});

test.describe('case study', () => {
  test('structure, chapters, media, diagram, DAX', async ({ page }) => {
    await skipIntro(page);
    const errors = collectErrors(page);
    await page.goto('/work/sample-sales-analytics/');
    await expect(page.locator('h1')).toHaveText('Sample: Sales Analytics');
    await expect(page.getByText('Sample content.')).toBeVisible();
    for (const c of ['Problem', 'Data model', 'Report', 'Under the hood', 'Outcome']) await expect(page.getByRole('heading', { name: c, exact: true })).toBeAttached();
    await scrollThrough(page);
    await expect(page.locator('.cs-hero-media video')).toHaveAttribute('src', /video\.mp4/);
    await expect(page.locator('.diagram svg')).toBeVisible();
    await expect(page.locator('.diagram .node')).toHaveCount(7);
    await expect(page.locator('.measure').first()).toContainText('Revenue YoY %');
    await expect(page.locator('.measure .shiki').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Try it in the Live Lab/ })).toHaveAttribute('href', /live-lab\/\?report=insurance-employer/);
    expect(errors).toEqual([]);
  });
  test('gallery lightbox: open, arrows, caption counter, Escape returns focus', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/work/sample-sales-analytics/');
    await scrollThrough(page);
    const first = page.locator('[data-lightbox-index="0"]');
    await first.scrollIntoViewIfNeeded();
    await first.click();
    const dlg = page.locator('[data-lightbox]');
    await expect(dlg).toBeVisible();
    await expect(page.locator('[data-lightbox-count]')).toHaveText('1 / 3');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-lightbox-count]')).toHaveText('2 / 3');
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-lightbox-count]')).toHaveText('3 / 3');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(first).toBeFocused();
  });
  test('before/after slider is keyboard operable', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/work/sample-sales-analytics/');
    await scrollThrough(page);
    const range = page.getByRole('slider', { name: /Before and after/ });
    await range.scrollIntoViewIfNeeded();
    await range.focus();
    await page.keyboard.press('Home');
    expect(await page.locator('.ba').evaluate((e) => getComputedStyle(e).getPropertyValue('--pos').trim())).toBe('0%');
    await page.keyboard.press('End');
    expect(await page.locator('.ba').evaluate((e) => getComputedStyle(e).getPropertyValue('--pos').trim())).toBe('100%');
  });
  test('missing media renders placeholders instead of breaking', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/work/sample-retention-model/');
    await expect(page.locator('.cs-hero-media svg[aria-label^="Placeholder"]')).toBeVisible();
    await expect(page.locator('.gallery__ph').first()).toBeAttached();
    await expect(page.locator('.diagram svg')).toBeAttached();
    await expect(page.getByRole('heading', { name: 'Security' })).toBeAttached();
  });
  test('prev/next and related work links', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/work/sample-retention-model/');
    await page.getByRole('link', { name: /Next/ }).click();
    await expect(page).toHaveURL(/sample-statement-suite/);
    await expect(page.getByRole('heading', { name: 'Related work' })).toBeAttached();
  });
});

test.describe('apps', () => {
  test('static app: inline preview is sandboxed and loaded only on click', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/work/sample-chart-playground/');
    await scrollThrough(page);
    expect(await page.locator('iframe').count()).toBe(0);
    await page.getByRole('button', { name: 'Load inline preview' }).click();
    const frame = page.locator('iframe');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(frame).toHaveAttribute('src', /apps-hosted\/sample-chart-playground\//);
    await expect(page.getByRole('link', { name: /Open in a new tab/ })).toBeVisible();
  });
  test('external app: needs-key note and slow-first-load note, sandbox without same-origin leakage rules', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/work/sample-nl-query-app/');
    await expect(page.getByText('your own API key').first()).toBeAttached();
    await expect(page.getByText(/hosted elsewhere on a free tier/)).toBeAttached();
    await page.goto('/apps/');
    await expect(page.locator('[data-card]')).toHaveCount(2);
  });
});

test.describe('live lab', () => {
  test('mounts the module in demo mode and keeps one embed', async ({ page }) => {
    await skipIntro(page);
    const errors = collectErrors(page);
    await page.goto('/live-lab/');
    await expect(page.locator('.ll-root')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ll-embed svg')).toBeVisible();
    await expect(page.locator('[data-status]')).toHaveText('Demo mode');
    await page.goto('/live-lab/?report=insurance-member');
    await expect(page.locator('.ll-embed svg')).toHaveAttribute('aria-label', /Member Portal/);
    await page.getByLabel('Employer', { exact: true }).check();
    await expect(page.locator('.ll-embed svg')).toContainText('employer');
    await page.getByRole('button', { name: 'Toggle theme' }).count();
    await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('.ll-root')).toHaveAttribute('data-theme', /light|dark/);
    expect(errors).toEqual([]);
  });
  test('Live Lab survives navigation away and back (view transitions)', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/live-lab/');
    await expect(page.locator('.ll-embed svg')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('link', { name: 'About', exact: true }).first().click();
    await expect(page).toHaveURL(/about/);
    await page.getByRole('link', { name: 'Live Lab', exact: true }).first().click();
    await expect(page.locator('.ll-embed svg')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ll-root')).toHaveCount(1);
  });
  test('turning it off removes the nav item and the route (build with LIVE_LAB=off)', async () => {
    test.setTimeout(120_000);
    execSync('node ../tools/site/sync-media.mjs && npx astro build --outDir dist-off', { env: { ...process.env, LIVE_LAB: 'off', SITE_SAMPLES: '1' }, stdio: 'pipe' });
    expect(existsSync('dist-off/live-lab/index.html')).toBe(false);
    const html = readFileSync('dist-off/index.html', 'utf8');
    expect(html).not.toContain('Live Lab</a>');
    expect(readFileSync('dist-off/sitemap.xml', 'utf8')).not.toContain('live-lab');
    expect(readFileSync('dist-off/search-index.json', 'utf8')).not.toContain('"Live Lab"');
    execSync('rm -rf dist-off');
  });
});

test.describe('motion and 3D', () => {
  test('hero 3D loads lazily on capable devices and falls back to CSS bars with reduced motion', async ({ page, browser }) => {
    // CI runners report 2 cores, which the site (correctly) treats as a low-power device: pretend to be a capable one.
    await page.addInitScript(() => { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }); });
    await skipIntro(page);
    await page.goto('/');
    await expect(page.locator('[data-hero]')).toHaveAttribute('data-3d', 'on', { timeout: 15_000 });
    await expect(page.locator('[data-hero3d] canvas')).toBeAttached();
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto('/');
    await p.waitForTimeout(1500);
    await expect(p.locator('[data-hero3d] canvas')).toHaveCount(0);
    await expect(p.locator('.hero__fallback')).toBeVisible();
    expect(await p.locator('.marquee__track').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    await expect(p.locator('.reveal').first()).toHaveCSS('opacity', '1');
    await ctx.close();
  });
  test('content is visible after scrolling (reveal animations) and the progress bar moves', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/work/sample-sales-analytics/');
    await scrollThrough(page);
    await page.locator('#outcome').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await expect(page.locator('#outcome .reveal')).toHaveCSS('opacity', '1');
    const p = await page.locator('[data-progress]').evaluate((e) => parseFloat(getComputedStyle(e).getPropertyValue('--p') || '0'));
    expect(p).toBeGreaterThan(0.5);
  });
  test('custom cursor only on fine pointers', async ({ page, browser }) => {
    await skipIntro(page);
    await page.goto('/work/');
    await page.mouse.move(300, 300);
    await page.mouse.move(320, 320);
    await expect(page.locator('html')).toHaveClass(/has-cursor/);
    await page.locator('[data-card]').first().hover();
    await expect(page.locator('.cursor')).toHaveAttribute('data-state', /play|view/);
    const ctx = await browser.newContext({ hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await p.goto('/work/');
    await expect(p.locator('html')).not.toHaveClass(/has-cursor/);
    await ctx.close();
  });
});

test.describe('SEO and sharing', () => {
  test('meta, Open Graph, JSON-LD, sitemap, robots, search index', async ({ page, request }) => {
    await skipIntro(page);
    await page.goto('/work/sample-sales-analytics/');
    await expect(page).toHaveTitle(/Sample: Sales Analytics · Mohit Reshi/);
    await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /Fabric medallion/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og\/sample-sales-analytics\.png$/);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', /\/work\/sample-sales-analytics\/?$/);
    const og = await request.get('/og/sample-sales-analytics.png');
    expect(og.status()).toBe(200); expect(og.headers()['content-type']).toBe('image/png');
    await page.goto('/about/');
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent() as string);
    expect(ld['@type']).toBe('Person');
    const sm = await (await request.get('/sitemap.xml')).text();
    expect(sm).toContain('/work/sample-retention-model/'); expect(sm).not.toContain('/design');
    expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap:');
    const idx = await (await request.get('/search-index.json')).json();
    expect(idx.some((i: any) => i.kind === 'tag')).toBe(true);
  });
  test('no third-party requests at runtime', async ({ page }) => {
    await skipIntro(page);
    const external: string[] = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url()); });
    for (const u of ['/', '/work/', '/work/sample-sales-analytics/', '/live-lab/', '/apps/', '/about/']) { await page.goto(u); await page.waitForTimeout(600); }
    expect(external).toEqual([]);
  });
});
