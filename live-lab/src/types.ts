/** Public contract between the Live Lab module and the host page (SPEC 6.4) plus internal adapter types. */

export type ReportKind = 'interactive' | 'paginated';
export type Theme = 'light' | 'dark';

export interface PersonaDef { key: string; label: string; description: string }
export interface FallbackMedia { video?: string; poster?: string; gallery?: string[]; caption?: string }
export interface TourStep { label: string; action: 'page' | 'filter' | 'slicer' | 'bookmark' | 'reset'; arg?: string; delayMs?: number }
export interface ReportControls {
  filter?: { label: string; table: string; column: string; values: (string | number)[] };
  slicer?: { label: string; visualName: string; table: string; column: string; values: (string | number)[] };
  bookmarks?: { name: string; label: string }[];
  tour?: TourStep[];
}
export interface ReportEntry {
  key: string;
  title: string;
  group: string;
  kind: ReportKind;
  personas?: PersonaDef[];
  fallbackMedia?: FallbackMedia;
  projectSlug?: string;
  exportEnabled?: boolean;
  controls?: ReportControls;
}
export interface LiveLabConfig { reports: ReportEntry[]; themes?: Partial<Record<Theme, Record<string, unknown>>> }

export interface MountOptions {
  brokerUrl: string;
  config: LiveLabConfig;
  theme: Theme;
  /** Called once at mount with a callback; the host can call it later with a Theme to change the theme. */
  onThemeRequest?: (cb: (t: Theme) => void) => void;
  /** Report key to select first (for example from a ?report= query parameter). */
  initialReport?: string;
  /** Test hooks (not part of the public contract). */
  fetchImpl?: typeof fetch;
  healthTimeoutMs?: number;
  adapterFactory?: (kind: 'mock' | 'real') => Promise<EmbedAdapter>;
}
export interface LiveLabHandle { destroy(): void; setTheme(t: Theme): void }

export interface TokenInfo { reportId: string; embedUrl: string; accessToken: string; expiration: string; kind: ReportKind }
export interface HealthInfo { ok: boolean; checkedAt?: string }

export type EmbedEventName = 'loaded' | 'rendered' | 'pageChanged' | 'dataSelected' | 'visualClicked' | 'buttonClicked' | 'tokenExpired' | 'error';
export interface PageInfo { name: string; displayName: string }
export interface EmbedContext { reportKey: string; kind: ReportKind; persona: string | null; title: string; pageCount?: number; fallbackMedia?: FallbackMedia }

/** Everything the UI needs from an embedded report. RealPowerBiAdapter and MockAdapter both implement it. */
export interface EmbedAdapter {
  readonly kind: 'mock' | 'real';
  prewarm?(container: HTMLElement): void;
  embed(container: HTMLElement, token: TokenInfo, ctx: EmbedContext): Promise<void>;
  on(event: EmbedEventName, cb: (payload: unknown) => void): void;
  getPages(): Promise<PageInfo[]>;
  setPage(name: string): Promise<void>;
  applyFilter(f: { table: string; column: string; values: (string | number)[] }): Promise<void>;
  setSlicer(s: { visualName: string; table: string; column: string; values: (string | number)[] }): Promise<void>;
  applyBookmark(name: string, label?: string): Promise<void>;
  captureBookmark(): Promise<{ name: string; state: string }>;
  resetFilters(): Promise<void>;
  setTheme(theme: Record<string, unknown> | null): Promise<void>;
  fullscreen(): void;
  setAccessToken(token: string): Promise<void>;
  destroy(): void;
}

export type ActionId = 'embed' | 'persona' | 'page' | 'filter' | 'slicer' | 'bookmark-apply' | 'bookmark-capture' | 'reset' | 'theme' | 'token-refresh' | 'export' | 'events' | 'tour';

export interface Snippet { id: string; title: string; lang: string; file: string; code: string; html: string; highlights: Partial<Record<ActionId, [number, number]>> }
