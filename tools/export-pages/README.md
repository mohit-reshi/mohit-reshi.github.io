# tools/export-pages

Exports every page of your Power BI reports to images (interactive) or PDFs (paginated) with the **Export To File** REST API.
You run it locally with your own credentials; nothing here talks to the tenant until you do. Needs Node 20+ (no npm install).

## Windows (PowerShell) quick start

```powershell
cd tools\export-pages
Copy-Item .env.example .env                  # then fill TENANT_ID, CLIENT_ID, CLIENT_SECRET (never commit .env)
Copy-Item export.config.example.json export.config.json   # fill workspaceId / reportId / slug for each report
node src\cli.mjs --dry-run                   # prints the plan, no network
node src\cli.mjs --only my-report-slug       # one report
node src\cli.mjs                             # everything
node src\cli.mjs --identity employer         # RLS: export as the configured persona
node src\cli.mjs --format pdf                # interactive reports as PDF instead of PNG
npm test                                     # unit tests (mocked HTTP)
```

## What it does

- Entra client-credentials token (scope `https://analysis.windows.net/powerbi/api/.default`), held in memory only.
- For each report: lists the pages, then starts one export job per page (`POST .../reports/{id}/ExportTo`, format PNG), polls the job (honors `Retry-After`, backs off on 429/5xx), downloads the file.
- Paginated reports: one PDF per parameter set from the config; `identities` are sent when `--identity` is used.
- Output: `out/<slug>/pages/NN-page.png` (index-based names, never page display names), `out/<slug>/pages.json` (display names for you to review for client names before committing anything), and `out/contact-sheet.html`.
- Resumable: files that already exist are skipped. Failures are reported and the run continues. Exit code 2 when something needs manual capture.
- Blank check: pages whose image is near-uniform are flagged on the contact sheet and in the final **needs manual capture** list. This is a heuristic.

## Known limits (verify against current Microsoft docs; the docs were not reachable when this was written)

- Export To File needs the report's workspace on a Premium/Fabric capacity (your trial capacity qualifies until it ends).
- Some visuals may not render in exports (custom visuals not certified for export, some R/Python visuals, visuals that depend on the browser). Pages showing those need a **manual screenshot** from Power BI Desktop or the browser.
- Export concurrency and hourly request limits exist per capacity; the default here is 2 parallel jobs (`concurrency` in the config, max 5).
- With RLS, the service principal must be allowed to pass an effective identity; reports on datasets without RLS must not receive `identities`.
- PNG export of an interactive report returns one image per request when a single page is requested; this tool always requests one page at a time.

## Safety

`.env`, `export.config.json` and `out/` are gitignored. Never paste the client secret anywhere. The config holds real IDs, so it must stay local.
