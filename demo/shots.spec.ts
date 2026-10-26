import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'

// Full-page screenshots of every screen at desktop and phone width, for a human or agent design review.
// Not a test of behaviour: the e2e suite proves that. Output: demo/qa/<width>-<nn>-<screen>.png

const OUT = resolve('demo/qa')

const MISMATCH = ['Harbourline Lumber Ltd.', '952', '60415', '73414471', 'Sam Okafor']
const LEGIT = ['Cedarline Electrical Supply Inc.', '958', '40388', '3307126', 'Priya Natarajan']
const LABELS = ['Account-holder/payee name', 'Institution number', 'Transit/branch number', 'Full account number', 'Name of person spoken to']

async function fill(page: Page, values: string[]) {
  for (const [i, label] of LABELS.entries()) await page.getByLabel(label, { exact: true }).fill(values[i] ?? '')
}

for (const width of [1440, 390]) {
  test(`screens at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.clock.setFixedTime(new Date('2026-10-25T19:42:00Z'))
    let n = 0
    const shot = async (name: string) => {
      n += 1
      await page.screenshot({ path: `${OUT}/${width}-${String(n).padStart(2, '0')}-${name}.png`, fullPage: true })
    }

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await shot('overview')
    await page.getByRole('link', { name: 'Review request: Harbourline Lumber Ltd.' }).click()
    await shot('request-detail')
    await page.getByRole('button', { name: 'Start call-back' }).click()
    await shot('callback-blank')
    await page.getByRole('button', { name: 'Compare' }).click()
    await shot('callback-missing')
    await page.getByRole('button', { name: "Couldn't verify" }).click()
    await shot('callback-couldnt-verify-open')
    await page.getByRole('button', { name: "Couldn't verify" }).click()
    await fill(page, MISMATCH)
    await page.getByRole('button', { name: 'Compare' }).click()
    await shot('comparison-mismatch')
    await page.getByRole('button', { name: 'Save attempt' }).click()
    await shot('record-mismatch')
    await page.getByRole('link', { name: 'Back to overview' }).click()
    await page.getByRole('link', { name: 'Review request: Cedarline Electrical Supply Inc.' }).click()
    await page.getByRole('button', { name: 'Start call-back' }).click()
    await fill(page, LEGIT)
    await page.getByRole('button', { name: 'Compare' }).click()
    await shot('comparison-match')
    await page.getByRole('button', { name: 'Save attempt' }).click()
    await shot('record-verified')
    await page.getByRole('link', { name: 'Back to overview' }).click()
    await shot('overview-after')
    await page.getByRole('link', { name: 'Review request: Cedarline Electrical Supply Inc.' }).click()
    await shot('request-verified')
    await page.getByRole('link', { name: 'Back to overview' }).click()
    await page.getByRole('button', { name: 'Reset demo' }).click()
    await shot('reset-dialog')
    await page.keyboard.press('Escape')
    await page.goto('/#/record/PC-20261025-154200-001')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await shot('record-mismatch-print')
    await page.emulateMedia({ media: 'screen' })
  })
}
