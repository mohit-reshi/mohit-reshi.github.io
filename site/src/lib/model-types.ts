/** Shared constants and tiny helpers for the Model View modules (kept apart so the modules do not import each other in a circle). */
export const GRID = { CW: 244, G: 56, SW: 260, PAD: 16, STEP: 11, CH_MIN: 56, MARGIN: 24 };
export const jaccard = (a: string[], b: string[]) => { const s = new Set(a); let i = 0; for (const x of b) if (s.has(x)) i++; return i / (a.length + b.length - i || 1); };
