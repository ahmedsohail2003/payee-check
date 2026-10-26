import { defineConfig } from '@playwright/test'

// As spec.md > Where It Runs and How Someone Tries It. One worker because this laptop runs one heavy job at a
// time; no retries because a retried flake is a hidden failure. The zone is pinned because records print one,
// and record tests also fix the clock (tests/e2e/helpers.ts).
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  use: {
    channel: 'chrome',
    baseURL: 'http://localhost:5180',
    timezoneId: 'America/Toronto',
    trace: 'retain-on-failure',
  },
  webServer: { command: 'npm run dev', url: 'http://localhost:5180', reuseExistingServer: true },
})
