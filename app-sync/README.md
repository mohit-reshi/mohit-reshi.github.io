# Owner progress sync (portfolio-app-sync)

A tiny Cloudflare Worker that stores the owner's progress for the hosted apps, so it follows the owner between devices.
Visitors never see it: the apps only talk to it after the owner signs in with a key, and every call without the key is refused.

How it works
- Each app keeps its state in the browser (localStorage). After the owner signs in, `app-chrome.js` copies that state to this worker every few seconds and on leaving the page, and pulls it when the page opens on another device.
- One JSON document per app, stored in Cloudflare KV. Newest save wins, which is fine for one person.
- Sign in on any app page with Ctrl+Shift+L. There is no visible login link.

One-time setup (the owner, on their own machine; the key is never written into the repo or pasted into chat)
1. `cd app-sync` then `npm install`.
2. `npx wrangler kv namespace create APP_STATE`. Copy the printed `id` into `wrangler.toml` (the id is not a secret). Commit that one line.
3. Choose a long random key (a password manager can generate one) and store it: `npx wrangler secret put OWNER_KEY` (paste it at the prompt; if the paste is stored as one character, use the temp-file method used for the Live Lab broker).
4. `npx wrangler deploy`. Note the address it prints (`https://portfolio-app-sync.<your-subdomain>.workers.dev`).
5. Open any app on the site, press Ctrl+Shift+L, paste the address (first time only) and the key. A gold "Owner" chip appears in the top strip. Click it to sign out.

Test and check
- `npm test` runs the worker tests (key checks, validation, origins). `npm run typecheck` checks types.
- `curl https://<worker-address>/health` should print `{"ok":true}`.

Limits to know
- The key lives in the owner's browser (localStorage) once signed in, so only sign in on devices you trust.
- To rotate the key: `npx wrangler secret put OWNER_KEY` again, then sign in again.
- Allowed sites are in `ALLOWED_ORIGINS` in `wrangler.toml`.
