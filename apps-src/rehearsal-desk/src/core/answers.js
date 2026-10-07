// Quick, explainable checks on a typed answer: length, structure, ownership, numbers and hedging.
import { wordCount, speakSeconds } from './text.js';

const HEDGES = /\b(maybe|kind of|sort of|i think|i guess|probably|just|a bit|somewhat|hopefully|i suppose|basically|actually|honestly)\b/gi;
const RESULT = /\b(result(?:ed)?|led to|so that|which (?:meant|saved|raised|cut|reduced|increased)|saved|reduced|increased|improved|cut|grew|raised|delivered|outcome|impact|as a result|adopted)\b/i;
const ACT_RX = /\b(i (?:built|led|ran|wrote|designed|created|decided|proposed|analysed|analyzed|presented|set up|automated|negotiated|investigated|fixed|owned|introduced|worked|asked|spoke|chose|tested|delivered|made))\b/i;
const SITUATION = /\b(when|at the time|we were|the team was|the problem|the challenge|there was|our|the business|context|situation|needed to|had to)\b/i;
const TASK = /\b(my (?:job|role|task|goal|responsibility)|i was (?:asked|responsible|tasked)|i needed to|i had to|the goal)\b/i;

export function analyseAnswer(text, targetSeconds) {
  const t = String(text || '');
  const wc = wordCount(t);
  const sec = speakSeconds(t);
  const we = (t.match(/\bwe\b/gi) || []).length, i = (t.match(/\bI\b/g) || []).length;
  const hedges = (t.match(HEDGES) || []).length;
  const hasNumber = /\d|%/.test(t.replace(/\[add:[^\]]*\]/gi, ''));
  const gaps = (t.match(/\[add:[^\]]*\]/gi) || []).length;
  const star = { situation: SITUATION.test(t), task: TASK.test(t), action: ACT_RX.test(t), result: RESULT.test(t) };
  const checks = [
    { id: 'gaps', ok: gaps === 0 && wc > 0, text: gaps ? gaps + ' gap(s) still marked [add: ...]' : 'No unfilled gaps' },
    { id: 'length', ok: !targetSeconds || (sec >= targetSeconds * 0.5 && sec <= targetSeconds * 1.4), text: targetSeconds ? 'Speaking time about ' + sec + ' s (target ' + targetSeconds + ' s)' : 'Speaking time about ' + sec + ' s' },
    { id: 'result', ok: star.result, text: star.result ? 'Names a result' : 'No clear result yet' },
    { id: 'number', ok: hasNumber, text: hasNumber ? 'Includes a number' : 'No number yet' },
    { id: 'owner', ok: i >= we || we === 0, text: i >= we ? 'Clear about what you did' : 'Many "we": say what you did' },
    { id: 'hedge', ok: hedges <= 1, text: hedges > 1 ? hedges + ' hedging words (' + (t.match(HEDGES) || []).slice(0, 3).join(', ') + ')' : 'Confident wording' },
  ];
  return { words: wc, seconds: sec, star, checks, gaps };
}
