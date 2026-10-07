// Pulls interview questions (and answers, when present) out of pasted text: notes, emails, forum threads, documents.
// Rule based and deliberately forgiving. Each item carries a confidence so the UI can flag splits worth checking.
import { norm, stripBullet, isBullet } from './text.js';

const QWORD = /^(?:what|why|how|when|where|who|which|whom|whose|can you|could you|would you|will you|have you|has the|do you|does|did you|are you|is there|is it|was there|should)\b/i;
const IMPERATIVE = /^(?:tell me|explain|describe|walk me through|give me|give an example|write (?:a|an|the)|compare|differentiate|define|discuss|talk (?:me )?through|talk about|share (?:an|a)|list|name (?:a|an|the|some)|outline|illustrate|demonstrate|justify)\b/i;
const Q_MARK = /^\s*(?:q(?:uestion)?\s*\d*\s*[:.)\-]|\d{1,3}\s*[.)]\s*(?:q(?:uestion)?\s*[:.)-])?)\s*/i;
const A_MARK = /^\s*(?:a(?:ns(?:wer)?)?\s*\d*\s*[:.)\-])\s*/i;

function isQuestionLine(raw) {
  const t = norm(stripBullet(raw).replace(Q_MARK, ''));
  if (!t || t.length > 320) return null;
  if (/[?]\s*[)"'”]*$/.test(t)) return { text: t, strong: true };
  if (IMPERATIVE.test(t) && t.length <= 240) return { text: t, strong: false };
  // A numbered or bulleted short line starting with a question word, even without a question mark.
  if ((isBullet(raw) || /^\s*\d{1,3}[.)]/.test(raw)) && QWORD.test(t) && t.length <= 200) return { text: t, strong: false };
  return null;
}

export function extractQA(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const items = [];
  let cur = null; let inCode = false;
  let prevBlank = true;
  const flush = () => { if (cur) { cur.lines = cur.a.length; cur.a = cur.a.join('\n').replace(/\n{3,}/g, '\n\n').trim(); items.push(cur); cur = null; } };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*```/.test(raw)) { inCode = !inCode; if (cur) cur.a.push(raw); continue; }
    if (inCode) { if (cur) cur.a.push(raw); continue; }
    const t = norm(raw);
    if (!t) { if (cur && cur.a.length) cur.a.push(''); prevBlank = true; continue; }
    const wasBlank = prevBlank; prevBlank = false;
    const explicitA = A_MARK.test(raw) && cur;
    if (explicitA) { cur.a.push(norm(raw.replace(A_MARK, ''))); continue; }
    const explicitQ = Q_MARK.test(raw) && /^\s*q/i.test(raw);
    const qLine = isQuestionLine(raw);
    // Inside an answer, only a clear marker or a real question line starts a new question.
    if (qLine && (qLine.strong || explicitQ || wasBlank || !cur || !cur.a.length || /^\s*(?:\d{1,3}[.)]|[•*-])\s/.test(raw))) {
      flush();
      let q = qLine.text;
      // A question wrapped onto the next line: current line has no end mark, next starts lowercase.
      while (i + 1 < lines.length && !/[?.]$/.test(q) && /^\s*[a-z(]/.test(lines[i + 1]) && norm(lines[i + 1]).length < 160 && !isQuestionLine(lines[i + 1])) { q += ' ' + norm(lines[i + 1]); i++; }
      cur = { q, a: [], confidence: qLine.strong || explicitQ ? 'high' : 'low' };
      continue;
    }
    if (cur) cur.a.push(isBullet(raw) ? '- ' + stripBullet(raw) : t);
  }
  flush();
  return items.map((it) => ({ q: it.q, a: it.a, confidence: it.confidence === 'high' && it.lines < 40 ? 'high' : 'low' })).filter((it) => it.q.length >= 8);
}
