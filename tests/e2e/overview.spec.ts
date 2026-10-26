import type { Locator, Page } from '@playwright/test'
import { SAMPLES } from '../../src/data/samples'
import {
  AT,
  CALL_SCRIPT,
  FIRST_RECORD_ID,
  HEADING,
  LEGIT,
  MISMATCH,
  PAYMENT_STATUS,
  RECORD_HONESTY,
  backToOverview,
  checkScreen,
  compareAnswers,
  expect,
  expectNothingEditable,
  expectScreen,
  mainHeading,
  openOverview,
  openRequest,
  paymentRow,
  paymentStatus,
  rowOf,
  saveAttempt,
  screenTitle,
  seedSavedMismatch,
  startAt,
  startCallback,
  storageStateWith,
  table,
  test,
} from './helpers'

// The first screen: who the app is for, this week's payment run and the supplier book, with the two payments
// that need attention made obvious, the other three visibly inert, and every account cut to its last four
// digits. Every test opens a fresh store (or a kernel-built seed), so any one of them passes when run alone.

const WHO_FOR =
  'Payee Check helps owners and bookkeepers at small trades and construction firms in Waterloo Region verify a supplier\'s "our bank details changed" email.'
const FICTIONAL_LABEL = 'Fictional sample data—no real call or payment'
const NO_AI_NOTE = 'No AI model runs in this app—sample requests are preloaded and the rules run in code.'
const CALLBACK_HONESTY = "Hiding the email doesn't prove the call was independent."
const NEEDS_VERIFICATION = 'On hold—verification needed'
const SCHEDULED = 'Scheduled'
const NONE = 'None'

const PAYMENT_RUN = "This week's payment run"
const SUPPLIER_BOOK = 'Supplier book'

// The payment run as the samples define it. `dueDate` is what the sample stores; `due` is the same calendar
// day as a person reads it (a date-only string parsed as UTC midnight would show the day before in Toronto).
const PAYMENTS = [
  { supplier: 'Harbourline Lumber Ltd.', ref: 'PR-2026-1041', amount: '$12,480.00', dueDate: '2026-10-30', due: 'Oct 30, 2026', request: true },
  { supplier: 'Brackenfold Aggregates Ltd.', ref: 'PR-2026-1042', amount: '$3,862.15', dueDate: '2026-10-29', due: 'Oct 29, 2026', request: false },
  { supplier: 'Cedarline Electrical Supply Inc.', ref: 'PR-2026-1043', amount: '$5,273.40', dueDate: '2026-10-30', due: 'Oct 30, 2026', request: true },
  { supplier: 'Tallpine Plumbing Wholesale', ref: 'PR-2026-1044', amount: '$918.75', dueDate: '2026-10-28', due: 'Oct 28, 2026', request: false },
  { supplier: 'Keelson Fasteners Co.', ref: 'PR-2026-1045', amount: '$432.60', dueDate: '2026-10-30', due: 'Oct 30, 2026', request: false },
] as const

// The supplier book: the trusted number and on-file details, with the account as the Overview may show it.
const SUPPLIERS = [
  { name: 'Harbourline Lumber Ltd.', phone: '519-555-0142', institution: '947', transit: '01234', account: '…8862' },
  { name: 'Brackenfold Aggregates Ltd.', phone: '519-555-0118', institution: '963', transit: '05520', account: '…0734' },
  { name: 'Cedarline Electrical Supply Inc.', phone: '519-555-0163', institution: '958', transit: '40217', account: '…5518' },
  { name: 'Tallpine Plumbing Wholesale', phone: '519-555-0129', institution: '971', transit: '11807', account: '…9931' },
  { name: 'Keelson Fasteners Co.', phone: '519-555-0151', institution: '984', transit: '36042', account: '…7208' },
] as const

// Every full account number the Overview could leak: the five on file and the two the emails request.
const ON_FILE_ACCOUNTS = ['50318862', '88120734', '3305518', '2049931', '61177208']
const REQUESTED_ACCOUNTS = ['73419020', '3307126']

const AMOUNT_SHAPE = /^\$\d{1,3}(,\d{3})*\.\d{2}$/
const MASKED = /^…\d{4}$/
const MONOSPACE = /monospace|Cascadia Mono|Consolas|Courier New/
// Anything a person could operate in a row: a link, a button, or something made focusable.
const INTERACTIVE = 'a, button, input, select, textarea, [role="link"], [role="button"], [tabindex], [onclick]'
// Still on the Overview: the address the app was opened at, or the bare page.
const STILL_ON_OVERVIEW = /\/(#\/?)?$/

// Body rows only: each has its row heading (the supplier), the header row has none.
function bodyRows(tableLocator: Locator): Locator {
  return tableLocator.getByRole('row').filter({ has: tableLocator.page().getByRole('rowheader') })
}

// A column's position, found from its heading, so each check reads the cell under the heading it names.
async function columnOf(tableLocator: Locator, heading: string | RegExp): Promise<number> {
  await expect(tableLocator.getByRole('columnheader', { name: heading, exact: true })).toHaveCount(1)
  const headings = (await tableLocator.getByRole('columnheader').allTextContents()).map((text) => text.trim())
  const index = headings.findIndex((text) => (typeof heading === 'string' ? text === heading : heading.test(text)))
  expect(index, `the table has a "${String(heading)}" column`).toBeGreaterThanOrEqual(0)
  return index
}

function rowCells(row: Locator): Locator {
  return row.locator(':scope > th, :scope > td')
}

function cellAt(row: Locator, column: number): Locator {
  return rowCells(row).nth(column)
}

// What a sighted reader sees in an element: its text, minus text that isn't rendered or is clipped to a 1 px
// box the way .visually-hidden is. A screen reader's "account ending 8862" isn't shown on screen.
async function shownText(target: Locator): Promise<string> {
  return target.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const parts: string[] = []
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement
      if (parent === null || !parent.checkVisibility({ visibilityProperty: true })) continue
      const box = parent.getBoundingClientRect()
      if (box.width <= 1 && box.height <= 1) continue
      parts.push(node.textContent ?? '')
    }
    return parts.join('').replace(/\s+/g, ' ').trim()
  })
}

function reviewLinks(page: Page): Locator {
  return table(page, PAYMENT_RUN).getByRole('link', { name: /^Review request: / })
}

test('OV-1 the first screen says who it is for and shows the five suppliers and five payments, with no sign-in', async ({ page }) => {
  await openOverview(page)
  await expect(page.getByText(WHO_FOR, { exact: true })).toBeVisible()
  await expect(bodyRows(table(page, SUPPLIER_BOOK))).toHaveCount(5)
  await expect(bodyRows(table(page, PAYMENT_RUN))).toHaveCount(5)

  // Guard above (the who-it's-for line and both tables), then: nothing asks anyone to sign in.
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expectNothingEditable(page)
  await expect(page.locator('body')).not.toContainText(/\b(sign|log)[\s-]?in\b/i)
})

test('OV-2 every payment row shows its supplier, amount, due date, status and request cell, with the review link on exactly the two request rows', async ({ page }) => {
  await openOverview(page)
  const run = table(page, PAYMENT_RUN)
  const columns = await run.getByRole('columnheader').count()
  const reference = await columnOf(run, 'Reference')
  const amount = await columnOf(run, /^Amount/)
  const due = await columnOf(run, 'Due date')
  const status = await columnOf(run, 'Status')
  const request = await columnOf(run, 'Request')

  // No blank cell in any row, and every amount is dollars and cents with thousands separators.
  const rows = bodyRows(run)
  await expect(rows).toHaveCount(PAYMENTS.length)
  for (const row of await rows.all()) {
    const cells = rowCells(row)
    await expect(cells).toHaveCount(columns)
    for (const cell of await cells.all()) await expect(cell, 'no empty cell').toHaveText(/\S/)
    await expect(cellAt(row, amount)).toHaveText(AMOUNT_SHAPE)
  }

  for (const payment of PAYMENTS) {
    const stored = SAMPLES.payments.find((p) => p.ref === payment.ref)
    expect(stored?.dueDate, `${payment.ref} is due ${payment.dueDate} in the samples`).toBe(payment.dueDate)

    const row = paymentRow(page, payment.supplier)
    await expect(row).toHaveCount(1)
    await expect(cellAt(row, reference)).toHaveText(payment.ref)
    await expect(cellAt(row, amount)).toHaveText(payment.amount)
    await expect(cellAt(row, due), `${payment.ref} shows the calendar day it is due`).toHaveText(payment.due)
    await expect(cellAt(row, status).getByTestId('status')).toHaveCount(1)

    const review = cellAt(row, request).getByRole('link', { name: `Review request: ${payment.supplier}`, exact: true })
    await expect(review, `the request indicator ${payment.request ? 'is' : 'is not'} on ${payment.ref}`).toHaveCount(
      payment.request ? 1 : 0,
    )
  }
  await expect(reviewLinks(page)).toHaveCount(2)
})

test('OV-3 exactly two rows start flagged, each reading exactly "On hold—verification needed"', async ({ page }) => {
  await openOverview(page)
  const run = table(page, PAYMENT_RUN)

  const flagged = bodyRows(run).filter({ has: page.getByRole('link', { name: /^Review request: / }) })
  await expect(flagged).toHaveCount(2)
  for (const row of await flagged.all()) await expect(row.getByTestId('status')).toHaveText(NEEDS_VERIFICATION)

  await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(NEEDS_VERIFICATION)
  await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(NEEDS_VERIFICATION)
  await expect(run.getByTestId('status').filter({ hasText: 'On hold' })).toHaveCount(2)
})

test('OV-4 the three rows without a request read "Scheduled", hold no control, show no pointer and open nothing', async ({ page }) => {
  await openOverview(page)
  const run = table(page, PAYMENT_RUN)
  const request = await columnOf(run, 'Request')

  const scheduled = bodyRows(run).filter({ has: page.getByTestId('status').filter({ hasText: SCHEDULED }) })
  await expect(scheduled).toHaveCount(3)
  await expect(run.getByTestId('status').filter({ hasText: SCHEDULED })).toHaveCount(3)

  for (const row of await scheduled.all()) {
    await expect(row.getByTestId('status')).toHaveText(SCHEDULED)
    await expect(cellAt(row, request)).toHaveText(NONE)
    // Guard: the row has rendered (its status above), so "nothing to operate" can fail.
    await expect(row.locator(INTERACTIVE), 'no link, button or focusable element in the row').toHaveCount(0)
    await expect(row, 'the row shows no pointer').not.toHaveCSS('cursor', 'pointer')

    // A click anywhere on the row lands on the row itself (no stretched link from a flagged row covers it)
    // and leaves the Overview where it is.
    for (const cell of await rowCells(row).all()) {
      await expect(cell, 'no cell shows a pointer').not.toHaveCSS('cursor', 'pointer')
      await cell.click()
      await expect(page).toHaveURL(STILL_ON_OVERVIEW)
      await expect(mainHeading(page, HEADING.overview)).toBeVisible()
    }
  }
  await checkScreen(page, { title: screenTitle(HEADING.overview) })
})

test('OV-5 CR-4 the supplier book shows each supplier\'s trusted phone, institution and transit in its row, leading zeros intact', async ({ page }) => {
  await openOverview(page)
  const book = table(page, SUPPLIER_BOOK)
  const phone = await columnOf(book, /^Trusted phone/)
  const institution = await columnOf(book, 'Institution')
  const transit = await columnOf(book, 'Transit')
  await expect(bodyRows(book)).toHaveCount(SUPPLIERS.length)

  for (const supplier of SUPPLIERS) {
    const row = rowOf(book, supplier.name)
    await expect(row, `${supplier.name} has one row`).toHaveCount(1)
    await expect(cellAt(row, phone)).toHaveText(supplier.phone)
    await expect(cellAt(row, institution)).toHaveText(supplier.institution)
    await expect(cellAt(row, transit)).toHaveText(supplier.transit)
  }

  // CR-4: a leading zero is part of the number, so it is shown, monospaced, never dropped.
  for (const [name, value] of [
    ['Harbourline Lumber Ltd.', '01234'],
    ['Brackenfold Aggregates Ltd.', '05520'],
  ] as const) {
    const row = rowOf(book, name)
    await expect(cellAt(row, transit)).toHaveText(value)
    await expect(row.getByText(value, { exact: true })).toHaveCSS('font-family', MONOSPACE)
  }
})

test('OV-6 the Overview shows only the last four digits of every account', async ({ page }) => {
  await openOverview(page)
  const book = table(page, SUPPLIER_BOOK)

  // Guard: the Overview and its supplier book have rendered, so the absence checks below can fail.
  await expect(mainHeading(page, HEADING.overview)).toBeVisible()
  await expect(bodyRows(book)).toHaveCount(SUPPLIERS.length)
  await expect(book.getByText(MASKED)).toHaveCount(SUPPLIERS.length)

  // Text and attributes alike: no full account number is anywhere in the page.
  const html = await page.content()
  for (const account of [...ON_FILE_ACCOUNTS, ...REQUESTED_ACCOUNTS]) {
    expect(html, `the full account ${account} is nowhere in the page`).not.toContain(account)
  }

  const account = await columnOf(book, 'Account')
  for (const row of await bodyRows(book).all()) {
    expect(await shownText(cellAt(row, account)), 'an account cell shows … and four digits').toMatch(MASKED)
  }
  for (const supplier of SUPPLIERS) {
    expect(await shownText(cellAt(rowOf(book, supplier.name), account)), supplier.name).toBe(supplier.account)
  }
})

test('OV-7 the Overview shows the fictional-data label and the no-AI note, and the Call-back step its honesty line', async ({ page }) => {
  await openOverview(page)
  await expect(page.getByText(FICTIONAL_LABEL, { exact: true })).toBeVisible()
  await expect(page.getByText(NO_AI_NOTE, { exact: true })).toBeVisible()

  await openRequest(page, MISMATCH)
  await startCallback(page, MISMATCH)
  await expect(page.getByText(CALL_SCRIPT, { exact: true })).toBeVisible()
  await expect(page.getByText(CALLBACK_HONESTY, { exact: true })).toBeVisible()
})

// spec.md > Density: "Each table sits in an overflow-x: auto wrapper, so a long value scrolls the table, never
// the page." At phone width a table may be wider than the screen; the page itself never is.
const PHONE = { width: 390, height: 844 } as const

async function pageWidths(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
}

async function expectNoSidewaysScroll(page: Page, screen: string): Promise<void> {
  const { scrollWidth, clientWidth } = await pageWidths(page)
  expect(clientWidth, `the ${screen} is laid out at phone width`).toBeLessThanOrEqual(PHONE.width)
  expect(scrollWidth, `the ${screen} page is ${scrollWidth}px wide on a ${clientWidth}px screen`).toBeLessThanOrEqual(clientWidth)
}

// The nearest ancestor of a table that scrolls sideways, and how wide its content is against its own box.
async function tableScroller(tableLocator: Locator): Promise<{ found: boolean; scrollWidth: number; clientWidth: number }> {
  return tableLocator.evaluate((element) => {
    for (let box = element.parentElement; box !== null && box !== document.body; box = box.parentElement) {
      const overflowX = getComputedStyle(box).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') {
        return { found: true, scrollWidth: box.scrollWidth, clientWidth: box.clientWidth }
      }
    }
    return { found: false, scrollWidth: 0, clientWidth: 0 }
  })
}

test('LF-2 at phone width (390 x 844) no screen of the mismatch journey scrolls sideways; a wide table scrolls inside its own wrapper', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await openOverview(page)

  // Guard: the supplier book really is wider than a phone, so the page check below could fail. It scrolls inside
  // its own wrapper, and the hidden "account ending NNNN" text stays inside that wrapper too.
  const book = table(page, SUPPLIER_BOOK)
  await expect(bodyRows(book)).toHaveCount(SUPPLIERS.length)
  const scroller = await tableScroller(book)
  expect(scroller.found, 'the supplier book sits in a sideways-scrolling wrapper').toBe(true)
  expect(scroller.scrollWidth, 'the supplier book is wider than its wrapper at 390 px').toBeGreaterThan(scroller.clientWidth)
  expect((await tableScroller(table(page, PAYMENT_RUN))).found, 'the payment run sits in a sideways-scrolling wrapper').toBe(true)
  await expectNoSidewaysScroll(page, 'Overview')

  await openRequest(page, MISMATCH)
  await expectNoSidewaysScroll(page, 'Request detail')
  await startCallback(page, MISMATCH)
  await expectNoSidewaysScroll(page, 'Call-back step')
  await compareAnswers(page, MISMATCH)
  await expectNoSidewaysScroll(page, 'Comparison')
  await saveAttempt(page)
  await expectNoSidewaysScroll(page, 'record')
  await backToOverview(page)
  await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(PAYMENT_STATUS.mismatch)
  await expectNoSidewaysScroll(page, 'Overview after the saved mismatch')
})

test.describe('with a saved mismatch', () => {
  test.use({ storageState: storageStateWith(seedSavedMismatch()) })

  test('OV-7 a saved record says it shows what was entered and when, not that a call took place', async ({ page }) => {
    await startAt(page, `#/record/${FIRST_RECORD_ID}`)
    await expect(page).toHaveURL(AT.record(FIRST_RECORD_ID))
    await expectScreen(page, HEADING.record(FIRST_RECORD_ID), 'loaded')
    await expect(page.getByText(RECORD_HONESTY, { exact: true })).toBeVisible()
    await expect(page.getByText(FICTIONAL_LABEL, { exact: true })).toBeVisible()
  })
})
