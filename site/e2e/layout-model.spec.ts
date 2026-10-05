import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectErrors, skipIntro } from './helpers';
// the repo's own WCAG helpers
import { ratio } from '../../tools/validate/contrast.mjs';

const MODEL = '/?layout=model';
const stage = (page: Page) => page.locator('[data-model-stage]');
const ready = async (page: Page) => { await expect(page.locator('[data-model-stage][data-ready]')).toBeVisible(); await expect(page.locator('.mc').first()).toBeVisible(); };
async function explorer(page: Page) { return page.evaluate(() => JSON.parse(document.getElementById('explorer-data')!.textContent || '{}')); }
const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

interface Geo { cards: Array<{ id: string; type: string; x: number; y: number; w: number; h: number }>; lines: Array<{ id: string; pts: number[][] }> }
/** card rectangles and line polylines in diagram units, read from the DOM (the cards are positioned by transform, the lines carry their points) */
const geometry = (page: Page): Promise<Geo> => page.evaluate(() => ({
  cards: [...document.querySelectorAll<HTMLElement>('.mc')].map((c) => { const m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(c.style.transform) || [0, 0, 0]; return { id: c.dataset.node!, type: c.dataset.type!, x: +m[1], y: +m[2], w: parseFloat(c.style.width), h: parseFloat(c.style.height) }; }),
  lines: [...document.querySelectorAll<SVGPathElement>('.mv-edge__line')].map((p) => ({ id: p.parentElement!.dataset.edge!, pts: (p.dataset.pts || '').split(' ').filter(Boolean).map((q) => q.split(',').map(Number)) })),
}));
const MIN_GAP = 48; // 3rem
function overlaps(g: Geo): string[] {
  const bad: string[] = [];
  for (let i = 0; i < g.cards.length; i++) for (let j = i + 1; j < g.cards.length; j++) {
    const a = g.cards[i], b = g.cards[j];
    const gx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), gy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
    if (Math.max(gx, gy) < MIN_GAP) bad.push(`${a.id} / ${b.id} (gap ${Math.round(Math.max(gx, gy))})`);
  }
  return bad;
}
/** segments that are not axis aligned, or that cut through the inside of a card */
function badSegments(g: Geo): string[] {
  const bad: string[] = [];
  for (const l of g.lines) for (let i = 1; i < l.pts.length; i++) {
    const [x1, y1] = l.pts[i - 1], [x2, y2] = l.pts[i];
    if (Math.abs(x1 - x2) > 0.05 && Math.abs(y1 - y2) > 0.05) bad.push(`${l.id}: segment ${i} is diagonal`);
    for (const c of g.cards) if (Math.max(x1, x2) > c.x + 1 && Math.min(x1, x2) < c.x + c.w - 1 && Math.max(y1, y2) > c.y + 1 && Math.min(y1, y2) < c.y + c.h - 1) bad.push(`${l.id}: segment ${i} crosses ${c.id}`);
  }
  return bad;
}
/** the explorer JSON of the page, rewritten to hold n copies of the first project with rotating tags (0, 1, 4, 8, 25 projects) */
async function withProjects(page: Page, n: number) {
  await page.route((u) => u.pathname === '/' || u.pathname === '/work/', async (route) => {
    const res = await route.fetch(); let html = await res.text();
    html = html.replace(/(id="explorer-data"[^>]*>)(.*?)(<\/script>)/s, (_m, a, json, z) => {
      const d = JSON.parse(json.replace(/\\u003c/g, '<'));
      const base = d.projects[0]; const keys: string[] = d.tags.map((t: any) => t.key);
      d.projects = Array.from({ length: n }, (_, i) => {
        const tags = keys.filter((_k, j) => (j + i) % 3 !== 1 || j < 2);
        return { ...base, slug: `report-${i}`, title: `Report ${i + 1}`, tags, href: `/work/report-${i}/`, order: i };
      });
      d.tags = d.tags.map((t: any) => ({ ...t, count: d.projects.filter((p: any) => p.tags.includes(t.key)).length })).filter((t: any) => t.count > 0);
      d.cases = {};
      return a + JSON.stringify(d).replace(/</g, '\\u003c') + z;
    });
    await route.fulfill({ response: res, body: html });
  });
}

test.describe('Model layout', () => {
  test.beforeEach(async ({ page }) => { await skipIntro(page); });

  test('top switcher shows the stage, hides classic, and keeps the choice', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await expect(page.locator('[data-layout-view="classic"]')).toBeVisible();
    await expect(stage(page)).toBeHidden();
    await page.locator('[data-layout-set="model"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'model');
    await ready(page);
    await expect(page.locator('[data-layout-view="classic"]')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Embedded analytics');
    expect(await page.locator('html').getAttribute('data-theme')).toMatch(/dark|light/);
    // every project is a fact table, every skill/platform tag a dimension table
    const d = await explorer(page);
    await expect(page.locator('.mc[data-type="fact"]')).toHaveCount(d.projects.length);
    await expect(page.locator('.mc[data-type="dim"]')).toHaveCount(d.tags.filter((t: any) => t.group !== 'domain').length + d.tags.filter((t: any) => t.group === 'domain' && t.count >= 2).slice(0, 3).length);
    for (const id of ['s:live-lab', 'a:about', 'c:contact']) await expect(page.locator(`.mc[data-node="${id}"]`)).toHaveCount(1);
    // one dashed inactive relationship and one bi-directional pair, both derived from the tags
    if (d.tags.some((t: any) => t.key === 'userelationship')) await expect(page.locator('.mv-edge.is-inactive').first()).toBeAttached();
    // a bi-directional pair exists only when two reports are similar enough (not with the three sample projects)
    expect(await page.locator('.mv-edge.is-bidi').count()).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('?layout=model works on / and /work/, and survives navigation', async ({ page }) => {
    await page.goto('/work/?layout=model');
    await ready(page);
    await expect(page.locator('[data-layout-view="classic"]')).toBeHidden();
    await page.getByRole('link', { name: 'Work', exact: true }).first().click();
    await page.getByRole('link', { name: 'About', exact: true }).first().click();
    await expect(page).toHaveURL(/\/about\/$/);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'model');
    await page.getByRole('link', { name: /Mohit Reshi, home/ }).click();
    await expect(page).toHaveURL(/\/$|\?layout=model$/);
    await ready(page);
    await expect(page.locator('.mc').first()).toBeVisible();
  });

  test('theme tokens give the whole site the Model look in both themes', async ({ page }) => {
    await page.goto('/about/?layout=model');
    const fonts = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-display'));
    expect(fonts).toContain('Big Shoulders Display');
    const bg = async () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const first = await bg();
    await page.locator('[data-theme-toggle]').click();
    const second = await bg();
    expect(first).not.toEqual(second);
    expect([first, second].sort()).toEqual(['rgb(231, 238, 248)', 'rgb(26, 42, 68)']);
  });

  test('hover and keyboard focus light up the tables a filter flows to', async ({ page }) => {
    await page.goto(MODEL); await ready(page);
    const rls = page.locator('.mc[data-node="d:rls"]');
    await rls.hover();
    await expect(page.locator('.mv__world')).toHaveAttribute('data-active', '1');
    await expect(rls).toHaveAttribute('data-flow', 'self');
    expect(await page.locator('.mc[data-flow="down"]').count()).toBeGreaterThan(1);
    expect(await page.locator('.mv-edge.is-lit').count()).toBeGreaterThan(1);
    // a dimension filters facts (down); a fact is filtered by dimensions (up)
    await expect(page.locator('.mc[data-type="dim"][data-flow="down"]')).toHaveCount(0);
    await page.mouse.move(2, 2);
    await expect(page.locator('.mv__world')).not.toHaveAttribute('data-active', '1');
    await expect(page.locator('.mv-edge.is-lit')).toHaveCount(0);
    const fact = page.locator('.mc[data-type="fact"]').first();
    await fact.focus();
    await expect(fact).toHaveAttribute('data-flow', 'self');
    expect(await page.locator('.mc[data-flow="up"]').count()).toBeGreaterThan(0);
    // dimmed tables really dim
    await expect.poll(() => page.locator('.mc:not([data-flow])').first().evaluate((el) => parseFloat(getComputedStyle(el).opacity))).toBeLessThan(0.5);
  });

  test('clicking a report opens the case panel; Esc closes it and returns focus', async ({ page }) => {
    await page.goto(MODEL); await ready(page);
    const card = page.locator('.mc[data-type="fact"]').first();
    const slug = await card.locator('a[data-case-open]').getAttribute('data-case-open');
    expect(await card.locator('a.mc__link').getAttribute('href')).toContain('/work/');
    await card.locator('.mc__link').click();
    await expect(page.locator('#case-panel')).toHaveAttribute('open', '');
    await expect(page.locator('#case-title')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#case-panel')).not.toHaveAttribute('open', '');
    expect(await page.evaluate(() => document.activeElement?.closest('.mc, .mc__link') != null)).toBe(true);
    // clicking the card body works too
    await card.locator('.mc__rows').click({ position: { x: 20, y: 8 } });
    await expect(page.locator('#case-panel')).toHaveAttribute('open', '');
    expect(slug).toBeTruthy();
    await page.keyboard.press('Escape');
    await expect(page.locator('#case-panel')).not.toHaveAttribute('open', '');
  });

  test('keyboard: Tab between tables, Enter opens, Escape returns focus to the table', async ({ page }) => {
    await page.goto(MODEL); await ready(page);
    const facts = page.locator('.mc[data-type="fact"]');
    await facts.first().focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.node)).toBe(await facts.nth(1).getAttribute('data-node'));
    await page.keyboard.press('Enter');
    await expect(page.locator('#case-panel')).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('#case-panel')).not.toHaveAttribute('open', '');
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.node)).toBe(await facts.nth(1).getAttribute('data-node'));
    // the camera follows keyboard focus: the focused table ends up inside the viewport
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    await page.waitForTimeout(700);
    const vp = await box(page, '[data-mv-viewport]'); const c = await page.evaluate(() => (document.activeElement as HTMLElement).getBoundingClientRect().toJSON());
    expect(c.x + c.width).toBeGreaterThan(vp.x); expect(c.x).toBeLessThan(vp.x + vp.width);
    expect(c.y + c.height).toBeGreaterThan(vp.y); expect(c.y).toBeLessThan(vp.y + vp.height);
  });

  test('arrow keys pan, plus and minus zoom, slash focuses search', async ({ page }) => {
    await page.goto(MODEL); await ready(page);
    await page.locator('[data-mv-viewport]').focus();
    const t0 = await page.locator('.mv__world').evaluate((e) => (e as HTMLElement).style.transform);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(500);
    expect(await page.locator('.mv__world').evaluate((e) => (e as HTMLElement).style.transform)).not.toBe(t0);
    const z0 = Number(await stage(page).getAttribute('data-zoom'));
    await page.keyboard.press('+'); await page.waitForTimeout(600);
    expect(Number(await stage(page).getAttribute('data-zoom'))).toBeGreaterThan(z0);
    await page.keyboard.press('0'); await page.waitForTimeout(800);
    expect(Math.abs(Number(await stage(page).getAttribute('data-zoom')) - z0)).toBeLessThan(0.03);
    await page.locator('[data-mv-viewport]').focus();
    await page.keyboard.press('/');
    await expect(page.locator('[data-mv-search]')).toBeFocused();
  });

  test('wheel zooms, drag pans, buttons zoom and fit, minimap shows the view', async ({ page }) => {
    await page.goto(MODEL); await ready(page);
    const vp = await box(page, '[data-mv-viewport]');
    const z0 = Number(await stage(page).getAttribute('data-zoom'));
    await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => Number(await stage(page).getAttribute('data-zoom'))).toBeGreaterThan(z0);
    const t = await page.locator('.mv__world').evaluate((e) => (e as HTMLElement).style.transform);
    // start the drag on empty canvas: scan a few points until one is not a table, a control or the minimap
    const start = await page.evaluate(({ x, y, w, h }) => {
      for (const [fx, fy] of [[0.05, 0.9], [0.5, 0.95], [0.95, 0.05], [0.05, 0.05], [0.5, 0.5], [0.3, 0.7], [0.7, 0.3]]) {
        const px = x + w * fx, py = y + h * fy; const el = document.elementFromPoint(px, py);
        if (el && el.closest('[data-mv-viewport]') && !el.closest('.mc, .mini, button, a, input, [data-mv-drawer]')) return { px, py };
      }
      return null;
    }, { x: vp.x, y: vp.y, w: vp.width, h: vp.height });
    expect(start).not.toBeNull();
    await page.mouse.move(start!.px, start!.py); await page.mouse.down(); await page.mouse.move(start!.px + 160, start!.py - 80, { steps: 6 }); await page.mouse.up();
    expect(await page.locator('.mv__world').evaluate((e) => (e as HTMLElement).style.transform)).not.toBe(t);
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await expect.poll(async () => Math.abs(Number(await stage(page).getAttribute('data-zoom')) - z0)).toBeLessThan(0.03);
    await expect(page.locator('.mini__svg rect')).not.toHaveCount(0);
  });

  test('dragging a table moves it and its lines, and never opens the case panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(MODEL); await ready(page);
    const card = page.locator('.mc[data-type="fact"]').first();
    const b0 = (await card.boundingBox())!;
    const edgeId = await page.locator('.mv-edge').first().getAttribute('data-edge');
    const dBefore = await page.locator('.mv-edge__line').evaluateAll((els) => els.map((e) => e.getAttribute('d')).join('|'));
    await page.mouse.move(b0.x + b0.width / 2, b0.y + 10);
    await page.mouse.down(); await page.mouse.move(b0.x + b0.width / 2 + 90, b0.y + 70, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(900);
    const b1 = (await card.boundingBox())!;
    expect(Math.abs(b1.x - b0.x) + Math.abs(b1.y - b0.y)).toBeGreaterThan(60);
    expect(await page.locator('.mv-edge__line').evaluateAll((els) => els.map((e) => e.getAttribute('d')).join('|'))).not.toBe(dBefore);
    await expect(page.locator('#case-panel')).not.toHaveAttribute('open', '');
    expect(edgeId).toBeTruthy();
    // and a click right after still works
    await card.locator('.mc__link').click();
    await expect(page.locator('#case-panel')).toHaveAttribute('open', '');
  });

  test('tidy layout: layers in order, equal cards, 3rem gutters, no card overlap, no line through a card', async ({ page }) => {
    await page.goto(MODEL); await ready(page);
    await page.waitForTimeout(600);
    const g = await geometry(page);
    expect(overlaps(g)).toEqual([]);
    expect(badSegments(g)).toEqual([]);
    const d = await explorer(page);
    // same width for each type, same height for each fact table
    for (const type of ['fact', 'dim']) { const of = g.cards.filter((c) => c.type === type); expect(new Set(of.map((c) => c.w)).size, `${type} widths`).toBe(1); }
    expect(new Set(g.cards.filter((c) => c.type === 'fact').map((c) => c.h)).size).toBe(1);
    // platform dimensions on top, facts in the middle, skill dimensions below, and the cards sit on a grid (shared rows)
    const dimNode = (key: string) => g.cards.find((c) => c.id === `d:${key}`)!;
    const facts = g.cards.filter((c) => c.type === 'fact');
    const fy = Math.min(...facts.map((f) => f.y)), fyMax = Math.max(...facts.map((f) => f.y + f.h));
    for (const t of d.tags.filter((t: any) => t.group === 'platform')) expect(dimNode(t.key).y + dimNode(t.key).h).toBeLessThan(fy);
    for (const t of d.tags.filter((t: any) => t.group === 'skill')) expect(dimNode(t.key).y).toBeGreaterThan(fyMax);
    if (d.projects.length <= 5) expect(new Set(facts.map((f) => f.y)).size).toBe(1);
    // deterministic: a reload gives the very same positions
    await page.reload(); await ready(page); await page.waitForTimeout(600);
    expect(await geometry(page)).toEqual(g);
  });

  test('Fit shows the whole diagram readable at 1440x900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(MODEL); await ready(page);
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.waitForTimeout(900);
    expect(Number(await stage(page).getAttribute('data-zoom'))).toBeGreaterThanOrEqual(0.6);
    const vp = await box(page, '[data-mv-viewport]');
    for (const c of await page.locator('.mc').all()) { const b = (await c.boundingBox())!; expect(b.x).toBeGreaterThanOrEqual(vp.x - 1); expect(b.x + b.width).toBeLessThanOrEqual(vp.x + vp.width + 1); expect(b.y).toBeGreaterThanOrEqual(vp.y - 1); expect(b.y + b.height).toBeLessThanOrEqual(vp.y + vp.height + 1); }
  });

  for (const n of [0, 1, 4, 8, 10, 25]) {
    test(`tidy layout holds with ${n} projects`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await withProjects(page, n);
      await page.goto(MODEL); await ready(page);
      await page.waitForTimeout(600);
      await expect(page.locator('.mc[data-type="fact"]')).toHaveCount(n);
      const g = await geometry(page);
      expect(overlaps(g)).toEqual([]);
      expect(badSegments(g)).toEqual([]);
      const facts = g.cards.filter((c) => c.type === 'fact');
      expect(new Set(facts.map((f) => f.y)).size).toBe(Math.ceil(n / 5)); // rows of at most five, as few rows as possible
      if (n >= 4 && n <= 10) { await page.getByRole('button', { name: 'Fit', exact: true }).click(); await page.waitForTimeout(900); expect(Number(await stage(page).getAttribute('data-zoom'))).toBeGreaterThanOrEqual(n <= 5 ? 0.6 : 0.35); } // more tables than fit at a readable size: the reader pans
      if (n === 25) await page.screenshot({ path: test.info().outputPath('model-25.png') });
      expect(errors.filter((e) => !/Outdated Optimize Dep|\.vite\/deps/.test(e))).toEqual([]); // dev-server dependency re-optimisation noise is not ours
    });
  }

  test('Tidy up animates a dragged table back to the grid and leaves the others alone', async ({ page }) => {
    await page.goto(MODEL); await ready(page);
    await page.waitForTimeout(600);
    const before = await geometry(page);
    const card = page.locator('.mc[data-type="fact"]').first();
    const id = await card.getAttribute('data-node');
    const b0 = (await card.boundingBox())!;
    await page.mouse.move(b0.x + b0.width / 2, b0.y + 10);
    await page.mouse.down(); await page.mouse.move(b0.x + b0.width / 2 + 120, b0.y + 160, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(900);
    const dragged = await geometry(page);
    const me = (g: Geo) => g.cards.find((c) => c.id === id)!;
    expect(Math.abs(me(dragged).x - me(before).x) + Math.abs(me(dragged).y - me(before).y)).toBeGreaterThan(40);
    // the others did not move
    expect(dragged.cards.filter((c) => c.id !== id)).toEqual(before.cards.filter((c) => c.id !== id));
    // lines of the dragged table follow it and stay orthogonal
    expect(dragged.lines.find((l) => l.id !== undefined && JSON.stringify(l.pts) !== JSON.stringify(before.lines.find((b) => b.id === l.id)!.pts))).toBeTruthy();
    await page.getByRole('button', { name: 'Tidy up' }).click();
    await expect.poll(async () => JSON.stringify((await geometry(page)).cards)).toBe(JSON.stringify(before.cards));
    const after = await geometry(page);
    expect(after.lines).toEqual(before.lines);
    expect(badSegments(after)).toEqual([]);
  });

  test('search fields highlights matching tables and rows and frames them', async ({ page }) => {
    await page.goto(MODEL); await ready(page);
    const d = await explorer(page);
    const rare = d.tags.filter((t: any) => t.group !== 'domain' || t.count >= 2).sort((a: any, b: any) => a.count - b.count || a.key.localeCompare(b.key))[0].key as string; // the rarest tag keeps the match list short
    await page.getByRole('searchbox', { name: 'Search fields' }).fill(rare);
    await expect(page.locator('.mc[data-hit]')).not.toHaveCount(0);
    expect(await page.locator('.mc[data-hit]').count()).toBeLessThan(await page.locator('.mc').count());
    await expect(page.locator('.mc__row[data-hit]').first()).toBeAttached();
    await expect(page.locator('[data-mv-count]')).toContainText('of');
    await page.waitForTimeout(800);
    const hit = (await page.locator('.mc[data-hit]').first().boundingBox())!; const vp = await box(page, '[data-mv-viewport]');
    expect(hit.x).toBeGreaterThan(vp.x - 1); expect(hit.x + hit.width).toBeLessThan(vp.x + vp.width + 1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mc[data-hit]')).toHaveCount(0);
  });

  test('list view swaps the diagram for a plain list of the same projects and tags', async ({ page }) => {
    await page.goto(MODEL); await ready(page);
    const d = await explorer(page);
    await page.getByRole('button', { name: 'List view' }).click();
    await expect(page.locator('[data-mv-stage]')).toBeHidden();
    const list = page.locator('[data-mv-list]');
    await expect(list).toBeVisible();
    for (const p of d.projects) await expect(list.getByRole('link', { name: p.title })).toBeVisible();
    for (const t of d.tags) await expect(list.locator('strong', { hasText: new RegExp(`^${t.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })).toHaveCount(1);
    await list.getByRole('link', { name: d.projects[0].title }).click();
    await expect(page.locator('#case-panel')).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Diagram view' }).click();
    await expect(page.locator('[data-mv-stage]')).toBeVisible();
    await expect(page.locator('.mc').first()).toBeVisible();
  });

  test('the server-rendered HTML already contains the full list (works without JS)', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toContain('data-mv-list');
    const d = JSON.parse(html.match(/id="explorer-data"[^>]*>(.*?)<\/script>/s)![1].replace(/\\u003c/g, '<'));
    for (const p of d.projects) expect(html).toContain(`href="${p.href}"`);
    expect(html).toContain('mailto:');
  });

  test('Live Lab persona applies a visible RLS filter to every non-portal report', async ({ page }) => {
    await page.goto(MODEL); await ready(page);
    const live = page.locator('.mc[data-node="s:live-lab"]');
    expect(await live.locator('a.mc__link').getAttribute('href')).toContain('/live-lab/');
    for (const name of ['Employer', 'Member', 'Producer', 'Admin']) await expect(live.locator('.mc__persona', { hasText: name })).toBeVisible();
    const group = page.getByRole('group', { name: /Persona/ });
    await expect(page.locator('.mc[data-persona-out]')).toHaveCount(0);
    await group.getByRole('button', { name: 'Employer' }).click();
    await expect(group.getByRole('button', { name: 'Employer' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mv__world')).toHaveAttribute('data-persona', 'employer');
    await expect(live.locator('.mc__persona[data-on]')).toContainText('Employer');
    const d = await explorer(page);
    const portals = d.projects.filter((p: any) => p.tags.includes('rls') && (p.tags.includes('insurance') || p.tags.includes('embedded')));
    await expect(page.locator('.mc[data-persona-out]')).toHaveCount(d.projects.length - portals.length);
    for (const p of portals) await expect(page.locator(`.mc[data-node="f:${p.slug}"]`)).not.toHaveAttribute('data-persona-out', '');
    await expect.poll(() => page.locator('.mc[data-persona-out]').first().evaluate((el) => parseFloat(getComputedStyle(el).opacity))).toBeLessThan(0.5);
    await expect(page.locator('.mv__flow')).toContainText(`${portals.length} of ${d.projects.length}`);
    await expect(page.locator('[data-mv-live]')).toContainText('Employer role applied');
    await expect(page.locator('.mv-edge.is-filter').first()).toBeAttached();
    // the card rows are a pointer shortcut for the same control
    await live.locator('.mc__persona', { hasText: 'Admin' }).click();
    await expect(page.locator('.mc[data-persona-out]')).toHaveCount(0);
    await expect(group.getByRole('button', { name: 'Admin' })).toHaveAttribute('aria-pressed', 'true');
    await group.getByRole('button', { name: 'Admin' }).click();
    await expect(page.locator('.mv__world')).not.toHaveAttribute('data-persona', /.+/);
  });

  test('About and Contact tables carry the real links', async ({ page }) => {
    await page.goto(MODEL); await ready(page);
    expect(await page.locator('.mc[data-node="a:about"] a.mc__link').getAttribute('href')).toContain('/about/');
    expect(await page.locator('.mc[data-node="c:contact"] a[href^="mailto:"]').count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator('.mc[data-node="c:contact"] a[href^="https://"]').count()).toBeGreaterThan(0);
  });

  test('leaving the layout tears everything down and coming back rebuilds it', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(MODEL); await ready(page);
    await page.locator('[data-layout-set="classic"]').click();
    await expect(page.locator('.mc')).toHaveCount(0);
    await expect(page.locator('[data-model-stage]')).not.toHaveAttribute('data-ready', '1');
    await page.locator('[data-layout-set="model"]').click();
    await ready(page);
    await expect(page.locator('.mc').first()).toBeVisible();
    await page.locator('[data-layout-set="index"]').click();
    await expect(page.locator('.mc')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('resize re-fits, theme toggle repaints, reduced motion turns animation off', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(MODEL); await ready(page);
    const z0 = Number(await stage(page).getAttribute('data-zoom'));
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect.poll(async () => Number(await stage(page).getAttribute('data-zoom'))).not.toBe(z0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-mv-drawer]')).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('[data-mv-drawer]')).toBeHidden();
    const cardBg = () => page.locator('.mc').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    const a = await cardBg();
    await page.locator('[data-theme-toggle]').click();
    expect(await cardBg()).not.toBe(a);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.mc[data-node="d:rls"]').hover();
    const anim = await page.locator('.mv-edge.is-lit .mv-edge__line').first().evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe('none');
    expect(errors).toEqual([]);
  });
});

test.describe('Model layout on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('no horizontal scroll, drawer lists every table, persona control works, targets are 44px', async ({ page }) => {
    const errors = collectErrors(page);
    await skipIntro(page);
    for (const url of ['/?layout=model', '/work/?layout=model']) {
      await page.goto(url); await ready(page);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
    const n = await page.locator('.mc').count();
    const toggle = page.locator('#mv-drawer-toggle');
    await expect(toggle).toBeVisible();
    for (const sel of ['#mv-drawer-toggle', '[data-mv-fit]', '[data-mv-list-toggle]', '[data-mv-zoom-in]', '[data-mv-zoom-out]']) {
      const b = (await page.locator(sel).first().boundingBox())!;
      expect(b.height, sel).toBeGreaterThanOrEqual(43.5); expect(b.width, sel).toBeGreaterThanOrEqual(43.5);
    }
    await toggle.click();
    await expect(page.locator('.dr__item')).toHaveCount(n);
    for (const el of await page.locator('.dr__loc, .dr__pbtn, .dr__open').all()) { const b = (await el.boundingBox())!; expect(b.height).toBeGreaterThanOrEqual(43.5); }
    await page.locator('.dr__pbtn', { hasText: 'Producer' }).click();
    expect(await page.locator('.mc[data-persona-out]').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-dr-flow]')).toContainText('reports pass');
    // locating a table collapses the drawer and brings it into view
    await page.locator('.dr__loc').nth(2).click();
    await expect(page.locator('#mv-drawer-panel')).toBeHidden();
    await page.waitForTimeout(700);
    const c = (await page.locator('.mc:focus').boundingBox())!; const vp = (await page.locator('[data-mv-viewport]').boundingBox())!;
    expect(c.x).toBeGreaterThan(vp.x - 2); expect(c.x + c.width).toBeLessThan(vp.x + vp.width + 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});

for (const scheme of ['dark', 'light'] as const) {
  for (const url of ['/?layout=model', '/work/?layout=model']) {
    test(`axe: ${url} in the Model layout (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      await skipIntro(page);
      await page.addInitScript((s) => { try { localStorage.setItem('theme', s); } catch { /* ignore */ } }, scheme);
      await page.goto(url); await ready(page);
      await page.waitForTimeout(500);
      expect(await page.locator('html').getAttribute('data-theme')).toBe(scheme);
      const run = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const bad = (await run()).violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(bad, bad.join('\n')).toEqual([]);
      // list view and an open persona state as well
      await page.getByRole('button', { name: 'List view' }).click();
      const bad2 = (await run()).violations.map((v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(bad2, bad2.join('\n')).toEqual([]);
      await ctx.close();
    });
  }
}

test('contrast: every Model token pair meets WCAG AA in both themes', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles/layout-model.css'), 'utf8');
  const pairs: Array<[string, string, number]> = [
    ['fg', 'bg', 7], ['fg', 'bg-elev', 7], ['fg-muted', 'bg', 4.5], ['fg-muted', 'bg-elev', 4.5], ['fg-muted', 'bg-sunken', 4.5], ['fg-faint', 'bg-elev', 4.5],
    ['fg', 'mv-head-fact', 4.5], ['fg-muted', 'mv-head-fact', 4.5], ['fg', 'mv-head-dim', 4.5], ['fg-muted', 'mv-head-dim', 4.5], ['fg', 'mv-head-sec', 4.5], ['fg-muted', 'mv-head-sec', 4.5], ['fg', 'mv-head-misc', 4.5], ['fg-muted', 'mv-head-misc', 4.5],
    ['accent-text', 'bg', 4.5], ['accent-text', 'bg-elev', 4.5], ['accent-text', 'bg-sunken', 4.5], ['accent-ink', 'accent', 4.5],
    ['accent-line', 'bg', 3], ['accent-line', 'bg-elev', 3], ['line-strong', 'bg', 3], ['mv-edge-strong', 'bg', 3], ['focus', 'bg', 3], ['focus', 'bg-elev', 3],
  ];
  for (const theme of ['dark', 'light']) {
    const block = css.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`))![1];
    const t = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
    for (const [f, b, min] of pairs) expect(ratio(t[f], t[b]), `${theme}: ${f} on ${b}`).toBeGreaterThanOrEqual(min);
  }
});
