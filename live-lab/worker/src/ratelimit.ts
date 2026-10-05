import type { Env } from './types';

/**
 * Rate limiter factory. Uses the Workers Rate Limiting binding (env.RATE_LIMITER) when configured.
 * Fallback: a per-location counter in the Cache API, keyed by bucket+client+minute. It is best effort
 * (counts are per Cloudflare location and can be evicted) but needs no paid feature.
 */
export function makeRateLimiter(env: Env) {
  return async function rateLimit(bucket: string, key: string, limit: number, windowSec: number): Promise<boolean> {
    if (env.RATE_LIMITER) return (await env.RATE_LIMITER.limit({ key: `${bucket}:${key}` })).success;
    const cache = (globalThis as any).caches?.default as Cache | undefined;
    if (!cache) return true;
    const win = Math.floor(Date.now() / 1000 / windowSec);
    const url = `https://ratelimit.invalid/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}/${win}`;
    const hit = await cache.match(url);
    const n = hit ? Number(await hit.text()) : 0;
    if (n >= limit) return false;
    await cache.put(url, new Response(String(n + 1), { headers: { 'Cache-Control': `max-age=${windowSec}` } }));
    return true;
  };
}
