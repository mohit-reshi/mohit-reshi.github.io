import sharp from 'sharp';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function wrap(text: string, max: number, lines: number): string[] {
  const out: string[] = []; let cur = '';
  for (let w of text.split(/\s+/).filter(Boolean)) {
    if (w.length > max) w = w.slice(0, max - 1) + '…';
    if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out.slice(0, lines).map((l, i) => (i === lines - 1 && out.length > lines ? l.replace(/\s*\S*$/, '') + '…' : l));
}

/** 1200x630 social card drawn from an SVG (system sans font; the site itself uses self-hosted fonts). */
export async function ogCard(title: string, sub: string, tags: string[]): Promise<Buffer> {
  const t = wrap(title, 24, 3), s = wrap(sub, 62, 3);
  const bars = [120, 210, 160, 280, 190, 330, 240, 380].map((h, i) => `<rect x="${660 + i * 62}" y="${560 - h}" width="40" height="${h}" rx="5" fill="${['#ffc83d', '#4fd1c5', '#7c9cff'][i % 3]}" opacity="${0.35 + (i % 4) * 0.15}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0b0f14"/>${bars}
  <rect x="64" y="64" width="64" height="6" fill="#ffc83d"/>
  <text x="64" y="120" fill="#a3adbd" font-family="DejaVu Sans Mono, monospace" font-size="22" letter-spacing="3">MOHIT RESHI · POWER BI &amp; FABRIC</text>
  ${t.map((l, i) => `<text x="64" y="${220 + i * 76}" fill="#eef1f6" font-family="DejaVu Sans, Arial, sans-serif" font-size="64" font-weight="700">${esc(l)}</text>`).join('')}
  ${s.map((l, i) => `<text x="64" y="${220 + t.length * 76 + 24 + i * 34}" fill="#a3adbd" font-family="DejaVu Sans, Arial, sans-serif" font-size="26">${esc(l)}</text>`).join('')}
  <text x="64" y="590" fill="#ffc83d" font-family="DejaVu Sans Mono, monospace" font-size="22">${esc(tags.slice(0, 4).join('  ·  '))}</text></svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
