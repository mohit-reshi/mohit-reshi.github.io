import type { ActionId, EmbedAdapter, EmbedEventName, LiveLabHandle, MountOptions, PageInfo, ReportEntry, Snippet, Theme, TokenInfo, TourStep } from '../types';
import { createBroker, type Broker } from '../broker';
import { RealPowerBiAdapter } from '../adapters/real';
import { MockAdapter } from '../adapters/mock';
import { CSS } from './styles';
import { h, prefersReducedMotion, trimJson } from './dom';

const RLS_EXPLAINER = 'Row-level security (RLS) in one line: the broker asks Power BI for an embed token that carries an effective identity (a username plus roles), so every query is filtered by that role; the browser only picks a persona and never sends an identity.';
const EVENTS: EmbedEventName[] = ['loaded', 'rendered', 'pageChanged', 'dataSelected', 'visualClicked', 'buttonClicked', 'tokenExpired', 'error'];
const LOG_LIMIT = 120;
const DEFAULT_THEMES: Record<Theme, Record<string, unknown>> = {
  light: { name: 'LiveLabLight', background: '#FFFFFF', foreground: '#1B1F23', tableAccent: '#2563EB' },
  dark: { name: 'LiveLabDark', background: '#0D1117', foreground: '#E6EDF3', tableAccent: '#58A6FF' },
};

let styleInjected = false;
function injectStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  document.head.append(h('style', { 'data-live-lab': '' }, CSS));
  styleInjected = true;
}

interface Session {
  entry: ReportEntry;
  persona: string | null;
  adapter: EmbedAdapter | null;
  token: TokenInfo | null;
  refreshTimer: ReturnType<typeof setTimeout> | null;
  pages: PageInfo[];
  activePage: string | null;
  seq: number; // guards against late async results after a newer selection
}

export class LiveLab implements LiveLabHandle {
  private opts: MountOptions;
  private broker: Broker;
  private theme: Theme;
  private mode: 'live' | 'offline' = 'live';
  private s: Session | null = null;
  private seq = 0;
  private tourAbort = false;
  private tourRunning = false;
  private destroyed = false;
  private snippets: Snippet[];
  private activeSnippet: Snippet | null = null;
  private el: Record<string, HTMLElement> = {};
  private root: HTMLElement;

  constructor(private container: HTMLElement, opts: MountOptions, snippets: Snippet[]) {
    this.opts = opts;
    this.theme = opts.theme;
    this.snippets = snippets;
    this.broker = createBroker(opts.brokerUrl, opts.config.reports, opts.fetchImpl);
    injectStyle();
    this.root = h('div', { class: 'll-root', 'data-theme': this.theme });
    this.container.replaceChildren(this.root);
    this.build();
    opts.onThemeRequest?.((t) => this.setTheme(t));
    void this.start();
  }

  // ------------------------------------------------------------------ build
  private build() {
    const e = this.el;
    e.pill = h('span', { class: 'll-pill', 'data-state': 'checking' }, 'checking…');
    e.banner = h('div', { class: 'll-banner', role: 'status', hidden: true });
    e.select = h('select', { id: 'll-report', onchange: (ev: Event) => void this.selectReport((ev.target as HTMLSelectElement).value) });
    e.personas = h('fieldset', { class: 'll-personas', hidden: true });
    e.pick = h('div', { class: 'll-pick' }, h('label', { for: 'll-report' }, 'Report', e.select), e.personas);
    e.nav = h('div', { class: 'll-nav', role: 'toolbar', 'aria-label': 'Report pages' });
    e.tools = h('div', { class: 'll-tools', role: 'toolbar', 'aria-label': 'Report controls' });
    e.embed = h('div', { class: 'll-embed' });
    e.loading = h('div', { class: 'll-loading', hidden: true }, 'Loading report…');
    e.fallback = h('div', { class: 'll-fallback', hidden: true });
    e.stage = h('div', { class: 'll-stage' }, e.embed, e.loading, e.fallback);
    e.hint = h('div', { class: 'll-hint ll-codehint' });
    e.selected = h('div', { class: 'll-panel', id: 'll-selected' }, h('span', { class: 'll-hint' }, 'Click a data point in the report to see it here.'));
    e.log = h('div', { class: 'll-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Event log' });
    const clear = h('button', { type: 'button', onclick: () => e.log.replaceChildren() }, 'Clear');
    e.side = h('div', { class: 'll-side' },
      h('section', { 'aria-labelledby': 'll-sel-h' }, h('h3', { id: 'll-sel-h' }, 'What you selected'), e.selected),
      h('section', { 'aria-labelledby': 'll-log-h' }, h('h3', { id: 'll-log-h' }, 'Event log ', clear), h('div', { class: 'll-panel' }, e.log)));
    e.livePanel = h('section', { id: 'll-live', role: 'tabpanel', 'aria-labelledby': 'll-tab-live' }, e.nav, e.tools, e.stage, e.hint, e.side);
    // code tab
    e.snipList = h('div', { class: 'll-snips', role: 'group', 'aria-label': 'Code snippets' });
    e.codeHead = h('div', { class: 'll-codehead' });
    e.codeBox = h('div', { class: 'll-codebox', tabindex: 0, role: 'region', 'aria-label': 'Code' });
    e.copied = h('span', { class: 'll-copied', role: 'status' });
    e.codePanel = h('section', { id: 'll-code', role: 'tabpanel', 'aria-labelledby': 'll-tab-code', hidden: true },
      h('div', { class: 'll-code' }, e.snipList, h('div', {}, e.codeHead, e.codeBox, e.copied)));
    e.tabLive = h('button', { type: 'button', role: 'tab', id: 'll-tab-live', class: 'll-tab', 'aria-selected': 'true', 'aria-controls': 'll-live', onclick: () => this.showTab('live') }, 'Live');
    e.tabCode = h('button', { type: 'button', role: 'tab', id: 'll-tab-code', class: 'll-tab', 'aria-selected': 'false', 'aria-controls': 'll-code', tabindex: -1, onclick: () => this.showTab('code') }, 'Code');
    e.tabs = h('div', { class: 'll-tabs', role: 'tablist', 'aria-label': 'Live or Code', onkeydown: (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft' || ev.key === 'Home' || ev.key === 'End') { ev.preventDefault(); const to = ev.key === 'ArrowLeft' || ev.key === 'Home' ? 'live' : 'code'; this.showTab(to); (to === 'live' ? e.tabLive : e.tabCode).focus(); }
    } }, e.tabLive, e.tabCode);
    this.root.append(h('div', { class: 'll-head' }, h('h2', {}, 'Live Lab'), e.pill), e.banner, e.pick, e.tabs, e.livePanel, e.codePanel);
    this.buildSnippetList();
    // report select
    const groups = new Map<string, ReportEntry[]>();
    for (const r of this.opts.config.reports) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
    for (const [g, rs] of groups) e.select.append(h('optgroup', { label: g }, ...rs.map((r) => h('option', { value: r.key }, r.title))));
  }

  private showTab(which: 'live' | 'code') {
    const e = this.el;
    const live = which === 'live';
    e.livePanel.hidden = !live; e.codePanel.hidden = live;
    e.tabLive.setAttribute('aria-selected', String(live)); e.tabCode.setAttribute('aria-selected', String(!live));
    e.tabLive.tabIndex = live ? 0 : -1; e.tabCode.tabIndex = live ? -1 : 0;
  }

  // ------------------------------------------------------------------ start
  private async start() {
    const health = await this.broker.health(this.opts.healthTimeoutMs ?? 4000);
    if (this.destroyed) return;
    this.mode = health.ok ? 'live' : 'offline';
    this.setPill(this.mode === 'live' ? 'live' : 'recorded', this.mode === 'live' ? 'Live' : 'Recorded');
    const first = this.opts.config.reports.find((r) => r.key === this.opts.initialReport) ?? this.opts.config.reports[0];
    if (first) { (this.el.select as HTMLSelectElement).value = first.key; await this.selectReport(first.key); }
  }

  private setPill(state: string, text: string) { this.el.pill.dataset.state = state; this.el.pill.textContent = text; }

  // ------------------------------------------------------------------ selection
  private async selectReport(key: string, persona?: string | null) {
    const entry = this.opts.config.reports.find((r) => r.key === key);
    if (!entry) return;
    this.teardownSession();
    this.tourAbort = true;
    const p = persona !== undefined ? persona : entry.personas?.[0]?.key ?? null;
    this.s = { entry, persona: p, adapter: null, token: null, refreshTimer: null, pages: [], activePage: null, seq: ++this.seq };
    this.renderPersonas(entry, p);
    this.renderTools(entry);
    this.el.nav.replaceChildren();
    this.el.selected.replaceChildren(h('span', { class: 'll-hint' }, 'Click a data point in the report to see it here.'));
    if (this.mode === 'offline') return this.showFallback('Live capacity has ended - recorded walkthrough');
    await this.embedCurrent();
  }

  private teardownSession() {
    if (!this.s) return;
    if (this.s.refreshTimer) clearTimeout(this.s.refreshTimer);
    try { this.s.adapter?.destroy(); } catch { /* ignore */ }
    this.el.embed.replaceChildren();
    this.s = null;
  }

  private async makeAdapter(token: TokenInfo): Promise<EmbedAdapter> {
    const kind = token.embedUrl.startsWith('https://mock.invalid') || this.opts.brokerUrl === 'mock:' ? 'mock' : 'real';
    if (this.opts.adapterFactory) return this.opts.adapterFactory(kind);
    return kind === 'mock' ? new MockAdapter() : new RealPowerBiAdapter();
  }

  private async embedCurrent() {
    const s = this.s;
    if (!s) return;
    const seq = s.seq;
    const e = this.el;
    e.loading.hidden = false; e.fallback.hidden = true; e.banner.hidden = true; e.embed.hidden = false;
    try {
      const token = await this.broker.token(s.entry.key, s.persona);
      if (this.stale(seq)) return;
      s.token = token;
      const adapter = await this.makeAdapter(token);
      if (this.stale(seq)) { adapter.destroy(); return; }
      s.adapter = adapter;
      for (const ev of EVENTS) adapter.on(ev, (payload) => this.onEvent(ev, payload));
      await adapter.embed(e.embed, token, { reportKey: s.entry.key, kind: s.entry.kind, persona: s.persona, title: s.entry.title, fallbackMedia: s.entry.fallbackMedia });
      if (this.stale(seq)) return;
      e.loading.hidden = true;
      this.log('ui', 'embed', { report: s.entry.key, persona: s.persona, adapter: adapter.kind });
      this.highlight('embed');
      if (s.entry.kind === 'interactive') {
        s.pages = await adapter.getPages();
        s.activePage = s.pages[0]?.name ?? null;
        this.renderNav();
      }
      await adapter.setTheme(this.opts.config.themes?.[this.theme] ?? DEFAULT_THEMES[this.theme]);
      this.scheduleRefresh();
    } catch (err) {
      if (this.stale(seq)) return;
      this.log('ui', 'error', { message: (err as Error).message });
      this.showFallback('Live view unavailable for this report - recorded walkthrough');
    }
  }

  private stale(seq: number) { return this.destroyed || !this.s || this.s.seq !== seq; }

  // ------------------------------------------------------------------ personas
  private renderPersonas(entry: ReportEntry, current: string | null) {
    const box = this.el.personas;
    const list = entry.personas ?? [];
    box.hidden = list.length === 0;
    if (!list.length) return box.replaceChildren();
    const name = `ll-persona-${entry.key}`;
    const explain = h('p', { class: 'll-rls' });
    const show = (key: string | null) => { const p = list.find((x) => x.key === key); explain.textContent = `${RLS_EXPLAINER}${p ? ` Now applied: "${p.label}". ${p.description}` : ''}`; };
    show(current);
    box.replaceChildren(h('legend', {}, 'View as'),
      h('div', { class: 'll-opts' }, ...list.map((p) => h('label', {}, h('input', { type: 'radio', name, value: p.key, checked: p.key === current, onchange: () => { show(p.key); void this.onPersonaChange(p.key); } }), p.label))),
      explain);
  }

  // #region persona-switch | Switching persona: same report, new token with another effective identity
  private async onPersonaChange(key: string) {
    if (!this.s) return;
    // #highlight persona
    this.s.persona = key;
    this.log('ui', 'persona', { persona: key });
    this.highlight('persona');
    this.teardownEmbedOnly();
    await this.embedCurrent(); // asks the broker for a new token for (reportKey, persona)
    // #endhighlight
  }
  // #endregion

  private teardownEmbedOnly() {
    const s = this.s;
    if (!s) return;
    if (s.refreshTimer) clearTimeout(s.refreshTimer);
    try { s.adapter?.destroy(); } catch { /* ignore */ }
    s.adapter = null; s.token = null; s.seq = ++this.seq;
    this.el.embed.replaceChildren();
  }

  // ------------------------------------------------------------------ nav + tools
  private renderNav() {
    const s = this.s;
    if (!s) return;
    this.el.nav.replaceChildren(...s.pages.map((p) => h('button', { type: 'button', 'aria-current': p.name === s.activePage ? 'true' : undefined, onclick: () => void this.act('page', async () => { await s.adapter!.setPage(p.name); s.activePage = p.name; this.renderNav(); }, { page: p.displayName }) }, p.displayName)));
  }

  private renderTools(entry: ReportEntry) {
    const c = entry.controls ?? {};
    const tools: HTMLElement[] = [];
    const btn = (label: string, fn: () => void, primary = false) => h('button', { type: 'button', class: primary ? 'll-primary' : undefined, onclick: fn }, label);
    const ad = () => this.s!.adapter!;
    if (entry.kind === 'interactive') {
      if (c.filter) tools.push(btn(`Filter: ${c.filter.label}`, () => void this.act('filter', () => ad().applyFilter(c.filter!), { filter: c.filter!.column, values: c.filter!.values })));
      if (c.slicer) tools.push(btn(`Slicer: ${c.slicer.label}`, () => void this.act('slicer', () => ad().setSlicer(c.slicer!), { slicer: c.slicer!.visualName, values: c.slicer!.values })));
      for (const b of c.bookmarks ?? []) tools.push(btn(`Bookmark: ${b.label}`, () => void this.act('bookmark-apply', () => ad().applyBookmark(b.name, b.label), { bookmark: b.name })));
      tools.push(btn('Capture bookmark', () => void this.act('bookmark-capture', async () => { const bm = await ad().captureBookmark(); this.log('ui', 'bookmark captured', { name: bm.name, state: bm.state.slice(0, 40) + '…' }); }, {})));
      tools.push(btn('Reset filters', () => void this.act('reset', () => ad().resetFilters(), {})));
      tools.push(btn('Fullscreen', () => ad().fullscreen()));
      if (c.tour?.length) {
        const tb = btn('Guided tour', () => {
          if (this.tourRunning) { this.tourAbort = true; return; }
          void this.runTour(c.tour!, tb);
        }, true);
        tools.push(tb);
      }
    } else {
      tools.push(h('span', { class: 'll-hint' }, 'Paginated report: page tabs, filters and bookmarks are not available through the embed SDK. Use the PDF export.'));
    }
    if (entry.exportEnabled) tools.push(btn('Export PDF', () => void this.exportPdf()));
    this.el.tools.replaceChildren(...tools);
    this.el.tools.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = this.mode === 'offline'));
  }

  private async act(action: ActionId, fn: () => Promise<void>, detail: Record<string, unknown>) {
    if (!this.s?.adapter) return;
    this.log('ui', action, detail);
    this.highlight(action);
    try { await fn(); } catch (err) { this.log('ui', 'error', { action, message: (err as Error).message }); }
  }

  private async exportPdf() {
    const s = this.s;
    if (!s) return;
    this.highlight('export');
    this.log('ui', 'export', { report: s.entry.key, format: 'PDF' });
    try {
      const blob = await this.broker.exportFile(s.entry.key, s.persona, 'PDF');
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `${s.entry.key}.pdf`, hidden: '' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      this.log('ui', 'export done', { bytes: blob.size });
    } catch (err) { this.log('ui', 'error', { action: 'export', message: (err as Error).message }); }
  }

  private async runTour(steps: TourStep[], toggle?: HTMLButtonElement) {
    const s = this.s;
    if (!s?.adapter || !steps) return;
    this.tourAbort = false;
    this.tourRunning = true;
    if (toggle) toggle.textContent = 'Stop tour';
    try { await this.playTour(s, steps); } finally {
      this.tourRunning = false;
      if (toggle) toggle.textContent = 'Guided tour';
    }
  }

  private async playTour(s: Session, steps: TourStep[]) {
    if (!s.adapter) return;
    this.highlight('tour');
    this.log('ui', 'tour start', { steps: steps.length });
    const ad = s.adapter;
    const scale = prefersReducedMotion() ? 0.5 : 1;
    for (const step of steps) {
      if (this.tourAbort || this.s !== s) { this.log('ui', 'tour stopped', {}); return; }
      this.log('ui', 'tour', { step: step.label });
      try {
        if (step.action === 'page') { await ad.setPage(step.arg!); s.activePage = step.arg!; this.renderNav(); }
        else if (step.action === 'filter' && s.entry.controls?.filter) await ad.applyFilter({ ...s.entry.controls.filter, values: step.arg ? step.arg.split(',') : s.entry.controls.filter.values });
        else if (step.action === 'slicer' && s.entry.controls?.slicer) await ad.setSlicer(s.entry.controls.slicer);
        else if (step.action === 'bookmark') await ad.applyBookmark(step.arg!);
        else if (step.action === 'reset') await ad.resetFilters();
      } catch (err) { this.log('ui', 'error', { step: step.label, message: (err as Error).message }); }
      await new Promise((r) => setTimeout(r, (step.delayMs ?? 1500) * scale));
    }
    this.log('ui', 'tour end', {});
  }

  // ------------------------------------------------------------------ token lifecycle
  private scheduleRefresh() {
    const s = this.s;
    if (!s?.token) return;
    const exp = Date.parse(s.token.expiration);
    const ms = Number.isFinite(exp) ? Math.max(30_000, exp - Date.now() - 5 * 60_000) : 30 * 60_000;
    if (s.refreshTimer) clearTimeout(s.refreshTimer);
    s.refreshTimer = setTimeout(() => void this.refreshToken(), ms);
  }

  // #region token-refresh | Refresh the embed token before it expires (retry once, then fall back)
  private async refreshToken() {
    const s = this.s;
    if (!s?.adapter) return;
    const seq = s.seq;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // #highlight token-refresh
        const token = await this.broker.token(s.entry.key, s.persona);
        await s.adapter.setAccessToken(token.accessToken);
        // #endhighlight
        if (this.stale(seq)) return;
        s.token = token;
        this.log('ui', 'token-refresh', { expiration: token.expiration });
        this.highlight('token-refresh');
        return this.scheduleRefresh();
      } catch { /* retry once */ }
    }
    if (!this.stale(seq)) this.showFallback('Live session ended - recorded walkthrough');
  }
  // #endregion

  // ------------------------------------------------------------------ fallback
  private showFallback(reason: string) {
    const s = this.s;
    const e = this.el;
    if (s?.refreshTimer) clearTimeout(s.refreshTimer);
    try { s?.adapter?.destroy(); } catch { /* ignore */ }
    if (s) s.adapter = null;
    e.loading.hidden = true; e.embed.hidden = true; e.embed.replaceChildren();
    e.banner.hidden = false; e.banner.textContent = reason;
    const m = s?.entry.fallbackMedia;
    const parts: Node[] = [];
    if (m?.video) parts.push(h('video', { controls: true, preload: 'none', playsinline: true, poster: m.poster, src: m.video, 'aria-label': `Recorded walkthrough: ${s?.entry.title}` }));
    else if (m?.gallery?.length) parts.push(h('ul', {}, ...m.gallery.map((src, i) => h('li', {}, h('img', { src, loading: 'lazy', alt: `${s?.entry.title}, screenshot ${i + 1}` })))));
    else parts.push(h('p', { class: 'll-hint' }, 'No recorded media is available for this report yet.'));
    if (m?.caption) parts.push(h('p', { class: 'll-hint' }, m.caption));
    e.fallback.replaceChildren(...parts);
    e.fallback.hidden = false;
    this.el.nav.replaceChildren();
    this.el.tools.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
  }

  // ------------------------------------------------------------------ events + log
  private onEvent(name: EmbedEventName, payload: unknown) {
    this.log('embed', name, payload);
    if (name === 'dataSelected') this.showSelected(payload as any);
    if (name === 'pageChanged') { const p = (payload as any)?.newPage; if (p && this.s) { this.s.activePage = p.name; this.renderNav(); } }
    if (name === 'tokenExpired') void this.refreshToken();
    if (name === 'error') this.showFallback('Live view hit an error - recorded walkthrough');
  }

  private showSelected(p: any) {
    const pts = (p?.dataPoints ?? []) as any[];
    if (!pts.length) return;
    this.el.selected.replaceChildren(h('div', { class: 'll-hint' }, `${p.visual?.title ?? p.visual?.name ?? 'Visual'} on page "${p.page?.displayName ?? '?'}"`),
      h('ul', {}, ...pts.map((pt) => h('li', {}, [...(pt.identity ?? []).map((i: any) => `${i.target?.column ?? 'field'} = ${i.equals}`), ...(pt.values ?? []).map((v: any) => `value ${v.value ?? v.formattedValue ?? ''}`)].join(', ')))));
  }

  private log(source: 'ui' | 'embed', name: string, payload: unknown) {
    const t = new Date().toISOString().slice(11, 23);
    const row = h('div', { class: `src-${source}` }, h('span', { class: 't' }, t + ' '), h('span', { class: 'n' }, name), ' ' + trimJson(payload));
    const log = this.el.log;
    log.append(row);
    while (log.childElementCount > LOG_LIMIT) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
  }

  // ------------------------------------------------------------------ code tab
  private buildSnippetList() {
    this.el.snipList.replaceChildren(...this.snippets.map((sn) => h('button', { type: 'button', 'data-snippet': sn.id, onclick: () => this.showSnippet(sn, null) }, sn.title)));
    if (this.snippets[0]) this.showSnippet(this.snippets[0], null);
  }

  private showSnippet(sn: Snippet, range: [number, number] | null) {
    this.activeSnippet = sn;
    const e = this.el;
    e.snipList.querySelectorAll('button').forEach((b) => ((b as HTMLElement).dataset.snippet === sn.id ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
    e.codeBox.innerHTML = sn.html; // build-time Shiki output of our own source files
    const copy = h('button', { type: 'button', onclick: () => void this.copy(sn) }, 'Copy');
    e.codeHead.replaceChildren(h('span', {}, `${sn.lang} · ${sn.file}`), copy);
    this.markLines(range);
  }

  private markLines(range: [number, number] | null) {
    const lines = this.el.codeBox.querySelectorAll('.line');
    lines.forEach((l, i) => l.classList.toggle('ll-hl', !!range && i + 1 >= range[0] && i + 1 <= range[1]));
    if (range) lines[range[0] - 1]?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  private async copy(sn: Snippet) {
    try { await navigator.clipboard.writeText(sn.code); this.el.copied.textContent = 'Copied to clipboard'; }
    catch { this.el.copied.textContent = 'Copy failed: select the code and copy manually'; }
  }

  /** Map a UI action to a snippet and highlight the lines that implement it. */
  private highlight(action: ActionId) {
    const sn = this.snippets.find((x) => x.highlights[action]);
    if (!sn) return;
    const range = sn.highlights[action]!;
    this.showSnippet(sn, range);
    this.el.hint.replaceChildren(`Code for “${action}”: ${sn.title}, lines ${range[0]}–${range[1]} `, h('button', { type: 'button', onclick: () => { this.showTab('code'); this.el.tabCode.focus(); } }, 'Show code'));
  }

  // ------------------------------------------------------------------ theme + lifecycle
  setTheme(t: Theme) {
    this.theme = t;
    this.root.dataset.theme = t;
    const ad = this.s?.adapter;
    if (ad) {
      this.log('ui', 'theme', { theme: t });
      this.highlight('theme');
      void ad.setTheme(this.opts.config.themes?.[t] ?? DEFAULT_THEMES[t]).catch(() => {});
    }
  }

  destroy() {
    this.destroyed = true;
    this.tourAbort = true;
    this.teardownSession();
    this.container.replaceChildren();
  }
}
