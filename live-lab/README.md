# live-lab

Embeddable Live Lab for the portfolio site: an ES module (`dist/live-lab.js`) that mounts a Power BI explorer with a report selector, persona (RLS) switcher, site-styled page buttons,
programmatic controls (filter, slicer, bookmarks, reset, fullscreen, guided tour), an event log, **Live | Code** tabs and a graceful fallback to recorded media.

```powershell
cd live-lab
npm install
npm run dev          # demo at http://localhost:5173 (mock mode, no tenant needed)
npm test             # vitest (module + real adapter with a fake SDK + snippet build)
npm run e2e          # Playwright against the demo, screenshots to ../docs/live-lab/
npm run build        # dist/live-lab.js + dist/chunks/ (powerbi-client is loaded lazily from the chunk)
npm run secret-scan  # secret-shaped text check over live-lab, worker and tools
```

## Contract (SPEC 6.4)
```ts
import { mountLiveLab } from './live-lab.js';
const handle = mountLiveLab(containerEl, {
  brokerUrl: 'https://<worker>.workers.dev',   // or 'mock:' for an offline demo
  config,                                       // the JSON from reports.config.json
  theme: 'dark',
  onThemeRequest: (cb) => { /* keep cb; call cb('light') whenever the site theme changes */ },
  initialReport: 'insurance-member',            // optional (?report= link from a project page)
});
handle.setTheme('light'); handle.destroy();
```
Copy the whole `dist/` folder next to each other (the lazy chunk is loaded relative to `live-lab.js`).

## How it fits together
- `src/broker.ts` talks to the Worker: `GET /health` (4 s timeout), `POST /token {reportKey, persona}`, `POST /export`. Only a report key and a persona key are ever sent.
- `src/adapters/`: `EmbedAdapter` interface with `RealPowerBiAdapter` (powerbi-client, lazy) and `MockAdapter` (generated report with the same event payload shapes). The UI never knows which is active; the choice is made from the token's embed URL.
- `src/ui/liveLab.ts`: the UI. One embed at a time, token refresh 5 minutes before expiry (retry once, then recorded media for that report only), fallback banner, accessible tabs and a polite live region for the event log.
- `scripts/build-snippets.mjs`: reads `// #region <id> | <title>` blocks from the real source (live-lab, worker, export script), highlights them with Shiki and writes `src/generated/snippets.json`.
  `// #highlight <action>` ranges link each UI action to the lines that implement it. The build fails on secret-shaped text.
- `reports.config.json`: the **public** part (keys, titles, personas, fallback media, controls). No IDs. Real IDs live only in the Worker's `REPORTS_CONFIG` secret.

Mock vs real, deploy and troubleshooting: `../docs/live-lab/OWNER-RUNBOOK.md`.

## Limits worth knowing
- The real adapter is unit-tested against a fake `powerbi-client`; it has not run against a tenant (none was available). The runbook step 4 is the first real test.
- Paginated reports: only the SDK-supported embed plus the broker PDF export are offered (no page tabs, filters or bookmarks).
