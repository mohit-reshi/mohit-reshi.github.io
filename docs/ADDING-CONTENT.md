# Adding content (the 5-step process)

Adding a report or an app never touches existing work: the work grid, filters, search palette, sitemap, home page, prev/next and related links all derive from the content folders.

## 1. Scaffold
```powershell
cd site
npm run new:project -- --kind report --slug my-report --group portfolio     # report | paginated | pipeline;  group: portfolio | enterprise
npm run new:app -- --slug my-app --app-kind external --url https://example.com    # static | external | repo-only
```
This creates `content/projects/<slug>/index.md` (valid frontmatter, `draft: true`, five-chapter skeleton) and empty `media/pages` and `media/thumbs` folders, then prints the next steps. It refuses to overwrite an existing project.

## 2. Fill the frontmatter
Edit `content/projects/<slug>/index.md`. Fields (SPEC 6.1):

| Field | Notes |
|---|---|
| `slug` | equals the folder name, kebab-case |
| `title`, `summary` | summary 160 characters or fewer |
| `kind` | `report`, `paginated`, `app`, `pipeline` |
| `group` | `portfolio`, `enterprise`, `app` |
| `client_label` | generic label only (for example "a real-world group insurance problem"), or `null`. Never a client name |
| `tags` | keys from `content/taxonomy.json`; an unknown tag fails the build. Add new tags there (label, group `platform|skill|domain`, `#RRGGBB` colour) |
| `featured`, `order`, `draft`, `status` | featured shows on the home page; lower `order` comes first; drafts are hidden in production; `status: live` means a Live Lab embed (needs `live_lab.enabled` and a `report_key` from `live-lab/reports.config.json`) |
| `media` | `cover`, optional `video`, `poster`, `before_after: { before, after, caption }`. Paths are relative to the project folder |
| `model_doc` | `/content/generated/<slug>.model.json` (from Session 1's output) or `null`. When set, "Under the hood" shows counts, the relationship diagram, RLS roles, techniques and the DAX of `featured_measures` |
| apps | `appKind`, `url`, `repo`, `stack`, `ai_built`, `needs_api_key`, `howBuilt`. Static apps live in `site/public/apps-hosted/<slug>/` |

Write the case study under `## Problem`, `## Data model`, `## Report`, `## Under the hood`, `## Outcome`. Missing chapters are skipped (Report and Under the hood fill themselves from media and the model doc).

## 3. Add media (scripts in `tools/media`)
```powershell
node tools\media\src\process-images.mjs --in out\my-report\pages --out out\images\my-report
node tools\media\src\compress-video.mjs --in D:\recordings\my-report.mp4 --out out\images\my-report   # then rename to video.mp4 and poster.webp
node tools\media\src\place.mjs --slug my-report --from out\images\my-report
```
`cover.webp`, `poster.webp`, `video.mp4`, `before.webp` and `after.webp` are placed by name; every other `.webp` becomes a gallery page. Edit `media/pages/pages.json` for titles and captions (they are scanned by the leak check). Missing media never breaks anything: generated placeholders are shown.

## 4. Check it
```powershell
cd site
npm run validate -- --media     # schema, tags, model doc, live lab key; lists missing media
npm run dev                     # http://localhost:4321 (drafts and samples are shown in dev)
npm run build; npm run leak-check
```
The leak check needs the blocklist: the `BLOCKLIST` environment variable (a CI secret) or a local, gitignored `blocklist.local.txt` at the repo root. It never prints the term it found.

## 5. Commit
Set `draft: false`, commit on a branch and open a PR. CI runs validate, tests, build, the leak check and the browser tests.

---
Sample content has `sample: true`. It is shown in dev and when `SITE_SAMPLES=1`, and excluded from production builds. Delete the `sample-*` folders when you have real projects.
