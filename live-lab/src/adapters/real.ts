import type { EmbedAdapter, EmbedContext, EmbedEventName, PageInfo, TokenInfo } from '../types';

type PbiLib = typeof import('powerbi-client');

const EVENTS: EmbedEventName[] = ['loaded', 'rendered', 'pageChanged', 'dataSelected', 'visualClicked', 'buttonClicked', 'error'];

/** Real adapter on top of powerbi-client. The library is loaded lazily on first use. */
export class RealPowerBiAdapter implements EmbedAdapter {
  readonly kind = 'real' as const;
  private lib: PbiLib | null = null;
  private service: any = null;
  private report: any = null;
  private container: HTMLElement | null = null;
  private handlers = new Map<EmbedEventName, (p: unknown) => void>();
  private pageNames = new Map<string, any>();

  constructor(private loader: () => Promise<PbiLib> = () => import('powerbi-client')) {}

  private async init() {
    if (!this.lib) {
      this.lib = await this.loader();
      this.service = new this.lib.service.Service(this.lib.factories.hpmFactory, this.lib.factories.wpmpFactory, this.lib.factories.routerFactory);
    }
    return this.lib;
  }

  prewarm(container: HTMLElement) {
    // Pre-warm the iframe so the first embed is quicker (no token needed for bootstrap).
    void this.init().then(() => this.service.bootstrap(container, { type: 'report', hostname: undefined }));
  }

  // #region embed-config | Embed the report with the token the broker returned
  async embed(container: HTMLElement, token: TokenInfo, ctx: EmbedContext) {
    const { models } = await this.init();
    this.container = container;
    this.service.reset(container);
    // #highlight embed
    const config = {
      type: 'report',
      id: token.reportId,
      embedUrl: token.embedUrl,
      accessToken: token.accessToken,
      tokenType: models.TokenType.Embed,
      permissions: models.Permissions.Read,
      settings: {
        // Hide the native page tabs and filter pane: the site draws its own controls.
        panes: { filters: { visible: false }, pageNavigation: { visible: false } },
        background: models.BackgroundType.Transparent,
        navContentPaneEnabled: false,
      },
    };
    this.report = this.service.embed(container, config);
    // #endhighlight
    for (const [name, cb] of this.handlers) this.bind(name, cb);
    await new Promise<void>((resolve, reject) => {
      this.report.on('loaded', () => resolve());
      this.report.on('error', (e: any) => reject(new Error(e?.detail?.message ?? 'embed error')));
    });
  }
  // #endregion

  // #region events | Subscribe to report events and forward them to the event log
  private bind(name: EmbedEventName, cb: (p: unknown) => void) {
    // #highlight events
    // 'tokenExpired' exists only in the mock adapter: the SDK has no such event (the UI refreshes on a timer).
    // A name the installed SDK rejects must never stop the remaining events from being bound.
    if (name === 'tokenExpired') return;
    try { this.report?.on(name, (e: any) => cb(e?.detail ?? null)); } catch { /* unsupported event name in this SDK version */ }
    // #endhighlight
  }

  on(event: EmbedEventName, cb: (payload: unknown) => void) {
    this.handlers.set(event, cb);
    if (this.report) this.bind(event, cb);
  }
  // #endregion

  async getPages(): Promise<PageInfo[]> {
    const pages = await this.report.getPages();
    this.pageNames.clear();
    pages.forEach((p: any) => this.pageNames.set(p.name, p));
    return pages.filter((p: any) => p.visibility !== 1).map((p: any) => ({ name: p.name, displayName: p.displayName }));
  }

  // #region filters | Pages, filters, slicers and bookmarks driven from the site
  async setPage(name: string) {
    // #highlight page
    await this.pageNames.get(name)?.setActive();
    // #endhighlight
  }

  async applyFilter(f: { table: string; column: string; values: (string | number)[] }) {
    const { models } = await this.init();
    // #highlight filter
    const filter = { $schema: 'http://powerbi.com/product/schema#basic', target: { table: f.table, column: f.column }, operator: 'In', values: f.values, filterType: models.FilterType.Basic };
    await this.report.updateFilters(models.FiltersOperations.Replace, [filter]);
    // #endhighlight
  }

  async setSlicer(s: { visualName: string; table: string; column: string; values: (string | number)[] }) {
    const active = (await this.report.getPages()).find((p: any) => p.isActive);
    const visuals = await active.getVisuals();
    const slicer = visuals.find((v: any) => v.name === s.visualName);
    // #highlight slicer
    await slicer?.setSlicerState({ filters: [{ $schema: 'http://powerbi.com/product/schema#basic', target: { table: s.table, column: s.column }, operator: 'In', values: s.values }] });
    // #endhighlight
  }

  async applyBookmark(name: string, _label?: string) {
    // #highlight bookmark-apply
    await this.report.bookmarksManager.apply(name);
    // #endhighlight
  }

  async captureBookmark() {
    // #highlight bookmark-capture
    const bm = await this.report.bookmarksManager.capture();
    // #endhighlight
    return { name: bm.name, state: bm.state };
  }

  async resetFilters() {
    // #highlight reset
    await this.report.removeFilters();
    // #endhighlight
  }
  // #endregion

  // #region theme | Match the report theme to the site theme
  async setTheme(theme: Record<string, unknown> | null) {
    // #highlight theme
    if (theme) await this.report.applyTheme({ themeJson: theme });
    else await this.report.resetTheme();
    // #endhighlight
  }
  // #endregion

  fullscreen() { this.report?.fullscreen(); }

  // #region token-refresh-call | Embedded report: accept a fresh token
  async setAccessToken(token: string) {
    // #highlight token-refresh
    await this.report.setAccessToken(token);
    // #endhighlight
  }
  // #endregion

  destroy() {
    try { if (this.container && this.service) this.service.reset(this.container); } catch { /* ignore */ }
    this.report = null;
    this.pageNames.clear();
  }
}
