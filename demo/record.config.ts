import { defineConfig } from '@playwright/test'

// Silent draft capture for the demo video (PLAN M5). Run: npx playwright test --config demo/record.config.ts
// Then: ffmpeg -y -f concat -safe 0 -i demo/raw/frames.ffconcat -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xF7F4EE" -fps_mode cfr -r 30 -c:v libx264 -crf 18 -pix_fmt yuv420p demo/out/draft-silent.mp4
export default defineConfig({
  testDir: '.',
  testMatch: 'record.spec.ts',
  outputDir: '../test-results/record',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 300_000,
  use: {
    channel: 'chrome',
    baseURL: 'http://localhost:5180',
    timezoneId: 'America/Toronto',
    viewport: { width: 1920, height: 1080 },
  },
  webServer: { command: 'npm run dev', cwd: '..', url: 'http://localhost:5180', reuseExistingServer: true },
})
