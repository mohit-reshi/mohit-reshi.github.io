#!/usr/bin/env node
// WCAG contrast check for the design tokens in site/src/styles/tokens.css (both themes). Exit 1 on failures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './lib.mjs';

const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

export function parseTokens(css) {
  const themes = {};
  for (const m of css.matchAll(/(:root(?:\[data-theme=['"]?(\w+)['"]?\])?)\s*\{([^}]*)\}/g)) {
    const name = m[2] ?? 'dark';
    themes[name] = { ...(themes[name] ?? {}), ...Object.fromEntries([...m[3].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((x) => [x[1], x[2]])) };
  }
  return themes;
}

// [foreground token, background token, minimum ratio, what]
export const PAIRS = [
  ['fg', 'bg', 7, 'body text'], ['fg', 'bg-elev', 7, 'text on cards'], ['fg-muted', 'bg', 4.5, 'muted text'], ['fg-muted', 'bg-elev', 4.5, 'muted text on cards'],
  ['accent-text', 'bg', 4.5, 'accent text / links'], ['accent-text', 'bg-elev', 4.5, 'accent text on cards'], ['accent-ink', 'accent', 4.5, 'text on accent buttons'],
  ['accent-line', 'bg', 3, 'accent borders and indicators'], ['accent-line', 'bg-elev', 3, 'accent borders on cards'], ['line-strong', 'bg', 3, 'input and focus borders'], ['focus', 'bg', 3, 'focus ring'],
];

if (process.argv[1]?.endsWith('contrast.mjs')) {
  const themes = parseTokens(readFileSync(join(REPO_ROOT, 'site/src/styles/tokens.css'), 'utf8'));
  let bad = 0;
  for (const [theme, t] of Object.entries(themes)) for (const [f, b, min, what] of PAIRS) {
    if (!t[f] || !t[b]) continue;
    const r = ratio(t[f], t[b]);
    const ok = r >= min;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${theme.padEnd(5)} ${what.padEnd(26)} ${f} on ${b}: ${r.toFixed(2)} (min ${min})`);
  }
  if (!Object.keys(themes).length) { console.error('no tokens found'); process.exit(1); }
  process.exit(bad ? 1 : 0);
}
