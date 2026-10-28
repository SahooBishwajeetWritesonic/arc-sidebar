import { defineConfig } from '@playwright/test';

// End-to-end tests run against the dev harness in the installed Chrome
// (no Playwright browser download), headless.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5199',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1000, height: 760 },
  },
  webServer: {
    command: 'npm run harness',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
  },
});
