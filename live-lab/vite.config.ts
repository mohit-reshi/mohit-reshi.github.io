import { defineConfig } from 'vitest/config';

// Library build: dist/live-lab.js (ES module) plus a lazily loaded powerbi-client chunk next to it.
export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'live-lab.js' },
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: { output: { chunkFileNames: 'chunks/[name]-[hash].js' } },
  },
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'] },
});
