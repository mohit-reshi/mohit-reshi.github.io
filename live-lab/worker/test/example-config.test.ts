import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { parseReportsConfig } from '../src/config';

it('the shipped example config is valid and uses the five public report keys', () => {
  const cfg = parseReportsConfig(readFileSync(resolve(process.cwd(), 'reports.config.example.json'), 'utf8'));
  const pub = JSON.parse(readFileSync(resolve(process.cwd(), '../reports.config.json'), 'utf8')).reports.map((r: any) => r.key);
  expect(Object.keys(cfg).sort()).toEqual([...pub].sort());
});
