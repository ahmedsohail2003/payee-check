import { defineConfig } from '@playwright/test'

// Backup demo capture only (PLAN M1). Run: npx playwright test --config demo/backup.config.ts
// Same server and zone as the e2e suite; headless Chrome at 1920x1080, one worker.
export default defineConfig({
  testDir: '.',
  testMatch: 'backup.spec.ts',
  outputDir: '../test-results/backup',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 180_000,
  use: {
    channel: 'chrome',
    baseURL: 'http://localhost:5180',
    timezoneId: 'America/Toronto',
    viewport: { width: 1920, height: 1080 },
  },
  webServer: { command: 'npm run dev', cwd: '..', url: 'http://localhost:5180', reuseExistingServer: true },
})
