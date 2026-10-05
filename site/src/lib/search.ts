export interface SearchItem { kind: 'project' | 'app' | 'page' | 'tag'; title: string; hint: string; url: string; keywords: string }

/** Tiny scorer for the command palette: every query word must match; earlier/title matches rank higher. */
export function searchItems(items: SearchItem[], query: string, limit = 8): SearchItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items.slice(0, limit);
  const scored: Array<{ it: SearchItem; s: number }> = [];
  for (const it of items) {
    const title = it.title.toLowerCase(), hay = `${title} ${it.hint.toLowerCase()} ${it.keywords.toLowerCase()}`;
    let s = 0, ok = true;
    for (const w of words) {
      const i = hay.indexOf(w);
      if (i < 0) { ok = false; break; }
      s += title.startsWith(w) ? 100 : title.includes(w) ? 60 : 20 - Math.min(i, 19) / 2;
      if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay)) s += 10;
    }
    if (ok) scored.push({ it, s: s + (it.kind === 'page' ? 2 : it.kind === 'tag' ? -2 : 0) });
  }
  return scored.sort((a, b) => b.s - a.s || a.it.title.localeCompare(b.it.title)).slice(0, limit).map((x) => x.it);
}
