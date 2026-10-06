import { describe, expect, it } from 'vitest';
import { handle, type Env } from '../src/index';

const mem = () => { const m = new Map<string, string>(); return { m, kv: { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); } } }; };
const make = (): { env: Env; m: Map<string, string> } => { const { m, kv } = mem(); return { m, env: { OWNER_KEY: 'test-owner-key', ALLOWED_ORIGINS: 'https://site.example', APP_STATE: kv } }; };
const call = (env: Env, method: string, path: string, init: { key?: string; origin?: string; body?: unknown; raw?: string; type?: string } = {}) =>
  handle(new Request('https://w.example' + path, {
    method,
    headers: { ...(init.key ? { Authorization: 'Bearer ' + init.key } : {}), ...(init.origin ? { Origin: init.origin } : {}), 'Content-Type': init.type ?? 'application/json' },
    body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
  }), env);

describe('owner state worker', () => {
  it('rejects every state call without the key, with a wrong key, or when no key is configured', async () => {
    const { env } = make();
    expect((await call(env, 'GET', '/state/demo')).status).toBe(401);
    expect((await call(env, 'GET', '/state/demo', { key: 'nope' })).status).toBe(401);
    expect((await call(env, 'PUT', '/state/demo', { key: 'nope', body: { updatedAt: 1, data: {} } })).status).toBe(401);
    expect((await call({ ...env, OWNER_KEY: undefined }, 'GET', '/state/demo', { key: 'anything' })).status).toBe(401);
  });
  it('stores and returns state for the owner', async () => {
    const { env } = make();
    expect((await call(env, 'GET', '/state/demo', { key: 'test-owner-key' })).status).toBe(404);
    const put = await call(env, 'PUT', '/state/demo', { key: 'test-owner-key', body: { updatedAt: 5, data: { k: '{"a":1}' } } });
    expect(put.status).toBe(200);
    const got = await call(env, 'GET', '/state/demo', { key: 'test-owner-key' });
    expect(await got.json()).toEqual({ updatedAt: 5, data: { k: '{"a":1}' } });
  });
  it('validates app names and bodies', async () => {
    const { env } = make();
    const k = 'test-owner-key';
    expect((await call(env, 'GET', '/state/Bad_Name', { key: k })).status).toBe(400);
    expect((await call(env, 'PUT', '/state/demo', { key: k, body: { updatedAt: 'x', data: {} } })).status).toBe(400);
    expect((await call(env, 'PUT', '/state/demo', { key: k, body: { updatedAt: 1, data: { a: 1 } } })).status).toBe(400);
    expect((await call(env, 'PUT', '/state/demo', { key: k, raw: '{not json' })).status).toBe(400);
    expect((await call(env, 'PUT', '/state/demo', { key: k, raw: '{}', type: 'text/plain' })).status).toBe(415);
    expect((await call(env, 'PUT', '/state/demo', { key: k, raw: JSON.stringify({ updatedAt: 1, data: { a: 'x'.repeat(600_000) } }) })).status).toBe(413);
  });
  it('only answers allowed origins', async () => {
    const { env } = make();
    expect((await call(env, 'GET', '/health', { origin: 'https://evil.example' })).status).toBe(403);
    const ok = await call(env, 'OPTIONS', '/state/demo', { origin: 'https://site.example' });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://site.example');
    expect((await call(env, 'GET', '/health')).status).toBe(200);
  });
  it('never echoes the key', async () => {
    const { env } = make();
    const r = await call(env, 'GET', '/state/demo', { key: 'test-owner-key' });
    let all = ''; r.headers.forEach((v, k) => { all += k + v; });
    expect(all).not.toContain('test-owner-key');
  });
});
