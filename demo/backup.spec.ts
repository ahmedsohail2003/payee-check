import { test, expect } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Backup demo capture (PLAN M1): walks the mismatch journey on the fictional sample data and saves the
// screencast as JPEG frames plus an ffconcat list with each frame's real duration. ffmpeg then turns it into
// demo/out/backup.mp4. Frames, not recordVideo, because Playwright's own video encoder isn't installed.
// The holds are pacing for a viewer, not waits for the app.

const RAW = resolve('demo/raw')

const MISMATCH = {
  'Account-holder/payee name': 'Harbourline Lumber Ltd.',
  'Institution number': '952',
  'Transit/branch number': '60415',
  'Full account number': '73414471',
  'Name of person spoken to': 'Sam Okafor',
}

test('backup capture: mismatch journey on sample data', async ({ page }) => {
  rmSync(RAW, { recursive: true, force: true })
  mkdirSync(RAW, { recursive: true })
  const frames: { file: string; t: number }[] = []
  const hold = (ms: number) => page.waitForTimeout(ms)

  await page.clock.setFixedTime(new Date('2026-10-25T19:42:00Z'))
  await page.addInitScript(() => {
    window.print = () => {}
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Payee Check' })).toBeVisible()

  await page.screencast.start({
    size: { width: 1920, height: 1080 },
    quality: 90,
    onFrame: ({ data }) => {
      const file = `f${String(frames.length + 1).padStart(6, '0')}.jpg`
      writeFileSync(resolve(RAW, file), data)
      frames.push({ file, t: performance.now() })
    },
  })

  await hold(3000)
  await page.getByRole('link', { name: 'Review request: Harbourline Lumber Ltd.' }).click()
  await expect(page.getByText('untrusted—not used').first()).toBeVisible()
  await hold(4000)
  await page.getByRole('button', { name: 'Start call-back' }).click()
  await hold(2000)
  for (const [label, value] of Object.entries(MISMATCH)) {
    await page.getByLabel(label, { exact: true }).pressSequentially(value, { delay: 70 })
    await hold(300)
  }
  await hold(800)
  await page.getByRole('button', { name: 'Compare' }).click()
  await expect(page.getByText('Full account number does not match: supplier said …4471, email requested …9020.')).toBeVisible()
  await hold(5000)
  await page.getByRole('button', { name: 'Save attempt' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Verification record PC-20261025-154200-001' })).toBeVisible()
  await hold(4000)
  await page.getByRole('link', { name: 'Back to overview' }).click()
  await expect(page.getByText('On hold—details do not match').first()).toBeVisible()
  await hold(2500)
  await page.reload()
  await expect(page.getByText('On hold—details do not match').first()).toBeVisible()
  await hold(3000)

  const stoppedAt = performance.now()
  await page.screencast.stop()

  // ffconcat: each frame lasts until the next one arrived; the last lasts until the capture stopped.
  const lines = ['ffconcat version 1.0']
  frames.forEach((frame, i) => {
    const end = frames[i + 1]?.t ?? stoppedAt
    lines.push(`file '${frame.file}'`, `duration ${Math.max(0.034, (end - frame.t) / 1000).toFixed(3)}`)
  })
  const last = frames.at(-1)
  if (last) lines.push(`file '${last.file}'`)
  writeFileSync(resolve(RAW, 'frames.ffconcat'), lines.join('\n') + '\n')
  expect(frames.length).toBeGreaterThan(20)
})
