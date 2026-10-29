import { defineConfig } from '@playwright/test';

// Perf runs use a production build of the harness (`npm run perf` builds it first); React's
// dev mode is several times slower. Not in `npm run e2e`: timings need a quiet machine.
export default defineConfig({
  testDir: 'perf',
  testMatch: '*.perf.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:5198',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1000, height: 800 },
  },
  webServer: {
    command: 'vite preview --config harness/vite.config.ts',
    url: 'http://localhost:5198',
    reuseExistingServer: true,
  },
});
