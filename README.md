# portfolio

Source for Mohit Reshi's portfolio site: a fast, accessible, free-to-host showcase of Power BI and Microsoft Fabric work, with a **Live Lab** of real embedded reports.
All report data is synthetic, and client or employer names never appear anywhere (see the leak check below).

The site has three layouts for the same work: **0 Classic**, **1 Index** (a typographic project list) and **2 Model** (projects as tables in a relationship diagram). Pick one from the strip at the top of any page.

## Layout of the repository
| Path | What |
|---|---|
| `site/` | Astro site (TypeScript, hand-written CSS, GSAP, Lenis, Three.js hero) |
| `content/projects/<slug>/` | one folder per project: `index.md` (frontmatter + case study) and `media/` |
| `content/taxonomy.json` | tag keys, labels, groups and colours |
| `content/generated/` | model documentation (tables, relationships, measures) generated from the semantic models |
| `live-lab/` | token broker Worker (Cloudflare), embed module, demo page |
| `tools/export-pages/`, `tools/media/` | page export script, media pipeline |
| `tools/scaffold/`, `tools/validate/`, `tools/site/` | new-project generators; schema, validate, leak check, contrast; media sync |
| `.github/workflows/` | CI and GitHub Pages deploy |
| `docs/` | `design.md`, `ADDING-CONTENT.md`, `live-lab/OWNER-RUNBOOK.md`, screenshots |
| `prototypes/` | early design explorations (single HTML files) |

## Quick start (Node 22.12+)
```
cd tools/validate && npm install && cd ../media && npm install && cd ../../live-lab && npm install && npm run build && cd ../site
npm install
npm run dev            # http://localhost:4321  (drafts are shown in dev)
npm test               # unit tests
npm run validate       # content schema, tags, model docs
npm run build          # production build
npm run e2e            # browser tests incl. accessibility; needs a build with SITE_SAMPLES=1 and LIVE_BROKER_URL=mock: first
```
`npm run dev` and `npm run build` first run `tools/site/sync-media.mjs`, which copies project media into `site/public/projects/` and the built Live Lab module into `site/public/live-lab/`.
Settings (name, links, status pill, Live Lab switch and broker address) are in `site/src/config.ts`.

## Everyday tasks
- **Add a project:** `docs/ADDING-CONTENT.md` (five steps, nothing else to edit).
- **Turn the Live Lab off:** change `LIVE_LAB_ENABLED` to `false` in `site/src/config.ts`.
- **Run the Live Lab against real reports:** `docs/live-lab/OWNER-RUNBOOK.md`. Set `LIVE_BROKER_URL=mock:` for the offline demo.
- **Design tokens, art direction, motion fallbacks, performance numbers:** `docs/design.md`.

## Quality gates
`validate` (schema, unknown tags fail the build) -> unit tests -> `astro check` -> build -> **leak check** (`tools/validate/leak-check.mjs` scans `site/dist` and `content/` for a private blocklist and for IDs; the blocklist is the `BLOCKLIST` Actions secret or a local gitignored `blocklist.local.txt`; it never prints the term; `--repo` also scans every tracked file and `--history` every commit, author, message and branch name) -> browser tests (functional, WCAG 2.2 AA via axe, keyboard, reduced motion, mobile overflow) -> Lighthouse (report only).
CI: `.github/workflows/ci.yml` on every push; `deploy.yml` builds on every push to `main` and deploys to GitHub Pages.

## Local safety hooks
Run `sh tools/install-hooks.sh` once per clone. `.githooks/pre-commit` scans staged paths and contents and `.githooks/commit-msg` scans the message against the blocklist (`blocklist.local.txt` or the `BLOCKLIST` env var). Terms are never printed. Without a blocklist the pre-commit hook refuses to commit.
