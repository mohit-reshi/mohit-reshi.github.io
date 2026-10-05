# Live Lab token broker (Cloudflare Worker)

Hands the browser a short-lived Power BI **embed token**. The browser only ever sends `reportKey` and `persona`; the Worker maps them to the allowlisted
dataset/identity from the `REPORTS_CONFIG` secret. Free tier only.

| Endpoint | Purpose |
|---|---|
| `GET /health` | `{ ok, checkedAt }`, cached 60 s. `ok` only if an Entra token can be obtained and at least one configured report is reachable. The site uses it to switch to recorded media. |
| `POST /token` | body `{ reportKey, persona? }` -> `{ reportId, embedUrl, accessToken, expiration, kind }` |
| `POST /export` | optional (`EXPORT_ENABLED=true` and `exportEnabled` on the report). body `{ reportKey, persona?, format?: "PDF"|"PNG" }` -> file stream. |

Rules enforced (see `test/worker.test.ts`): extra body fields are rejected (no identities, datasets, roles or usernames from the client); unknown report/persona rejected;
identities sent to GenerateToken **only** when `rls: true`; strict CORS allowlist (`ALLOWED_ORIGINS`); method, size (1 KB) and content-type checks; minimal error bodies;
Entra token cached in memory (concurrent requests share one fetch); tokens and secrets are never logged.

## Mock mode (no tenant)

`MOCK=true` (the default in `wrangler.toml`) returns deterministic fake tokens in the real response shape.

```powershell
cd live-lab\worker
npm install
npm test            # vitest, mocked fetch
npm run typecheck
npx wrangler dev --var MOCK:true --var REPORTS_CONFIG:'{...contents of reports.config.example.json on one line...}'
```

## Real mode (deploy)

Exact steps are in `docs/live-lab/OWNER-RUNBOOK.md`. In short: `npx wrangler login`, `npx wrangler secret put TENANT_ID` / `CLIENT_ID` / `CLIENT_SECRET` / `REPORTS_CONFIG`,
set `ALLOWED_ORIGINS` and `MOCK = "false"` in `wrangler.toml`, `npx wrangler deploy`.

`REPORTS_CONFIG` shape: see `reports.config.example.json`. Real IDs live only in that secret.

## Rate limiting (choice and why)

If a Workers **Rate Limiting binding** named `RATE_LIMITER` is configured it is used (20 token requests/min/IP, 3 export requests/min/IP). If the binding is not available on your plan,
the Worker falls back to a per-location counter in the Cache API: best effort (counts are per Cloudflare location and may be evicted) but free and dependency-free. Whether the binding is
available on the free plan could not be verified from here (Cloudflare docs were not reachable), so the fallback is the default and the binding block is commented out in `wrangler.toml`.

## Turnstile (optional)

`TURNSTILE_ENABLED=true` plus the `TURNSTILE_SECRET` secret makes `/token` and `/export` require `turnstileToken` in the body. Off by default.

## Not verified (no access to Microsoft/Cloudflare docs from the build environment)

GenerateToken multi-resource body shape for paginated reports, whether service principals can export RLS reports with an effective identity in your tenant, and the free-plan rate-limit binding.
The runbook lists how to check each in 5 minutes.
