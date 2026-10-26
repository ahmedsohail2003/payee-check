import { defineConfig } from '@playwright/test'

// Screenshot pass for the design review (PLAN M2 "qa" screenshots). Run: npx playwright test --config demo/shots.config.ts
// Writes PNGs to demo/qa/ (git-ignored). Same server and zone as the e2e suite; one worker.
export default defineConfig({
  testDir: '.',
  testMatch: 'shots.spec.ts',
  outputDir: '../test-results/shots',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  use: {
    channel: 'chrome',
    baseURL: 'http://localhost:5180',
    timezoneId: 'America/Toronto',
  },
  webServer: { command: 'npm run dev', cwd: '..', url: 'http://localhost:5180', reuseExistingServer: true },
})
