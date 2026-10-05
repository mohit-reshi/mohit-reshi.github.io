# Request: Session 2 -> Session 3

**Status (Session 3): done.** The site mounts the module (`site/src/scripts/livelab.ts`, `site/src/pages/[lab].astro`), `liveLab.brokerUrl` is in `site/src/config.ts`, the media sync copies `live-lab/dist` and the CI jobs below are in `.github/workflows/ci.yml` (`live-lab` and `gitleaks`). Fallback media paths still need the real recordings (owner step).

Things Session 2 needs from the site and CI (Session 3 owns `/site/` and `/.github/workflows/`).

## 1. Mounting the Live Lab (contract SPEC 6.4, unchanged)
- Build: `npm --prefix live-lab ci && npm --prefix live-lab run build` -> `live-lab/dist/live-lab.js` plus `live-lab/dist/chunks/` (lazy `powerbi-client` chunk).
  Copy the whole `dist/` folder into the site's public assets (for example `site/public/live-lab/`), keeping `live-lab.js` and `chunks/` side by side.
- Mount (client side only):
  ```ts
  const { mountLiveLab } = await import(/* @vite-ignore */ `${base}live-lab/live-lab.js`);
  mountLiveLab(el, { brokerUrl: config.liveLab.brokerUrl, config: liveLabConfig /* live-lab/reports.config.json */, theme, initialReport: new URLSearchParams(location.search).get('report') ?? undefined,
                     onThemeRequest: (cb) => registerThemeListener(cb) });
  ```
- Add to `/site/src/config.ts`: `liveLab: { enabled: true, brokerUrl: 'https://<worker>.workers.dev' }`. `brokerUrl: 'mock:'` gives a fully offline demo (good for previews and screenshots).
- Project pages with `live_lab.enabled` should link to `/live-lab?report=<report_key>`; the keys are in `live-lab/reports.config.json`.
- Until the module exists in a build, the stub with the same signature is fine; `mountLiveLab` returns `{ destroy(), setTheme(t) }`.

## 2. Fallback media
Each report in `live-lab/reports.config.json` has `fallbackMedia` with root-relative URLs like `/media/live-lab/<key>.mp4` and `.webp`. Please serve recorded media at those paths
(copy from the project media folders at build time) or tell Session 2 which URLs to use. Without the files the module shows its "no recorded media" message.

## 3. CI jobs to add (definitions)
```yaml
  live-lab:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: |
                live-lab/package-lock.json
                live-lab/worker/package-lock.json
                tools/export-pages/package-lock.json
                tools/media/package-lock.json }
      - run: npm --prefix live-lab ci && npm --prefix live-lab test && npm --prefix live-lab run build
      - run: npm --prefix live-lab/worker ci && npm --prefix live-lab/worker run typecheck && npm --prefix live-lab/worker test
      - run: npm --prefix tools/export-pages test
      - run: npm --prefix tools/media ci && npm --prefix tools/media test
      - run: node tools/media/src/check-sizes.mjs --root .
      - run: npm --prefix live-lab run secret-scan

  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }          # full history: this repo's history becomes public
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
```
Notes: the browser test (`npm --prefix live-lab run e2e`) needs a Playwright browser; add `npx playwright install --with-deps chromium` first if you want it in CI (optional, it saves screenshots to `docs/live-lab/`).
The Worker is deployed by the owner with `wrangler`, not from CI (no Cloudflare credentials in GitHub).

## 4. Things the site must not do
- Never put IDs, tokens or the client secret in site code or config; the broker URL is the only runtime setting.
- Do not render all five embeds at once; the module already shows one at a time.
