import type { Locator, Page, TestInfo } from '@playwright/test'
import {
  FIRST_RECORD_ID,
  HEADING,
  LEGIT,
  MISMATCH,
  RECORD_HONESTY,
  SIMULATED,
  expect,
  mainHeading,
  reachComparison,
  recordValue,
  rowOf,
  saveAttempt,
  table,
  test,
  type Sample,
} from './helpers'

// A record is evidence on paper: it prints as a one-page black-and-white business form, without the app's
// header, buttons, links or banners, with every status still spelled out in words and an icon, and with each
// account cut to its last four digits on screen and in print. Every test saves its record through the UI at
// the fixed clock, so each one passes when run alone. The PDFs land in test-results/ for the hands-on H-4 look.

const FICTIONAL_LABEL = 'Fictional sample data—no real call or payment'
const DETAILS = 'Requested and stated details'

// The mismatch demo: the email requests an account ending 9020, the supplier states one ending 4471.
const REQUESTED_ACCOUNT = '73419020'
const STATED_ACCOUNT = '73414471'

// One page object per printed page: "/Type /Page", never the "/Type /Pages" tree that holds them.
const PAGE_OBJECT = /\/Type\s*\/Page[^s]/g

// What each printed record must still say: its outcome, its resulting payment status, and each detail's result.
type PrintedRecord = {
  name: string
  sample: Sample
  outcome: string
  status: string[]
  results: ReadonlyArray<readonly [detail: string, result: string]>
}

const MISMATCH_RECORD: PrintedRecord = {
  name: 'mismatch',
  sample: MISMATCH,
  outcome: 'not match',
  status: ['On hold—details do not match'],
  results: [
    ['Payee name', 'Matches'],
    ['Institution', 'Matches'],
    ['Transit', 'Matches'],
    ['Account', 'Does not match'],
  ],
}

const VERIFIED_RECORD: PrintedRecord = {
  name: 'verified',
  sample: LEGIT,
  outcome: 'Verified',
  status: ['Ready to pay', SIMULATED],
  results: [
    ['Payee name', 'Matches'],
    ['Institution', 'Matches'],
    ['Transit', 'Matches'],
    ['Account', 'Matches'],
  ],
}

// From an empty store to the sample's saved record, PC-20261025-154200-001, all through the UI.
async function saveRecord(page: Page, sample: Sample): Promise<void> {
  await reachComparison(page, sample)
  await saveAttempt(page)
}

// Whether CSS gives the element a box at all. The banner is empty here, so Playwright already calls it hidden
// for having no height; this asks the stronger question, whether print removes the banner itself, as it must
// whenever it holds a message.
function isRendered(target: Locator): Promise<boolean> {
  return target.evaluate((element) => element.checkVisibility({ visibilityProperty: true }))
}

// At least one copy shows: print may give a line a print-only copy beside the one on screen.
async function expectShown(target: Locator, message: string): Promise<void> {
  await expect(target.visible(), message).not.toHaveCount(0)
}

// Status = colour + icon + words (LF-1), and in print colour is gone: every badge still shows its icon and words.
async function expectStatusesShown(page: Page): Promise<void> {
  const badges = page.getByTestId('status')
  await expect(badges).not.toHaveCount(0)
  for (const badge of await badges.all()) {
    await expect(badge).toBeVisible()
    await expect(badge.locator('svg').first(), 'every status keeps its icon').toBeVisible()
    await expect(badge, 'every status keeps its words').toHaveText(/\S/)
  }
}

// The saved record as it prints: no app chrome, no controls, no banner, and everything a reader needs to tell
// this outcome apart without colour.
async function expectPrintedForm(page: Page, record: PrintedRecord): Promise<void> {
  const header = page.locator('header')
  const controls = page.locator('button, a')
  const banner = page.locator('[role="alert"]')

  // On screen first, so each "hidden in print" below can fail: the header, the controls and the banner are there.
  await page.emulateMedia({ media: 'screen' })
  await expect(mainHeading(page, HEADING.record(FIRST_RECORD_ID))).toBeVisible()
  await expect(header).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to overview', exact: true })).toBeVisible()
  await expect(banner, 'the error banner is always mounted').toHaveCount(1)
  expect(await isRendered(banner), 'on screen the banner has its place').toBe(true)

  await page.emulateMedia({ media: 'print' })
  await expect(mainHeading(page, HEADING.record(FIRST_RECORD_ID))).toBeVisible()
  await expect(header, 'the app header is not printed').toBeHidden()
  await expect(controls).not.toHaveCount(0)
  for (const control of await controls.all()) await expect(control, 'no button or link is printed').toBeHidden()
  expect(await isRendered(banner), 'the error banner is not printed').toBe(false)

  // What the form keeps: the fictional-data label, the honesty line, the outcome and status in words with
  // their icons, and each detail's result word with its icon.
  await expectShown(page.getByText(FICTIONAL_LABEL, { exact: true }), 'the fictional-data label is printed')
  await expectShown(page.getByText(RECORD_HONESTY, { exact: true }), 'the honesty line is printed')
  const outcome = recordValue(page, 'Outcome')
  await expect(outcome).toBeVisible()
  await expect(outcome).toContainText(record.outcome)
  await expect(outcome.getByTestId('status').locator('svg').first()).toBeVisible()
  for (const words of record.status) {
    await expect(recordValue(page, 'Resulting payment status').getByText(words, { exact: true })).toBeVisible()
  }
  await expectStatusesShown(page)

  const details = table(page, DETAILS)
  for (const [detail, result] of record.results) {
    const cell = rowOf(details, detail).getByRole('cell', { name: result, exact: true })
    await expect(cell, `${detail}: "${result}" is printed`).toBeVisible()
    await expect(cell.locator('svg').first(), `${detail}: its result icon is printed`).toBeVisible()
    // Without colour, weight and rules carry it: the result word is bold, and only a mismatching row adds the
    // 2 px rule at its start, so a printed mismatch can't pass for a verified record.
    await expect(cell, `${detail}: the result word prints bold`).toHaveCSS('font-weight', '700')
    const rule = result.startsWith('Does not match') ? '2px' : '1px'
    await expect(rowOf(details, detail).getByRole('rowheader'), `${detail}: a ${rule} rule starts the row`).toHaveCSS(
      'border-left-width',
      rule,
    )
  }

  // Badges keep a 1 px black border once their background colour is gone.
  for (const badge of await page.getByTestId('status').all()) {
    await expect(badge, 'a printed badge keeps its border').toHaveCSS('border-top-style', 'solid')
    await expect(badge).toHaveCSS('border-top-width', '1px')
    await expect(badge).toHaveCSS('border-top-color', 'rgb(0, 0, 0)')
  }

  // Black and white: every element that prints (the icons too, which use currentColor) is black on no
  // background, so a black-and-white printer loses nothing.
  const coloured = await page.locator('html').evaluate((root) => {
    const off: string[] = []
    for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
      if (!element.checkVisibility()) continue
      const style = getComputedStyle(element)
      if (style.color !== 'rgb(0, 0, 0)' || style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none') {
        off.push(`<${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}"> ${style.color} on ${style.backgroundColor}`)
      }
    }
    return off
  })
  expect(coloured, 'every printed element is black on no background').toEqual([])
}

// Saves the record as A4 and Letter PDFs under test-results/ and checks each is exactly one page.
async function expectOnePagePdfs(page: Page, testInfo: TestInfo, record: PrintedRecord): Promise<void> {
  for (const format of ['A4', 'Letter'] as const) {
    const pdf = await page.pdf({ path: testInfo.outputPath(`${record.name}-${format}.pdf`), format })
    const pages = pdf.toString('latin1').match(PAGE_OBJECT) ?? []
    expect(pages, `the ${record.name} record prints on one ${format} page`).toHaveLength(1)
  }
}

test('VR-4 a saved mismatch record shows only the last four digits of each account, on screen and in print, and the institution and transit in full', async ({ page }) => {
  await saveRecord(page, MISMATCH)
  const details = table(page, DETAILS)

  for (const media of ['screen', 'print'] as const) {
    await page.emulateMedia({ media })
    // Guard: the record has rendered, so the absence check below can fail.
    await expect(mainHeading(page, HEADING.record(FIRST_RECORD_ID))).toBeVisible()

    // Text and attributes alike: neither full account is anywhere in the page.
    const html = await page.content()
    for (const full of [REQUESTED_ACCOUNT, STATED_ACCOUNT]) {
      expect(html, `${media}: the full account ${full} is nowhere in the page`).not.toContain(full)
    }

    const account = rowOf(details, 'Account')
    for (const masked of ['…9020', '…4471']) {
      await expect(account.getByText(masked, { exact: true }), `${media}: ${masked} is shown`).toBeVisible()
    }
    for (const [detail, value] of [
      ['Institution', '952'],
      ['Transit', '60415'],
    ] as const) {
      const shown = rowOf(details, detail).getByText(value, { exact: true })
      await expect(shown, `${media}: the requested and stated ${detail} are both in full`).toHaveCount(2)
      for (const each of await shown.all()) await expect(each).toBeVisible()
    }
  }
})

test('VR-5 LF-1 the mismatch record prints as a one-page black-and-white form on A4 and Letter, without the app\'s controls', async ({ page }, testInfo) => {
  await saveRecord(page, MISMATCH_RECORD.sample)
  await expectPrintedForm(page, MISMATCH_RECORD)
  await expectOnePagePdfs(page, testInfo, MISMATCH_RECORD)
})

test('VR-5 LF-1 the verified record prints as a one-page black-and-white form on A4 and Letter, without the app\'s controls', async ({ page }, testInfo) => {
  await saveRecord(page, VERIFIED_RECORD.sample)
  await expectPrintedForm(page, VERIFIED_RECORD)
  await expectOnePagePdfs(page, testInfo, VERIFIED_RECORD)
})
