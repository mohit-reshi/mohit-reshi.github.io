import type { EmbedAdapter, EmbedContext, EmbedEventName, PageInfo, TokenInfo } from '../types';

const PAGES: PageInfo[] = [
  { name: 'page-overview', displayName: 'Overview' },
  { name: 'page-detail', displayName: 'Detail' },
  { name: 'page-trends', displayName: 'Trends' },
];
const CATEGORIES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
const BASE = [62, 48, 81, 35, 54];
const NS = 'http://www.w3.org/2000/svg';

/**
 * Mock adapter: renders a generated report page with clickable bars and emits the same event payload shapes
 * as the real SDK. The UI cannot tell the difference. Used in demo, tests and when the broker is in mock mode.
 */
export class MockAdapter implements EmbedAdapter {
  readonly kind = 'mock' as const;
  private handlers = new Map<EmbedEventName, Set<(p: unknown) => void>>();
  private root: HTMLElement | null = null;
  private ctx: EmbedContext | null = null;
  private page = PAGES[0];
  private selected: string[] | null = null; // active category filter
  private theme: Record<string, unknown> | null = null;
  private bookmarks = new Map<string, string[] | null>([['Reset View', null]]);
  private token = '';
  tokenSetCount = 0;

  on(event: EmbedEventName, cb: (p: unknown) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(cb);
  }
  private emit(event: EmbedEventName, payload: unknown) { this.handlers.get(event)?.forEach((cb) => cb(payload)); }

  async embed(container: HTMLElement, token: TokenInfo, ctx: EmbedContext) {
    this.root = container;
    this.ctx = ctx;
    this.token = token.accessToken;
    this.selected = null;
    this.page = PAGES[0];
    this.render();
    queueMicrotask(() => { this.emit('loaded', {}); this.emit('rendered', null); });
  }

  private pageInfo() { return { name: this.page.name, displayName: this.page.displayName, isActive: true }; }

  private render() {
    if (!this.root || !this.ctx) return;
    const dark = this.theme && (this.theme as any).background && String((this.theme as any).background).toLowerCase() !== '#ffffff';
    const bg = dark ? '#161b22' : '#ffffff', fg = dark ? '#e6edf3' : '#1b1f23', muted = dark ? '#8b949e' : '#57606a', accent = '#3b82f6';
    const idx = PAGES.indexOf(this.page);
    const shown = CATEGORIES.map((c, i) => ({ c, v: BASE[(i + idx * 2) % BASE.length] + idx * 3 })).filter((d) => !this.selected || this.selected.includes(d.c));
    const max = Math.max(1, ...shown.map((d) => d.v));
    const total = shown.reduce((a, d) => a + d.v, 0);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 640 360');
    svg.setAttribute('role', 'group'); // not "img": the bars inside are focusable buttons
    svg.setAttribute('aria-label', `Mock ${this.page.displayName} page for ${this.ctx.title}`);
    svg.style.width = '100%';
    svg.style.display = 'block';
    const add = (tag: string, attrs: Record<string, string | number>, text?: string, parent: Element = svg) => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      if (text !== undefined) el.textContent = text;
      parent.appendChild(el);
      return el;
    };
    add('rect', { width: 640, height: 360, fill: bg });
    add('text', { x: 24, y: 36, fill: fg, 'font-size': 20, 'font-weight': 700 }, `${this.ctx.title} · ${this.page.displayName}`);
    add('text', { x: 24, y: 58, fill: muted, 'font-size': 12 }, `Simulated view${this.ctx.persona ? ` as "${this.ctx.persona}"` : ''}${this.selected ? ` · filtered: ${this.selected.join(', ')}` : ''}`);
    [['Total', String(total)], ['Categories', String(shown.length)], ['Avg', String(Math.round(total / Math.max(1, shown.length)))]].forEach(([k, v], i) => {
      add('rect', { x: 24 + i * 200, y: 76, width: 184, height: 64, rx: 8, fill: dark ? '#21262d' : '#f1f5f9' });
      add('text', { x: 40 + i * 200, y: 100, fill: muted, 'font-size': 12 }, k);
      add('text', { x: 40 + i * 200, y: 128, fill: fg, 'font-size': 26, 'font-weight': 700 }, v);
    });
    shown.forEach((d, i) => {
      const h = Math.round((d.v / max) * 150), x = 40 + i * 110, y = 330 - h;
      const g = add('g', { role: 'button', tabindex: 0, 'aria-label': `${d.c}: ${d.v}. Select this bar.`, style: 'cursor:pointer' });
      add('rect', { x, y, width: 80, height: h, rx: 4, fill: accent, opacity: 0.85 }, undefined, g);
      add('text', { x: x + 40, y: y - 6, fill: fg, 'font-size': 12, 'text-anchor': 'middle' }, String(d.v), g);
      add('text', { x: x + 40, y: 348, fill: muted, 'font-size': 12, 'text-anchor': 'middle' }, d.c, g);
      const pick = () => this.click(d.c, d.v);
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') { e.preventDefault(); pick(); } });
    });
    this.root.replaceChildren(svg);
  }

  private click(category: string, value: number) {
    const visual = { name: 'barChart1', title: 'Value by category', type: 'clusteredBarChart' };
    const target = { table: 'Category', column: 'Name' };
    this.emit('visualClicked', { visual, page: this.pageInfo() });
    this.emit('dataSelected', { visual, page: this.pageInfo(), dataPoints: [{ identity: [{ target, equals: category }], values: [{ value }] }], isSelection: true });
  }

  async getPages() { return PAGES; }

  async setPage(name: string) {
    this.page = PAGES.find((p) => p.name === name) ?? PAGES[0];
    this.render();
    this.emit('pageChanged', { newPage: this.pageInfo() });
  }

  async applyFilter(f: { table: string; column: string; values: (string | number)[] }) {
    // Real report values are model-specific; the mock maps any value onto one of its own categories (stable hash).
    const hash = (v: string) => [...v].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const picked = [...new Set(f.values.map((v) => CATEGORIES[hash(String(v)) % CATEGORIES.length]))];
    this.selected = picked.length ? picked : null;
    this.render();
    this.emit('rendered', null);
  }

  async setSlicer(s: { visualName: string; table: string; column: string; values: (string | number)[] }) {
    await this.applyFilter(s);
  }

  async applyBookmark(name: string, label = '') {
    // Real bookmark names are model-specific ids. The mock accepts any: "reset" labels clear the view, others pick a category.
    if (this.bookmarks.has(name)) this.selected = this.bookmarks.get(name) ?? null;
    else if (/reset/i.test(label) || /reset/i.test(name)) this.selected = null;
    else this.selected = [CATEGORIES[[...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % CATEGORIES.length]];
    this.render();
    this.emit('rendered', null);
  }

  async captureBookmark() {
    const name = `Captured ${this.bookmarks.size}`;
    this.bookmarks.set(name, this.selected ? [...this.selected] : null);
    return { name, state: btoa(JSON.stringify({ page: this.page.name, selected: this.selected })) };
  }

  async resetFilters() { this.selected = null; this.render(); this.emit('rendered', null); }
  async setTheme(theme: Record<string, unknown> | null) { this.theme = theme; this.render(); }
  fullscreen() { (this.root as any)?.requestFullscreen?.().catch?.(() => {}); }
  async setAccessToken(token: string) { this.token = token; this.tokenSetCount++; }
  /** Test hook: simulate an expired token. */
  simulateTokenExpired() { this.emit('tokenExpired', null); }
  simulateError(message = 'simulated render failure') { this.emit('error', { message }); }
  destroy() { this.root?.replaceChildren(); this.root = null; this.handlers.clear(); }
}
