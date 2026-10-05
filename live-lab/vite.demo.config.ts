import { defineConfig } from 'vite';

// Dev server for demo/index.html (mock mode by default).
export default defineConfig({ root: 'demo', server: { port: 5173 }, resolve: { alias: { '@live-lab': new URL('./src/index.ts', import.meta.url).pathname } } });
