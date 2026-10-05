import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const preinstalled = '/opt/pw-browsers/chromium';
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  retries: 0,
  use: { baseURL: 'http://localhost:4321', launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}) }, viewport: { width: 1280, height: 800 } },
  webServer: { command: 'npx astro preview --port 4321 --host 127.0.0.1', url: 'http://localhost:4321', reuseExistingServer: true, timeout: 60_000 },
});
