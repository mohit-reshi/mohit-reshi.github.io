import { mountLiveLab, type LiveLabHandle, type Theme } from '../src/index';
import config from '../reports.config.json';

const app = document.getElementById('app')!;
const broker = document.getElementById('broker') as HTMLInputElement;
let handle: LiveLabHandle | null = null;
let theme: Theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
let pushTheme: ((t: Theme) => void) | null = null;

function mount() {
  handle?.destroy();
  const q = new URLSearchParams(location.search);
  const url = q.get('broker') ?? broker.value;
  broker.value = url;
  document.body.dataset.theme = theme;
  handle = mountLiveLab(app, { brokerUrl: url, config: config as any, theme, initialReport: q.get('report') ?? undefined, onThemeRequest: (cb) => { pushTheme = cb; } });
}
document.getElementById('remount')!.addEventListener('click', mount);
document.getElementById('theme')!.addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; document.body.dataset.theme = theme; pushTheme?.(theme); });
mount();
