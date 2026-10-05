import { defineConfig } from 'astro/config';

// SITE_URL and BASE_PATH make the same build work for <user>.github.io (base "/") and for a project page ("/repo/").
const site = process.env.SITE_URL || 'https://example.github.io';
let base = process.env.BASE_PATH || '/';
if (!base.startsWith('/')) base = '/' + base;

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  compressHTML: true,
  devToolbar: { enabled: false },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  markdown: { shikiConfig: { theme: 'github-dark' } },
  vite: { build: { chunkSizeWarningLimit: 700 } },
});
