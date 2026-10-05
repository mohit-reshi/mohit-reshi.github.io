import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Uses the pre-installed Chromium when present (cloud sessions); otherwise Playwright's own browser.
const preinstalled = '/opt/pw-browsers/chromium';
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5173', launchOptions: existsSync(preinstalled) ? { executablePath: preinstalled } : {} },
  webServer: { command: 'npx vite --config vite.demo.config.ts --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
});
