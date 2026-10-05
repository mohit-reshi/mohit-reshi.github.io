# Live Lab: owner runbook (mock -> real)

Windows 10 + PowerShell. Do the steps in order. Deadline for anything that needs the tenant: the Fabric trial ends about **2026-10-13**.
Never paste the client secret into chat, a file in the repo, or a commit.

**Verification status.** The build environment could not reach Microsoft Learn or Cloudflare docs, so the Power BI REST details below come from the `powerbi-client` typings
and from knowledge of the API, not from current docs. Items marked **(verify)** are the ones to confirm; step 6 is the real test.

## 0. Before you start
- Node 20+ and Git installed. `cd` to the repo root.
- Owner checklist section A done: Entra app (tenant ID, client ID, client secret), security group with the service principal, the three tenant settings enabled for that group,
  the service principal added as Member/Admin on each workspace, workspaces on the trial capacity, free Cloudflare account.

## 1. See it working with no tenant (2 minutes)
```powershell
cd live-lab
npm install
npm test                 # unit tests
npm run dev              # opens http://localhost:5173 : full demo with mock data (selector, personas, controls, event log, Code tab, fallback)
```
`npm run e2e` runs the browser test and saves screenshots to `docs/live-lab/`.

## 2. Collect the IDs (keep them local)
For each of the 5 embeds (1 service-governance interactive, 1 service-governance paginated, 1 report from each of the 3 insurance portals):
- **workspaceId**: open the workspace in the browser; the URL contains `/groups/<workspaceId>/`.
- **reportId**: open the report; the URL contains `/reports/<reportId>/`.
- **datasetIds** (interactive reports): from the report's **Settings** > dataset link (`/datasets/<datasetId>/`), or call `GET https://api.powerbi.com/v1.0/myorg/groups/<ws>/reports/<id>` and read `datasetId`.
- **RLS**: set `"rls": true` only for reports whose model has roles (the three insurance reports). Role names must match the model exactly (case-sensitive): `EmployerPortalRole`, `MemberPortalRole`, `ProducerPortalRole`.
  The `username` for the dynamic roles must be a UPN that exists in the model's security table (see the model notes), otherwise the persona sees no rows.

```powershell
cd worker
Copy-Item reports.config.example.json reports.config.json     # gitignored; edit with your IDs and report keys
```
The example already uses the five report keys of `live-lab/reports.config.json` (public file): `service-governance-interactive`, `service-governance-paginated`, `insurance-employer`, `insurance-member`, `insurance-producer`.
Keep the keys identical in both files; only IDs, roles and UPNs change.

## 3. Deploy the broker
```powershell
cd live-lab\worker
npx wrangler login
npx wrangler secret put TENANT_ID           # paste the value when asked
npx wrangler secret put CLIENT_ID
npx wrangler secret put CLIENT_SECRET       # paste the secret value; it is stored by Cloudflare, not in the repo
Get-Content reports.config.json -Raw | npx wrangler secret put REPORTS_CONFIG
```
Edit `wrangler.toml`: set `ALLOWED_ORIGINS` (add `http://localhost:5173` while testing and your site URL later, comma separated, exact origins) and `MOCK = "false"`. Then:
```powershell
npx wrangler deploy
curl https://<your-worker>.<your-subdomain>.workers.dev/health
```
Expected: `{"ok":true,...}`. `ok:false` means the broker cannot get an Entra token or cannot read any configured report: see Troubleshooting.

## 4. First real embed
```powershell
cd ..\                                   # live-lab
npm run dev
```
Open `http://localhost:5173/?broker=https://<your-worker>.<your-subdomain>.workers.dev&report=service-governance-interactive`.
You should see the real report, custom page buttons, and events in the log. Try the filter, bookmark and Reset buttons; they log and highlight the code that runs.
Fill in the real names in `live-lab/reports.config.json` (`controls`): filter table/column, slicer visual name, bookmark **names** (the internal names, not the display names) and tour steps.

## 5. RLS persona switch
Open `...&report=insurance-employer`, then switch between Employer, Member and Producer. The numbers must change and the "Now applied" text updates.
If a persona shows an empty report: the UPN is not in the security table, or the role name is wrong.

## 6. Run the export (page images and PDFs)
```powershell
cd ..\tools\export-pages
Copy-Item .env.example .env                       # fill TENANT_ID / CLIENT_ID / CLIENT_SECRET (local only)
Copy-Item export.config.example.json export.config.json   # your IDs and slugs
node src\cli.mjs --dry-run
node src\cli.mjs
```
Open `out\contact-sheet.html`, read the **needs manual capture** list, take manual screenshots for those pages. Page display names in `out\<slug>\pages.json` may contain client names: review before committing anything.
Then `tools\media` turns the images into WebP and places them (see `tools/media/README.md`).

## 7. Connect the site
Session 3's site config takes the broker URL (see `docs/requests/session2-to-session3.md`). Keep `liveLab.enabled = true` until the trial ends; the module switches to recorded media by itself when `/health` is not ok.

## Troubleshooting
| Symptom | Likely cause and fix |
|---|---|
| `/health` is `ok:false` | Wrong `TENANT_ID`/`CLIENT_ID`/`CLIENT_SECRET` (secret expired?), `MOCK` still `"true"`/`"false"` mismatch, or the service principal cannot read the workspace. `npx wrangler tail` shows requests (the Worker never logs tokens). |
| Entra returns `invalid_client` / 401 | Secret value (not secret ID) was copied, or it expired. Create a new secret in the app registration and run `wrangler secret put CLIENT_SECRET` again. |
| Power BI returns 401/403 on the report | Add the service principal to the workspace as Member/Admin; make sure it is in the security group enabled for **Service principals can use Fabric/Power BI APIs** (tenant settings can take up to about 15 minutes to apply) **(verify)**. |
| GenerateToken 400 "requires effective identity" | The dataset has RLS: set `"rls": true` and personas (username + roles). |
| GenerateToken 400 about identity on a dataset **without** RLS | Set `"rls": false` and remove personas: identities are only valid for RLS datasets. |
| GenerateToken 400 "role does not exist" | Role names are case-sensitive and must exist in the published dataset. |
| Persona sees no data | The identity's UPN is not in the security mapping table, or the role filter does not match. Test with **View as** in Power BI Desktop with the same UPN. |
| DirectLake report fails with an identity | RLS with DirectLake models has restrictions (SQL endpoint vs model roles) **(verify)**. Try the persona on an Import model first, or on the Desktop "View as". |
| Browser: CORS error | Add the exact origin (scheme + host + port, no trailing slash) to `ALLOWED_ORIGINS`, redeploy, hard-refresh. |
| `unexpected_field` (400) | The page sent a field the broker refuses (identities/datasets/roles are never accepted from the browser). |
| `unknown_report` / `unknown_persona` | The key is not in `REPORTS_CONFIG`. Keys must be kebab-case and match between the public and the private config. |
| Paginated report embeds but has no tabs/filters | Expected: the SDK offers limited control for paginated reports; use the PDF export button. Paginated GenerateToken body shape **(verify)**. |
| Export 403/401 | Enable **Export reports as image files** (tenant settings) for the security group; the workspace must be on a capacity **(verify)**. |
| Export returns blank images | The page uses a visual that cannot be exported; capture it manually (listed in the contact sheet). |
| Token expires during a demo | The module refreshes 5 minutes before expiry; `TOKEN_TTL` in `wrangler.toml` is minutes (10 to 60). |

## After the trial ends
The embed stops working; the Live Lab detects it through `/health` and shows the recorded walkthroughs. Optionally set `liveLab.enabled = false` in the site config. Delete the client secret in Entra
and run `npx wrangler delete` if you do not plan another trial.
