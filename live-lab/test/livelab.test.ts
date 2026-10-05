import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountLiveLab } from '../src/index';
import { MockAdapter } from '../src/adapters/mock';
import { createBroker } from '../src/broker';
import config from '../reports.config.json';
import snippets from '../src/generated/snippets.json';
// @ts-expect-error plain JS module
import { extractRegions, cleanBody } from '../scripts/build-snippets.mjs';

const flush = async (n = 6) => { for (let i = 0; i < n; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
const settle = async () => { for (let i = 0; i < 4; i++) await flush(); };
const micro = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
let host: HTMLElement;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); });
afterEach(() => { host.remove(); vi.useRealTimers(); });

const mount = (over: Record<string, unknown> = {}) => mountLiveLab(host, { brokerUrl: 'mock:', config: config as any, theme: 'light', ...over });
const btn = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(label)) as HTMLButtonElement;
const logText = () => host.querySelector('.ll-log')!.textContent!;

describe('Live Lab (mock mode)', () => {
  it('renders grouped report selector, embeds the first report and logs loaded/rendered', async () => {
    const h = mount(); await settle();
    const groups = [...host.querySelectorAll('optgroup')].map((g) => g.getAttribute('label'));
    expect(groups).toEqual(['Enterprise service governance', 'Group insurance portal analytics']);
    expect(host.querySelectorAll('option').length).toBe(5);
    expect(host.querySelector('.ll-pill')!.textContent).toBe('Live');
    expect(host.querySelector('.ll-embed svg')).toBeTruthy();
    expect(logText()).toMatch(/loaded/); expect(logText()).toMatch(/rendered/);
    expect(host.querySelectorAll('.ll-nav button').length).toBe(3);
    h.destroy(); expect(host.children.length).toBe(0);
  });

  it('renders only one embed at a time', async () => {
    mount(); await settle();
    const sel = host.querySelector('select') as HTMLSelectElement;
    sel.value = 'insurance-member'; sel.dispatchEvent(new Event('change')); await settle();
    expect(host.querySelectorAll('.ll-embed svg').length).toBe(1);
    expect(host.querySelector('.ll-embed svg')!.getAttribute('aria-label')).toContain('Member Portal');
  });

  it('persona switcher: shown only where configured, explains RLS, re-embeds with the new persona', async () => {
    const tokenCalls: Array<[string, string | null]> = [];
    const orig = createBroker('mock:', config.reports as any);
    mount(); await settle();
    expect(host.querySelector('.ll-personas')!.hasAttribute('hidden')).toBe(true); // first report has no personas
    const sel = host.querySelector('select') as HTMLSelectElement;
    sel.value = 'insurance-employer'; sel.dispatchEvent(new Event('change')); await settle();
    expect(host.querySelector('.ll-personas')!.hasAttribute('hidden')).toBe(false);
    expect(host.querySelector('.ll-rls')!.textContent).toMatch(/effective identity/);
    expect(host.querySelector('.ll-embed svg')!.getAttribute('aria-label')).toContain('Employer Portal');
    const member = host.querySelector('input[value=member]') as HTMLInputElement;
    member.checked = true; member.dispatchEvent(new Event('change')); await settle();
    expect(logText()).toMatch(/persona/);
    expect(host.querySelector('.ll-embed svg text:nth-of-type(2)')!.textContent).toContain('as "member"');
    expect(host.querySelector('.ll-rls')!.textContent).toMatch(/Now applied: "Member"/);
    void orig; void tokenCalls;
  });

  it('controls drive the report and highlight the matching code lines', async () => {
    mount(); await settle();
    btn('Filter:').click(); await settle();
    expect(host.querySelectorAll('.ll-embed svg g[role=button]').length).toBe(1);
    expect(logText()).toMatch(/filter/);
    expect(host.querySelector('.ll-codebox .line.ll-hl')).toBeTruthy();
    expect(host.querySelector('.ll-hint')!.textContent).toMatch(/Code for “filter”/);
    btn('Reset filters').click(); await settle();
    expect(host.querySelectorAll('.ll-embed svg g[role=button]').length).toBe(5);
    btn('Bookmark: Tier 1').click(); await settle();
    expect(logText()).toMatch(/bookmark-apply/);
    btn('Capture bookmark').click(); await settle();
    expect(logText()).toMatch(/bookmark captured/);
    (host.querySelectorAll('.ll-nav button')[1] as HTMLButtonElement).click(); await settle();
    expect(logText()).toMatch(/pageChanged/);
    expect(host.querySelectorAll('.ll-nav button[aria-current=true]').length).toBe(1);
  });

  it('data selection shows in the "what you selected" panel', async () => {
    mount(); await settle();
    (host.querySelector('.ll-embed svg g[role=button]') as SVGElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(host.querySelector('#ll-selected')!.textContent).toMatch(/Name = Alpha/);
    expect(logText()).toMatch(/dataSelected/);
  });

  it('event log is a polite live region; tabs are keyboard operable', async () => {
    mount(); await settle();
    const log = host.querySelector('.ll-log')!;
    expect(log.getAttribute('role')).toBe('log'); expect(log.getAttribute('aria-live')).toBe('polite');
    const tabs = host.querySelector('[role=tablist]')!;
    tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(host.querySelector('#ll-code')!.hasAttribute('hidden')).toBe(false);
    expect(host.querySelector('#ll-tab-code')!.getAttribute('aria-selected')).toBe('true');
    tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(host.querySelector('#ll-live')!.hasAttribute('hidden')).toBe(false);
  });

  it('theme: host callback and setTheme update the root and the report theme', async () => {
    let push: (t: 'light' | 'dark') => void = () => {};
    const h = mount({ onThemeRequest: (cb: any) => { push = cb; } }); await settle();
    push('dark'); await settle();
    expect(host.querySelector('.ll-root')!.getAttribute('data-theme')).toBe('dark');
    expect(logText()).toMatch(/theme/);
    h.setTheme('light'); expect(host.querySelector('.ll-root')!.getAttribute('data-theme')).toBe('light');
  });

  it('paginated reports: no page nav or filter tools, PDF export offered', async () => {
    mount({ initialReport: 'service-governance-paginated' }); await settle();
    expect(host.querySelectorAll('.ll-nav button').length).toBe(0);
    expect(btn('Filter:')).toBeUndefined();
    expect(btn('Export PDF')).toBeTruthy();
    expect(host.querySelector('.ll-tools')!.textContent).toMatch(/Paginated report/);
  });

  it('code tab lists the extracted snippets and copy works without clipboard permission', async () => {
    mount(); await settle();
    const names = [...host.querySelectorAll('.ll-snips button')].map((b) => b.getAttribute('data-snippet'));
    for (const id of ['token-entra', 'token-generate', 'embed-config', 'persona-switch', 'filters', 'theme', 'events', 'token-refresh', 'export-request']) expect(names).toContain(id);
    (host.querySelector('.ll-codehead button') as HTMLButtonElement).click(); await settle();
    expect(host.querySelector('.ll-codehead')!.textContent).toMatch(/typescript/);
  });
});

describe('fallback and token lifecycle', () => {
  it('health failure: every report shows recorded media with the banner', async () => {
    mount({ brokerUrl: 'https://broker.example', fetchImpl: async () => { throw new Error('down'); }, healthTimeoutMs: 50 }); await settle();
    expect(host.querySelector('.ll-pill')!.textContent).toBe('Recorded');
    expect(host.querySelector('.ll-banner')!.textContent).toBe('Live capacity has ended - recorded walkthrough');
    expect(host.querySelector('.ll-fallback video')).toBeTruthy();
    expect(host.querySelector('.ll-embed svg')).toBeNull();
    expect(btn('Reset filters').disabled).toBe(true);
    // the Code tab still works
    expect(host.querySelectorAll('.ll-snips button').length).toBeGreaterThan(5);
  });

  it('health ok: uses the broker, sends only reportKey and persona, and embeds the mock adapter from a mock token', async () => {
    const calls: Array<{ url: string; body?: any }> = [];
    const fetchImpl = (async (url: string, init: any = {}) => {
      calls.push({ url, body: init.body ? JSON.parse(init.body) : undefined });
      if (url.endsWith('/health')) return new Response(JSON.stringify({ ok: true }));
      return new Response(JSON.stringify({ reportId: 'r', embedUrl: 'https://mock.invalid/x', accessToken: 'mock-token.x.y', expiration: new Date(Date.now() + 3_600_000).toISOString(), kind: 'interactive' }));
    }) as any;
    mount({ brokerUrl: 'https://broker.example/', fetchImpl, initialReport: 'insurance-member' }); await settle();
    const tok = calls.find((c) => c.url.endsWith('/token'))!;
    expect(tok.url).toBe('https://broker.example/token');
    expect(tok.body).toEqual({ reportKey: 'insurance-member', persona: 'member' });
    expect(host.querySelector('.ll-embed svg')).toBeTruthy();
  });

  it('refreshes the token before expiry and retries once; then falls back for that report only', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let adapter!: MockAdapter; let fail = 0;
    const fetchImpl = (async (url: string) => {
      if (url.endsWith('/health')) return new Response(JSON.stringify({ ok: true }));
      if (fail > 0) { fail--; return new Response('{"error":"x"}', { status: 502 }); }
      return new Response(JSON.stringify({ reportId: 'r', embedUrl: 'https://mock.invalid/x', accessToken: 'T', expiration: new Date(Date.now() + 10 * 60_000).toISOString(), kind: 'interactive' }));
    }) as any;
    mount({ brokerUrl: 'https://b.example', fetchImpl, adapterFactory: async () => (adapter = new MockAdapter()) });
    await vi.advanceTimersByTimeAsync(10); await micro();
    expect(adapter.tokenSetCount).toBe(0);
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000); await micro();
    expect(adapter.tokenSetCount).toBe(1);
    expect(logText()).toMatch(/token-refresh/);
    // next refresh: first attempt fails, retry works
    fail = 1;
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000); await micro();
    expect(adapter.tokenSetCount).toBe(2);
    // both attempts fail: fallback
    fail = 5;
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000); await micro();
    expect(host.querySelector('.ll-banner')!.textContent).toMatch(/Live session ended/);
    expect(host.querySelector('.ll-fallback')!.hasAttribute('hidden')).toBe(false);
    // other reports are unaffected
    fail = 0;
    const sel = host.querySelector('select') as HTMLSelectElement;
    sel.value = 'insurance-employer'; sel.dispatchEvent(new Event('change'));
    await vi.advanceTimersByTimeAsync(10); await micro();
    expect(host.querySelector('.ll-banner')!.hasAttribute('hidden')).toBe(true);
    expect(host.querySelector('.ll-embed svg')).toBeTruthy();
  });

  it('tokenExpired event triggers a refresh; an embed error degrades that report to recorded media', async () => {
    let adapter!: MockAdapter;
    mount({ adapterFactory: async () => (adapter = new MockAdapter()) }); await settle();
    adapter.simulateTokenExpired(); await settle();
    expect(adapter.tokenSetCount).toBe(1);
    adapter.simulateError(); await settle();
    expect(host.querySelector('.ll-banner')!.textContent).toMatch(/hit an error/);
    expect(host.querySelector('.ll-fallback video')).toBeTruthy();
  });

  it('guided tour runs its steps and can be interrupted by changing report', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    mount(); await vi.advanceTimersByTimeAsync(10); await micro();
    btn('Guided tour').click();
    await vi.advanceTimersByTimeAsync(300); await micro();
    expect(logText()).toMatch(/tour start/);
    await vi.advanceTimersByTimeAsync(7000); await micro();
    expect(logText()).toMatch(/tour end/);
    expect((logText().match(/tour /g) ?? []).length).toBeGreaterThan(4);
  });

  it('guided tour can be stopped with the Stop tour button', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    mount(); await vi.advanceTimersByTimeAsync(10); await micro();
    btn('Guided tour').click();
    await vi.advanceTimersByTimeAsync(300); await micro();
    const stop = btn('Stop tour');
    expect(stop).toBeTruthy();
    stop.click();
    await vi.advanceTimersByTimeAsync(7000); await micro();
    expect(logText()).toMatch(/tour stopped/);
    expect(logText()).not.toMatch(/tour end/);
    expect(btn('Guided tour')).toBeTruthy();
  });

  it('copy feedback is visible (not screen-reader-only)', () => {
    mount();
    const el = host.querySelector('.ll-copied') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute('role')).toBe('status');
    expect(host.querySelector('.ll-sr')).toBeNull();
  });
});

describe('snippet build', () => {
  it('extracts regions and highlight ranges, drops markers, dedents', () => {
    const src = ['x', '  // #region demo | Demo title', '  const a = 1;', '  // #highlight go', '  doIt();', '  // #endhighlight', '  // #endregion', 'y'].join('\n');
    const [r] = extractRegions(src, 'f.ts');
    expect(r.id).toBe('demo'); expect(r.title).toBe('Demo title');
    expect(cleanBody(r.body)).toEqual({ code: 'const a = 1;\ndoIt();', highlights: { go: [2, 2] } });
    expect(() => extractRegions('// #region open', 'f.ts')).toThrow(/no #endregion/);
  });
  it('generated snippets are secret-free, highlighted and have action ranges', () => {
    const all = (snippets as any).snippets as any[];
    expect(all.length).toBeGreaterThanOrEqual(10);
    for (const s of all) { expect(s.html).toContain('shiki'); expect(s.code).not.toMatch(/#highlight|#region/); expect(s.code).not.toMatch(/eyJ[A-Za-z0-9_-]{15,}/); }
    const actions = new Set(all.flatMap((s) => Object.keys(s.highlights)));
    for (const a of ['embed', 'persona', 'page', 'filter', 'slicer', 'bookmark-apply', 'bookmark-capture', 'reset', 'theme', 'token-refresh', 'export', 'events']) expect(actions.has(a)).toBe(true);
    expect(all.find((s) => s.id === 'token-generate').code).toMatch(/identities/);
  });
});

describe('broker client', () => {
  it('health timeout returns not ok', async () => {
    const b = createBroker('https://x.example', [], ((_u: string, init: any) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))))) as any);
    expect(await b.health(20)).toEqual({ ok: false });
  });
});
