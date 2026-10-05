import { describe, expect, it, vi } from 'vitest';
import { RealPowerBiAdapter } from '../src/adapters/real';

function fakeLib() {
  const handlers: Record<string, (e: any) => void> = {};
  const page = (name: string, displayName: string, active = false) => ({ name, displayName, isActive: active, visibility: 0, setActive: vi.fn(async () => {}), getVisuals: vi.fn(async () => [{ name: 'slc1', setSlicerState: vi.fn(async () => {}) }]) });
  const pages = [page('p1', 'One', true), page('p2', 'Two'), { ...page('p3', 'Hidden'), visibility: 1 }];
  const report = {
    on: vi.fn((name: string, cb: (e: any) => void) => { handlers[name] = cb; if (name === 'loaded') setTimeout(() => cb({ detail: null }), 0); }),
    getPages: vi.fn(async () => pages), updateFilters: vi.fn(async () => {}), removeFilters: vi.fn(async () => {}),
    bookmarksManager: { apply: vi.fn(async () => {}), capture: vi.fn(async () => ({ name: 'B1', state: 'STATE' })) },
    applyTheme: vi.fn(async () => {}), resetTheme: vi.fn(async () => {}), fullscreen: vi.fn(), setAccessToken: vi.fn(async () => {}),
  };
  const service = { embed: vi.fn(() => report), reset: vi.fn(), bootstrap: vi.fn() };
  const lib: any = {
    service: { Service: function () { return service; } }, factories: { hpmFactory: {}, wpmpFactory: {}, routerFactory: {} },
    models: { TokenType: { Embed: 1 }, Permissions: { Read: 0 }, BackgroundType: { Transparent: 1 }, FilterType: { Basic: 1 }, FiltersOperations: { Replace: 3 } },
  };
  return { lib, service, report, pages, handlers };
}
const token = { reportId: 'rid', embedUrl: 'https://app.powerbi.com/reportEmbed?x', accessToken: 'tok', expiration: '', kind: 'interactive' as const };

describe('RealPowerBiAdapter (fake powerbi-client)', () => {
  it('skips events the SDK does not know (tokenExpired) and still binds the rest', async () => {
    const f = fakeLib();
    const allowed = new Set(['loaded', 'rendered', 'pageChanged', 'dataSelected', 'visualClicked', 'buttonClicked', 'error']);
    const orig = f.report.on.getMockImplementation()!;
    f.report.on.mockImplementation((name: string, cb: (e: any) => void) => { if (!allowed.has(name)) throw new Error(`eventName must be one of ... You passed: ${name}`); orig(name, cb); });
    const a = new RealPowerBiAdapter(async () => f.lib);
    const got: string[] = [];
    for (const ev of ['loaded', 'rendered', 'pageChanged', 'dataSelected', 'visualClicked', 'buttonClicked', 'tokenExpired', 'error'] as const) a.on(ev, () => got.push(ev));
    await a.embed(document.createElement('div'), token, { reportKey: 'k', kind: 'interactive', persona: null, title: 'T' });
    expect(Object.keys(f.handlers)).toContain('error');
    expect(Object.keys(f.handlers)).not.toContain('tokenExpired');
  });
  it('embeds with hidden panes and the broker token, then drives the report', async () => {
    const f = fakeLib();
    const a = new RealPowerBiAdapter(async () => f.lib);
    const seen: Array<[string, unknown]> = [];
    a.on('pageChanged', (p) => seen.push(['pageChanged', p]));
    const el = document.createElement('div');
    await a.embed(el, token, { reportKey: 'k', kind: 'interactive', persona: null, title: 'T' });
    const cfg = (f.service.embed.mock.calls[0] as any[])[1];
    expect(cfg).toMatchObject({ type: 'report', id: 'rid', embedUrl: token.embedUrl, accessToken: 'tok', tokenType: 1, permissions: 0 });
    expect(cfg.settings.panes).toEqual({ filters: { visible: false }, pageNavigation: { visible: false } });
    expect(await a.getPages()).toEqual([{ name: 'p1', displayName: 'One' }, { name: 'p2', displayName: 'Two' }]); // hidden page not offered
    await a.setPage('p2'); expect(f.pages[1].setActive).toHaveBeenCalled();
    await a.applyFilter({ table: 'T', column: 'C', values: ['x'] });
    expect(f.report.updateFilters).toHaveBeenCalledWith(3, [expect.objectContaining({ target: { table: 'T', column: 'C' }, operator: 'In', values: ['x'] })]);
    await a.setSlicer({ visualName: 'slc1', table: 'T', column: 'C', values: ['y'] });
    await a.applyBookmark('b'); expect(f.report.bookmarksManager.apply).toHaveBeenCalledWith('b');
    expect(await a.captureBookmark()).toEqual({ name: 'B1', state: 'STATE' });
    await a.resetFilters(); expect(f.report.removeFilters).toHaveBeenCalled();
    await a.setTheme({ name: 'x' }); expect(f.report.applyTheme).toHaveBeenCalledWith({ themeJson: { name: 'x' } });
    await a.setTheme(null); expect(f.report.resetTheme).toHaveBeenCalled();
    await a.setAccessToken('new'); expect(f.report.setAccessToken).toHaveBeenCalledWith('new');
    f.handlers.pageChanged({ detail: { newPage: { name: 'p2' } } });
    expect(seen).toEqual([['pageChanged', { newPage: { name: 'p2' } }]]);
    a.destroy(); expect(f.service.reset).toHaveBeenCalled();
  });
  it('rejects the embed promise on an SDK error event', async () => {
    const f = fakeLib();
    f.report.on.mockImplementation((name: string, cb: any) => { if (name === 'error') setTimeout(() => cb({ detail: { message: 'bad token' } }), 0); });
    const a = new RealPowerBiAdapter(async () => f.lib);
    await expect(a.embed(document.createElement('div'), token, { reportKey: 'k', kind: 'interactive', persona: null, title: 'T' })).rejects.toThrow('bad token');
  });
});
