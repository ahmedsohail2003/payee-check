import type { Locator, Page } from '@playwright/test'
import {
  ANSWER_LABELS,
  FIRST_RECORD_ID,
  FIXED_SAVED_AT,
  MISMATCH_ANSWERS,
  RECORD_PAIR_LABELS,
  checkScreen,
  expect,
  expectRecordFields,
  fillAnswers,
  printCalls,
  readStored,
  recordValue,
  startAt,
  test,
} from './helpers'

// The mismatch sample end to end: Harbourline's email asks for an account ending 9020, the supplier states one
// ending 4471 on the call, and the payment stays held through Save, Print, Back and reload. Every test starts
// from an empty store and walks the UI itself, so any one of them passes when run alone.

const SUPPLIER = 'Harbourline Lumber Ltd.'
const OTHER_FLAGGED = 'Cedarline Electrical Supply Inc.'

const FROM = 'accounts@harbourline-pay.example'
const SUBJECT = 'Updated banking details for Harbourline Lumber Ltd.'
const BODY_LINES = [
  'Harbourline Lumber Ltd. has moved its banking. Effective immediately, please send all payments, including PR-2026-1041, to our new account:',
  'Dana Whitlow',
  'Accounts Receivable, Harbourline Lumber Ltd.',
]
const CONTACTS = [FROM, '519-555-0187', 'ap@harbourline-pay.example', 'https://harbourline-pay.example/confirm']
const REQUESTED = { institution: '952', transit: '60415', account: '73419020' }
const TRUSTED_NUMBER = '519-555-0142'

const SCRIPT =
  'We received a request to change your payment details. Please state the account-holder name and the institution, transit and account numbers we should use.'
const OVERALL = 'Full account number does not match: supplier said …4471, email requested …9020.'
const HOLD_LINE = 'Payment still on hold—save this attempt to record the result.'
const NEEDS_VERIFICATION = 'On hold—verification needed'
const HELD_MISMATCH = 'On hold—details do not match'
const UNTRUSTED_TAG = 'untrusted—not used'

// Detail | Requested (email) | Stated (supplier) | Result, for the demo answers.
const COMPARISON_ROWS = [
  ['Payee name', 'Harbourline Lumber Ltd.', 'Harbourline Lumber Ltd.', 'Matches'],
  ['Institution', '952', '952', 'Matches'],
  ['Transit', '60415', '60415', 'Matches'],
  ['Account', '73419020', '73414471', 'Does not match'],
] as const

// The saved record (VR-2): an exact value for each labelled field, from the sample and the fixed clock.
const RECORD_VALUES: readonly (readonly [string, string])[] = [
  ['Record ID', 'PC-20261025-154200-001'],
  ['Saved', 'Oct 25, 2026, 3:42 PM EDT'],
  ['Supplier', 'Harbourline Lumber Ltd.'],
  ['Payment reference', 'PR-2026-1041'],
  ['Amount (CAD)', '$12,480.00'],
  ['Due date', 'Oct 30, 2026'],
  ['Email checked', 'Updated banking details for Harbourline Lumber Ltd. (received Oct 23, 2026)'],
  ['Trusted number used', '519-555-0142'],
  ['Person spoken to', 'Sam Okafor'],
  ['Outcome', 'Details do not match'],
  ['Reason or note', 'No reason recorded'],
  ['Resulting payment status', 'On hold—details do not match'],
]
// The record's details table: the account masked in both columns (its text then carries the spoken
// "account ending …" too, hence the anchored patterns), the rest in full.
const RECORD_ROWS: readonly (readonly [string, readonly (string | RegExp)[]])[] = [
  ['Payee name', ['Harbourline Lumber Ltd.', 'Harbourline Lumber Ltd.', 'Matches']],
  ['Institution', ['952', '952', 'Matches']],
  ['Transit', ['60415', '60415', 'Matches']],
  ['Account', [/^…9020/, /^…4471/, 'Does not match']],
]

const MONOSPACE = /monospace|Cascadia Mono|Consolas|Courier New/
const PHONE_SHAPE = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function mainHeading(page: Page, name: string): Locator {
  return page.getByRole('main').getByRole('heading', { level: 1, name, exact: true })
}

// Waits for the screen's heading (the guard), then runs the every-screen checks.
async function onScreen(page: Page, heading: string): Promise<void> {
  await expect(mainHeading(page, heading)).toBeVisible()
  await checkScreen(page)
}

// A navigation control may be a link or a button; its exact name is what the person relies on.
function control(page: Page, name: string | RegExp): Locator {
  return page.getByRole('link', { name, exact: true }).or(page.getByRole('button', { name, exact: true }))
}

function emailPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Email', exact: true })
}

function table(page: Page, caption: string): Locator {
  return page.getByRole('table', { name: caption, exact: true })
}

// A table row found by its row heading (a detail such as "Account", or a supplier name).
function rowOf(tableLocator: Locator, rowHeading: string): Locator {
  return tableLocator
    .getByRole('row')
    .filter({ has: tableLocator.page().getByRole('rowheader', { name: rowHeading, exact: true }) })
}

function paymentStatus(page: Page, supplier: string): Locator {
  return rowOf(table(page, "This week's payment run"), supplier).getByTestId('status')
}

// At least one status badge shows these words, and each one that does shows exactly them (its icon adds no
// text). Other badges, such as a saved attempt's outcome, may share the screen.
async function expectStatus(page: Page, words: string): Promise<void> {
  const badges = page.getByTestId('status').filter({ hasText: words })
  await expect(badges).not.toHaveCount(0)
  for (const badge of await badges.all()) await expect(badge).toHaveText(words)
}

// Text (hidden text included), every attribute outside the icons' path data, and every field's value: all the
// ways a screen could carry a value to the person using it.
async function everythingInBody(page: Page): Promise<string> {
  return page.locator('body').evaluate((body) => {
    const parts = [body.textContent ?? '']
    for (const element of Array.from(body.querySelectorAll('*'))) {
      if (element.closest('svg')) continue
      for (const attribute of Array.from(element.attributes)) parts.push(attribute.value)
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) parts.push(element.value)
    }
    return parts.join('\n')
  })
}

async function openRequest(page: Page): Promise<void> {
  await startAt(page)
  await onScreen(page, 'Payee Check')
  await page.getByRole('link', { name: `Review request: ${SUPPLIER}`, exact: true }).click()
  await expect(page).toHaveURL(/#\/request\/req-mismatch$/)
  await onScreen(page, `Bank-change request: ${SUPPLIER}`)
}

async function startCallback(page: Page): Promise<void> {
  await openRequest(page)
  await control(page, 'Start call-back').click()
  await expect(page).toHaveURL(/#\/request\/req-mismatch\/call$/)
  await onScreen(page, `Call-back: ${SUPPLIER}`)
}

async function compareMismatch(page: Page): Promise<void> {
  await startCallback(page)
  await fillAnswers(page, MISMATCH_ANSWERS)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page).toHaveURL(/#\/request\/req-mismatch\/compare$/)
  await onScreen(page, `Comparison: ${SUPPLIER}`)
}

async function saveMismatch(page: Page): Promise<void> {
  await compareMismatch(page)
  await page.getByRole('button', { name: 'Save attempt', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`#/record/${FIRST_RECORD_ID}$`))
  await onScreen(page, `Verification record ${FIRST_RECORD_ID}`)
}

// LF-3's E2E proof is this test's font check: every bank number, on file and requested, is monospaced.
test('RQ-1 LF-3 the request shows the email, existing and requested details in full and monospaced, and the hold status', async ({ page }) => {
  await openRequest(page)

  const email = emailPanel(page)
  await expect(email.getByText(FROM)).toBeVisible()
  await expect(email.getByText(SUBJECT, { exact: true })).toBeVisible()
  for (const line of BODY_LINES) await expect(email.getByText(line)).toBeVisible()

  const details = table(page, 'Details on file and details requested by the email')
  const numbers = [
    ['Institution', '947', REQUESTED.institution],
    ['Transit', '01234', REQUESTED.transit],
    ['Account', '50318862', REQUESTED.account],
  ] as const
  for (const [detail, onFile, requested] of numbers) {
    for (const value of [onFile, requested]) {
      const shown = rowOf(details, detail).getByText(value, { exact: true })
      await expect(shown).toBeVisible()
      await expect(shown).toHaveCSS('font-family', MONOSPACE)
    }
  }

  await expectStatus(page, NEEDS_VERIFICATION)
})

test('RQ-2 every contact in the email is marked untrusted as inert text, never a link', async ({ page }) => {
  await openRequest(page)
  const email = emailPanel(page)

  // Guard: the email has rendered, so the absence checks below can fail.
  await expect(email.getByText(FROM)).toBeVisible()
  await expect(email.locator('a, img, iframe, form, button, [href]')).toHaveCount(0)

  const markers = email.getByTestId('untrusted')
  await expect(markers).toHaveCount(CONTACTS.length)
  for (const contact of CONTACTS) {
    const marker = markers.filter({ hasText: contact })
    await expect(marker).toHaveCount(1)
    await expect(marker.getByText(UNTRUSTED_TAG, { exact: true })).toBeVisible()
    await expect(marker.locator('svg')).toHaveCount(1)
    await expect(marker.getByTestId('icon-shield-slash')).toHaveCount(1)
  }

  // Nothing address- or phone-shaped is left outside a marker.
  const unmarked = await email.evaluate((panel) => {
    const copy = panel.cloneNode(true) as Element
    copy.querySelectorAll('[data-testid="untrusted"]').forEach((marker) => marker.remove())
    return copy.textContent ?? ''
  })
  expect(unmarked).not.toContain('.example')
  expect(unmarked.match(PHONE_SHAPE)).toBeNull()
})

test('CB-1 the only phone number on the Call-back step is the trusted on-file number', async ({ page }) => {
  await startCallback(page)

  const trusted = page.getByTestId('trusted-number')
  await expect(trusted).toContainText('Trusted number on file')
  await expect(trusted).toContainText(TRUSTED_NUMBER)

  const text = (await page.locator('body').textContent()) ?? ''
  expect(text.match(PHONE_SHAPE)).toEqual([TRUSTED_NUMBER])
})

test('CB-2 the call script reads exactly as the PRD words it', async ({ page }) => {
  await startCallback(page)
  await expect(page.getByText(SCRIPT, { exact: true })).toBeVisible()
})

test('CB-3 five labelled answer fields start blank and are plain text inputs', async ({ page }) => {
  await startCallback(page)

  for (const label of Object.values(ANSWER_LABELS)) {
    const field = page.getByLabel(label, { exact: true })
    await expect(field).toBeEditable()
    await expect(field).toHaveValue('')
    await expect(field).toHaveAttribute('type', 'text')
    await expect(field).toHaveAttribute('autocomplete', 'off')
  }
  await expect(page.getByRole('textbox')).toHaveCount(5)
  await expect(page.locator('input[type="number"]')).toHaveCount(0)
})

test('CB-4 the email and its requested details appear nowhere on the Call-back step', async ({ page }) => {
  await startCallback(page)

  // Guard: the step has rendered, so the absence checks below can fail.
  await expect(page.getByText(SCRIPT, { exact: true })).toBeVisible()
  await expect(emailPanel(page)).toHaveCount(0)

  const everything = await everythingInBody(page)
  const fromTheEmail = [
    FROM,
    SUBJECT,
    ...BODY_LINES,
    ...CONTACTS,
    'harbourline-pay',
    REQUESTED.institution,
    REQUESTED.transit,
    REQUESTED.account,
  ]
  for (const value of fromTheEmail) {
    expect(everything, `"${value}" must not reach the Call-back step`).not.toContain(value)
  }
})

test('CB-5 nothing can start a call: in-app links only and phone detection off', async ({ page }) => {
  const callStarters = '[href^="tel:"], [href^="mailto:"], [href^="sms:"], [href^="callto:"]'
  const phoneControls = [
    page.getByRole('link', { name: /519-555-01\d\d/ }),
    page.getByRole('button', { name: /519-555-01\d\d/ }),
  ]

  // The Request detail shows the email's phone number; checkScreen has already run on it.
  await openRequest(page)
  await expect(emailPanel(page).getByText('519-555-0187')).toBeVisible()
  await expect(page.locator(callStarters)).toHaveCount(0)
  for (const callable of phoneControls) await expect(callable).toHaveCount(0)

  await control(page, 'Start call-back').click()
  await onScreen(page, `Call-back: ${SUPPLIER}`)
  await expect(page.getByTestId('trusted-number')).toContainText(TRUSTED_NUMBER)
  await expect(page.locator(callStarters)).toHaveCount(0)
  for (const callable of phoneControls) await expect(callable).toHaveCount(0)

  await expect(page.locator('meta[name="format-detection"]')).toHaveAttribute(
    'content',
    'telephone=no, email=no, address=no',
  )
})

test('CR-1 Compare with the account blank names it, keeps the typing and saves nothing', async ({ page }) => {
  await startCallback(page)
  await fillAnswers(page, { ...MISMATCH_ANSWERS, account: '' })
  await page.getByRole('button', { name: 'Compare', exact: true }).click()

  const summary = page.getByTestId('missing-summary')
  await expect(summary).toBeFocused()
  await expect(summary.getByRole('heading', { name: 'Compare needs every answer', exact: true })).toBeVisible()
  await expect(summary.getByRole('button')).toHaveText(['Full account number'])

  await expect(page).toHaveURL(/#\/request\/req-mismatch\/call$/)
  await onScreen(page, `Call-back: ${SUPPLIER}`)
  expect(await readStored(page)).toBeNull()

  // The refusal keeps every typed answer, marks the blank one, and its summary button leads straight to it.
  for (const key of ['payeeName', 'institution', 'transit', 'personSpokenTo'] as const) {
    await expect(page.getByLabel(ANSWER_LABELS[key], { exact: true })).toHaveValue(MISMATCH_ANSWERS[key])
  }
  const account = page.getByLabel('Full account number', { exact: true })
  await expect(account).toHaveValue('')
  await expect(account).toHaveAttribute('aria-invalid', 'true')
  await summary.getByRole('button', { name: 'Full account number', exact: true }).click()
  await expect(account).toBeFocused()
})

test('CR-3 CR-8 the Comparison shows every detail in full, both accounts unmasked and monospaced', async ({ page }) => {
  await compareMismatch(page)

  const comparison = table(page, 'Requested and stated details')
  await expect(comparison.getByRole('columnheader')).toHaveText(['Detail', 'Requested (email)', 'Stated (supplier)', 'Result'])
  for (const [detail, requested, stated, result] of COMPARISON_ROWS) {
    await expect(rowOf(comparison, detail).getByRole('cell')).toHaveText([requested, stated, result])
  }

  for (const account of [REQUESTED.account, MISMATCH_ANSWERS.account]) {
    await expect(comparison.getByText(account, { exact: true })).toHaveCSS('font-family', MONOSPACE)
  }
  await expect(comparison).not.toContainText('…')
})

test('CR-7 the account row is red with a cross and words, and the overall line reads …4471 vs …9020', async ({ page }) => {
  await compareMismatch(page)
  const comparison = table(page, 'Requested and stated details')

  const mismatch = rowOf(comparison, 'Account').getByRole('cell', { name: 'Does not match', exact: true })
  await expect(mismatch).toBeVisible()
  // One icon, and it is the cross: colour + icon + words must all say "mismatch".
  await expect(mismatch.locator('svg')).toHaveCount(1)
  await expect(mismatch.getByTestId('icon-cross')).toHaveCount(1)
  await expect(mismatch.getByText('Does not match', { exact: true })).toHaveCSS('color', 'rgb(163, 36, 42)')
  await expect(comparison.getByRole('cell', { name: 'Does not match', exact: true })).toHaveCount(1)

  for (const detail of ['Payee name', 'Institution', 'Transit']) {
    const match = rowOf(comparison, detail).getByRole('cell', { name: 'Matches', exact: true })
    await expect(match).toBeVisible()
    await expect(match.locator('svg')).toHaveCount(1)
    await expect(match.getByTestId('icon-check')).toHaveCount(1)
  }

  const overall = page.getByTestId('overall')
  await expect(overall).toHaveText(OVERALL)
  await expect(overall.locator('svg')).toHaveCount(1)
  await expect(overall.getByTestId('icon-cross')).toHaveCount(1)
  await expect(mainHeading(page, `Comparison: ${SUPPLIER}`)).toHaveAccessibleDescription(new RegExp(escapeRegExp(OVERALL)))
  await expect(page.getByText(HOLD_LINE, { exact: true })).toBeVisible()
})

test('OS-2 a saved mismatch stays held, prints once and offers a new call-back attempt', async ({ page }) => {
  await saveMismatch(page)
  await expect(page.getByRole('main')).toContainText(HELD_MISMATCH)
  await expect(control(page, 'Start a new call-back attempt')).toBeVisible()

  await page.getByRole('button', { name: 'Print', exact: true }).click()
  await expect.poll(() => printCalls(page)).toBe(1)

  await control(page, 'Back to overview').click()
  await onScreen(page, 'Payee Check')
  await expect(paymentStatus(page, SUPPLIER)).toHaveText(HELD_MISMATCH)

  await page.getByRole('link', { name: `Review request: ${SUPPLIER}`, exact: true }).click()
  await onScreen(page, `Bank-change request: ${SUPPLIER}`)
  await expectStatus(page, HELD_MISMATCH)
})

test('OS-5 Save, Print, Back and reload never clear the mismatch hold', async ({ page }) => {
  await saveMismatch(page)
  await page.getByRole('button', { name: 'Print', exact: true }).click()
  await expect.poll(() => printCalls(page)).toBe(1)

  await control(page, 'Back to request').click()
  await expect(page).toHaveURL(/#\/request\/req-mismatch$/)
  await onScreen(page, `Bank-change request: ${SUPPLIER}`)
  await expectStatus(page, HELD_MISMATCH)

  await page.reload()
  await onScreen(page, `Bank-change request: ${SUPPLIER}`)
  await expectStatus(page, HELD_MISMATCH)

  // The Request detail's Back may carry a visually hidden " to overview".
  await control(page, /^Back(?: to overview)?$/).click()
  await onScreen(page, 'Payee Check')
  await expect(paymentStatus(page, SUPPLIER)).toHaveText(HELD_MISMATCH)

  await page.reload()
  await onScreen(page, 'Payee Check')
  await expect(paymentStatus(page, SUPPLIER)).toHaveText(HELD_MISMATCH)
})

test('VR-2 the saved mismatch record shows every PRD field, its exact ID and its saved time with zone', async ({ page }) => {
  await saveMismatch(page)
  await expectRecordFields(page)

  // The fixed clock's ID and time, then an exact value for every labelled field RECORD_FIELDS names.
  await expect(recordValue(page, 'Record ID')).toHaveText('PC-20261025-154200-001')
  await expect(recordValue(page, 'Saved')).toHaveText('Oct 25, 2026, 3:42 PM EDT')
  expect(RECORD_VALUES.map(([term]) => term).sort(), 'a value below for every labelled field').toEqual(
    [...RECORD_PAIR_LABELS].sort(),
  )
  for (const [term, value] of RECORD_VALUES) await expect(recordValue(page, term), term).toHaveText(value)

  const details = table(page, 'Requested and stated details')
  for (const [detail, cells] of RECORD_ROWS) {
    await expect(rowOf(details, detail).getByRole('cell'), detail).toHaveText(cells)
  }
})

test('VR-6 the record and the Overview statuses are unchanged after a reload', async ({ page }) => {
  await saveMismatch(page)

  const fields = page.getByTestId('record-fields')
  const details = table(page, 'Requested and stated details')
  const expectRecord = async () => {
    for (const shown of [FIRST_RECORD_ID, FIXED_SAVED_AT, HELD_MISMATCH]) await expect(fields).toContainText(shown)
    for (const masked of ['…4471', '…9020']) await expect(details).toContainText(masked)
  }
  await expectRecord()
  const before = { fields: await fields.innerText(), details: await details.innerText(), stored: await readStored(page) }
  expect(before.stored).not.toBeNull()

  await page.reload()
  await onScreen(page, `Verification record ${FIRST_RECORD_ID}`)
  await expectRecord()
  await expect(fields).toHaveText(before.fields, { useInnerText: true })
  await expect(details).toHaveText(before.details, { useInnerText: true })
  expect(await readStored(page)).toBe(before.stored)

  const expectOverview = async () => {
    await onScreen(page, 'Payee Check')
    await expect(paymentStatus(page, SUPPLIER)).toHaveText(HELD_MISMATCH)
    await expect(paymentStatus(page, OTHER_FLAGGED)).toHaveText(NEEDS_VERIFICATION)
  }
  await control(page, 'Back to overview').click()
  await expectOverview()
  await page.reload()
  await expectOverview()
})
