/** Procedural mini-dashboards for the Index layout, seeded by a project slug (placeholders for projects without a cover). */
export interface ArtPalette { bg: string; fg: string; mute: string; line: string; accent: string }

export function readPalette(): ArtPalette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return { bg: v('--bg-elev', '#fff'), fg: v('--fg', '#000'), mute: v('--fg-faint', '#666'), line: v('--line-strong', '#999'), accent: v('--accent', '#d9300f') };
}

function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^= h >>> 16) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Draw into a canvas whose backing store is already sized (w x h in CSS pixels, scaled by dpr). */
export function drawArt(canvas: HTMLCanvasElement, w: number, h: number, seed: string, pal: ArtPalette, dpr = 1) {
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d'); if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = rng(seed);
  const variant = Math.floor(r() * 3);
  const pad = Math.max(6, w * 0.045), u = w / 100;
  c.fillStyle = pal.bg; c.fillRect(0, 0, w, h);
  c.lineWidth = Math.max(1, u * 0.35); c.strokeStyle = pal.line;
  // title bar
  c.fillStyle = pal.fg; c.fillRect(pad, pad, w * (0.22 + r() * 0.2), u * 2.2);
  c.fillStyle = pal.accent; c.fillRect(w - pad - u * 6, pad, u * 6, u * 2.2);
  // KPI tiles
  const kpis = 3, tw = (w - pad * 2 - u * 3 * (kpis - 1)) / kpis, ty = pad + u * 5, th = h * 0.2;
  for (let i = 0; i < kpis; i++) {
    const x = pad + i * (tw + u * 3);
    c.strokeRect(x + 0.5, ty + 0.5, tw, th);
    c.fillStyle = i === 0 ? pal.accent : pal.fg; c.fillRect(x + u * 2, ty + th * 0.28, tw * (0.35 + r() * 0.4), th * 0.28);
    c.fillStyle = pal.mute; c.fillRect(x + u * 2, ty + th * 0.7, tw * 0.5, th * 0.08);
  }
  const top = ty + th + u * 4, bh = h - top - pad;
  const split = variant === 1 ? 0.5 : 0.62;
  const cw = (w - pad * 2) * split - u * 1.5;
  // bar chart
  const n = 7 + Math.floor(r() * 5), bw = cw / n;
  c.beginPath(); c.moveTo(pad, top + bh + 0.5); c.lineTo(pad + cw, top + bh + 0.5); c.stroke();
  const hi = Math.floor(r() * n);
  for (let i = 0; i < n; i++) { const bhh = bh * (0.2 + r() * 0.78); c.fillStyle = i === hi ? pal.accent : pal.fg; c.fillRect(pad + i * bw + bw * 0.18, top + bh - bhh, bw * 0.64, bhh); }
  // right panel: line chart or matrix
  const rx = pad + cw + u * 3, rw = w - pad - rx;
  if (variant === 2) {
    const rows = 5, cols = 4, cw2 = rw / cols, rh = bh / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { c.fillStyle = r() > 0.82 ? pal.accent : r() > 0.5 ? pal.line : pal.mute; c.globalAlpha = y === 0 ? 1 : 0.55 + r() * 0.3; c.fillRect(rx + x * cw2, top + y * rh + rh * 0.25, cw2 * 0.78, rh * 0.4); }
    c.globalAlpha = 1;
  } else {
    c.strokeStyle = pal.fg; c.lineWidth = Math.max(1.5, u * 0.6); c.beginPath();
    let y = 0.5; const pts = 10;
    for (let i = 0; i < pts; i++) { y = Math.min(0.92, Math.max(0.1, y + (r() - 0.5) * 0.45)); const px = rx + (rw * i) / (pts - 1), py = top + bh * (1 - y); i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.stroke();
    c.fillStyle = pal.accent; c.beginPath(); c.arc(rx + rw, top + bh * (1 - y), Math.max(2, u * 0.9), 0, Math.PI * 2); c.fill();
  }
}
