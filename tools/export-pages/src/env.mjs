// Tiny .env reader (no dependency). Values already in process.env win.
import { readFileSync, existsSync } from 'node:fs';

export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

export function loadEnv(path = '.env', env = process.env) {
  const file = existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
  return { ...file, ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== '')) };
}

export function requireCreds(env) {
  const missing = ['TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing ${missing.join(', ')}. Copy .env.example to .env and fill it in (never commit it).`);
  return { tenantId: env.TENANT_ID, clientId: env.CLIENT_ID, clientSecret: env.CLIENT_SECRET };
}
