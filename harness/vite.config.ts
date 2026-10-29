import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The dev harness. Perf runs measure its production build (`vite preview`), since React's
// development mode is several times slower.
export default defineConfig({
  root: here('.'),
  plugins: [react()],
  resolve: {
    alias: { '@': here('../src') },
  },
  server: { port: 5199, strictPort: true },
  preview: { port: 5198, strictPort: true },
  build: {
    outDir: here('../.output/harness'),
    emptyOutDir: true,
    rollupOptions: { input: [here('index.html'), here('panel.html')] },
  },
});
