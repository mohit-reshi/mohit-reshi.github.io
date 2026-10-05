# Portfolio site: working rules for Claude Code

This repository becomes PUBLIC (all files and the full git history). It is the portfolio of a Power BI and Microsoft Fabric developer. Read this before changing anything.

## Confidentiality (hard rules)
- Never write a client, employer or company name anywhere: files, commit messages, branch names, PR text, test data, image file names. Use the generic labels already used in `content/projects/*/index.md` (`client_label`).
- A private blocklist lives in the gitignored `blocklist.local.txt` (one term per line, `# tier: hard` / `# tier: review` section lines). Never print, copy or commit it. The hooks and `node tools/validate/leak-check.mjs` read it and never print the terms.
- Never read, print or ask for secrets: `.env*`, client secrets, tokens, `export*.config.json` and `live-lab/worker/reports.config.json` hold IDs and stay local (gitignored).
- Never commit `out/`, `private-out/`, screenshots straight from client-like reports, or anything under `tools/export-pages/out/`. Images must be reviewed by the owner for names first.
- Install the hooks once: `sh tools/install-hooks.sh`. They block commits whose staged files or message contain a blocklist term. Do not bypass them (no `--no-verify`).

## Layout
- `site/` Astro 7 site (Node >= 22.12). Three layouts share one data source: Classic, Index (stage-index) and Model (stage-model), chosen by `<html data-layout>`; a case-study panel is shared.
- `content/projects/<slug>/index.md` + `media/` is the only place projects live (validated by `tools/validate/schema.mjs`; tags from `content/taxonomy.json`). Drafts (`draft: true`) show in dev only.
- `live-lab/` embed module and `live-lab/worker/` Cloudflare token broker (already deployed). `live-lab/reports.config.json` is public and generic.
- `tools/export-pages` exports report pages to images; `tools/media` converts and places media; `tools/validate` schema, leak check, contrast; `tools/scaffold` new project generators.

## Commands (Windows cmd or PowerShell, run from the folder shown)
- Dev server: `cd site` then `npm run dev` (http://localhost:4321; drafts visible, samples hidden).
- New project: `cd site` then `npm run new:project -- --kind report|paginated|pipeline --slug <slug> --group portfolio|enterprise`.
- Media for a project: `node tools\media\src\process-images.mjs --in <pages folder> --out out\images\<slug>`, name the best image `cover.webp`, then `node tools\media\src\place.mjs --slug <slug> --from out\images\<slug>`.
- Validate content: `cd site` then `npm run validate -- --media`.
- Checks before pushing: `cd site` then `npx astro check`, `npm test`; browser tests `LIVE_BROKER_URL=mock: SITE_SAMPLES=1 npm run e2e` (set the variables with `set` in cmd). Leak check: `node tools\validate\leak-check.mjs --repo --history`.
- `astro preview` runs as a background daemon: stop it with `npx astro preview stop` before starting another.

## Conventions
- Work on the branch the owner names (currently `claude/portfolio-setup-l67jq2`); commit with clear messages; push when asked. Do not open pull requests unless asked.
- Keep content factual: no invented numbers, outcomes or dates. Unknowns are marked `[OWNER: ...]` for the owner to fill in.
- Copy style: plain, specific, short sentences. No emoji, no em-dash asides.
- Tests that depend on content must not assume which projects exist (CI builds with sample projects).
