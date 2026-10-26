import type { Page } from '@playwright/test'
import {
  AT,
  BACK,
  FIRST_RECORD_ID,
  FIXED_SAVED_AT,
  HEADING,
  LEGIT,
  MISMATCH,
  RECORD_PAIR_LABELS,
  SIMULATED,
  backToOverview,
  compareAnswers,
  control,
  expect,
  expectNothingEditable,
  expectRecordFields,
  expectSameAfterReload,
  expectScreen,
  expectSimulatedBesideReadyToPay,
  expectStatus,
  goToHash,
  openOverview,
  openRequest,
  paymentRow,
  paymentStatus,
  reachComparison,
  readStored,
  recordValue,
  reviewLink,
  rowOf,
  saveAttempt,
  startCallback,
  table,
  test,
} from './helpers'

// The legitimate sample end to end: Cedarline's email asks for an account the supplier confirms on the call,
// so the comparison reads "Details match.", yet the payment stays held until the attempt is saved. Only then
// does it read "Verified" / "Ready to pay", always beside "Simulated—no money moves.", and the request reopens
// read-only. Every test starts from an empty store and walks the UI itself, so any one of them passes alone.

const NEEDS_VERIFICATION = 'On hold—verification needed'
const READY_TO_PAY = 'Ready to pay'
const VERIFIED = 'Verified'
const DETAILS_MATCH = 'Details match.'
const HOLD_LINE = 'Payment still on hold—save this attempt to record the result.'

// Detail | Requested (email) | Stated (supplier) | Result, for the demo answers.
const COMPARISON_ROWS = [
  ['Payee name', 'Cedarline Electrical Supply Inc.', 'Cedarline Electrical Supply Inc.', 'Matches'],
  ['Institution', '958', '958', 'Matches'],
  ['Transit', '40388', '40388', 'Matches'],
  ['Account', '3307126', '3307126', 'Matches'],
] as const

// The saved record (VR-2): an exact value for each labelled field, from the sample and the fixed clock. The
// payment status's badge and its simulated-money note sit side by side, with no space between their texts.
const RECORD_VALUES: readonly (readonly [string, string | RegExp])[] = [
  ['Record ID', 'PC-20261025-154200-001'],
  ['Saved', 'Oct 25, 2026, 3:42 PM EDT'],
  ['Supplier', 'Cedarline Electrical Supply Inc.'],
  ['Payment reference', 'PR-2026-1043'],
  ['Amount (CAD)', '$5,273.40'],
  ['Due date', 'Oct 30, 2026'],
  ['Email checked', 'New bank account for Cedarline Electrical Supply Inc. (received Oct 22, 2026)'],
  ['Trusted number used', '519-555-0163'],
  ['Person spoken to', 'Priya Natarajan'],
  ['Outcome', 'Verified'],
  ['Reason or note', 'No reason recorded'],
  ['Resulting payment status', /^\s*Ready to pay\s*Simulated—no money moves\.\s*$/],
]
// The record's details table: the account masked in both columns (its text then carries the spoken
// "account ending …" too, hence the anchored patterns), the rest in full.
const RECORD_ROWS: readonly (readonly [string, readonly (string | RegExp)[]])[] = [
  ['Payee name', ['Cedarline Electrical Supply Inc.', 'Cedarline Electrical Supply Inc.', 'Matches']],
  ['Institution', ['958', '958', 'Matches']],
  ['Transit', ['40388', '40388', 'Matches']],
  ['Account', [/^…7126/, /^…7126/, 'Matches']],
]

// Everything a finished request must never offer again: no call-back, no retry, no second comparison.
const ATTEMPT_CONTROLS = [
  'Start call-back',
  'Try verification again',
  "Couldn't verify",
  'Start a new call-back attempt',
  'Compare',
  'Save attempt',
]

// Through the UI to the saved verified record, PC-20261025-154200-001.
async function verifyLegit(page: Page): Promise<void> {
  await reachComparison(page, LEGIT)
  await expect(page.getByTestId('overall')).toHaveText(DETAILS_MATCH)
  await saveAttempt(page)
}

async function expectOverviewAfterVerify(page: Page): Promise<void> {
  await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(READY_TO_PAY)
  await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(NEEDS_VERIFICATION)
}

// The verified Request detail: the saved result, read-only, with only "View/Print record" and "Back".
async function expectVerifiedDetail(page: Page): Promise<void> {
  // Guard: the saved result has rendered, so the absence checks below can fail.
  await expectStatus(page, VERIFIED)
  await expectStatus(page, READY_TO_PAY)
  await expectNothingEditable(page)
  for (const name of ATTEMPT_CONTROLS) await expect(control(page, name), `no "${name}" control`).toHaveCount(0)
  await expect(control(page, 'View/Print record')).toBeVisible()
  await expect(control(page, BACK)).toBeVisible()
}

test('OS-1 a match reads "Details match." and stays on hold until saved, then Verified and Ready to pay', async ({ page }) => {
  await openOverview(page)
  await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(NEEDS_VERIFICATION)
  await openRequest(page, LEGIT)
  await expectStatus(page, NEEDS_VERIFICATION)
  await startCallback(page, LEGIT)
  await compareAnswers(page, LEGIT)

  const overall = page.getByTestId('overall')
  await expect(overall).toHaveText(DETAILS_MATCH)
  const comparison = table(page, 'Requested and stated details')
  for (const [detail, requested, stated, result] of COMPARISON_ROWS) {
    await expect(rowOf(comparison, detail).getByRole('cell')).toHaveText([requested, stated, result])
  }
  await expect(page.getByText(HOLD_LINE, { exact: true })).toBeVisible()
  // Compared is not saved: nothing here says the payment is released (the overall line above is the guard).
  for (const released of [READY_TO_PAY, SIMULATED]) await expect(page.getByRole('main')).not.toContainText(released)
  await expect(page.getByTestId('status').filter({ hasText: VERIFIED })).toHaveCount(0)

  // Before Save, the Overview row still reads exactly the starting hold.
  await backToOverview(page)
  await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(NEEDS_VERIFICATION)
  for (const released of [READY_TO_PAY, SIMULATED]) {
    await expect(paymentRow(page, LEGIT.supplier)).not.toContainText(released)
  }
  await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(NEEDS_VERIFICATION)

  // Reopening goes straight back to the locked comparison.
  await reviewLink(page, LEGIT).click()
  await expect(page).toHaveURL(AT.comparison(LEGIT))
  await expectScreen(page, HEADING.comparison(LEGIT), 'navigated')
  await expect(overall).toHaveText(DETAILS_MATCH)

  await saveAttempt(page)
  const fields = page.getByTestId('record-fields')
  for (const shown of [VERIFIED, READY_TO_PAY]) await expect(fields).toContainText(shown)

  await backToOverview(page)
  await expectOverviewAfterVerify(page)

  await openRequest(page, LEGIT)
  await expectStatus(page, VERIFIED)
  await expectStatus(page, READY_TO_PAY)
})

test('OS-6 "Simulated—no money moves." sits beside every "Ready to pay": record, Overview and Request detail', async ({ page }) => {
  await verifyLegit(page)
  await expect(page.getByTestId('record-fields')).toContainText(SIMULATED)
  await expectSimulatedBesideReadyToPay(page)

  await backToOverview(page)
  await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(READY_TO_PAY)
  await expect(paymentRow(page, LEGIT.supplier)).toContainText(SIMULATED)
  await expectSimulatedBesideReadyToPay(page)

  await openRequest(page, LEGIT)
  await expectStatus(page, READY_TO_PAY)
  await expectSimulatedBesideReadyToPay(page)
})

test('RT-3 a verified request reopens read-only, and its call-back address lands on the detail', async ({ page }) => {
  await verifyLegit(page)
  // Guard (the record's outcome), then: a verified record offers no new attempt.
  await expect(page.getByTestId('record-fields')).toContainText(VERIFIED)
  await expect(control(page, 'Start a new call-back attempt')).toHaveCount(0)

  await backToOverview(page)
  await openRequest(page, LEGIT)
  await expectVerifiedDetail(page)

  await control(page, 'View/Print record').click()
  await expect(page).toHaveURL(AT.record(FIRST_RECORD_ID))
  await expectScreen(page, HEADING.record(FIRST_RECORD_ID), 'navigated')

  // A typed or bookmarked call-back address can't reopen the answers: it lands on the read-only detail.
  await goToHash(page, `#/request/${LEGIT.requestId}/call`)
  await expect(page).toHaveURL(AT.request(LEGIT))
  await expectScreen(page, HEADING.request(LEGIT), 'navigated')
  await expectVerifiedDetail(page)

  await backToOverview(page)
  await goToHash(page, `#/request/${LEGIT.requestId}/compare`)
  await expect(page).toHaveURL(AT.request(LEGIT))
  await expectScreen(page, HEADING.request(LEGIT), 'navigated')
  await expectVerifiedDetail(page)
})

test('VR-2 the saved verified record shows every PRD field, its exact ID and its saved time with zone', async ({ page }) => {
  await verifyLegit(page)
  await expectRecordFields(page)

  // The fixed clock's ID and time, then an exact value for every labelled field RECORD_FIELDS names.
  await expect(recordValue(page, 'Record ID')).toHaveText('PC-20261025-154200-001')
  await expect(recordValue(page, 'Saved')).toHaveText('Oct 25, 2026, 3:42 PM EDT')
  expect(RECORD_VALUES.map(([term]) => term).sort(), 'a value below for every labelled field').toEqual(
    [...RECORD_PAIR_LABELS].sort(),
  )
  for (const [term, value] of RECORD_VALUES) await expect(recordValue(page, term), term).toHaveText(value)
  await expect(recordValue(page, 'Resulting payment status').getByTestId('status')).toHaveText(READY_TO_PAY)

  const details = table(page, 'Requested and stated details')
  for (const [detail, cells] of RECORD_ROWS) {
    await expect(rowOf(details, detail).getByRole('cell'), detail).toHaveText(cells)
  }
})

// RT-4 for the verified journey: the record, the Overview and the read-only detail each reload to the same
// screen and text. The record is compared field by field, since its "Saved" note is gone after a reload.
test('RT-4 VR-6 after a reload the verified record, the Overview and the read-only detail are unchanged', async ({ page }) => {
  await verifyLegit(page)

  const fields = page.getByTestId('record-fields')
  const details = table(page, 'Requested and stated details')
  const expectRecord = async () => {
    for (const shown of [FIRST_RECORD_ID, FIXED_SAVED_AT, VERIFIED, READY_TO_PAY, SIMULATED]) {
      await expect(fields).toContainText(shown)
    }
    await expect(details).toContainText('…7126')
  }
  await expectRecord()
  const before = { fields: await fields.innerText(), details: await details.innerText(), stored: await readStored(page) }
  expect(before.stored).not.toBeNull()

  await page.reload()
  await expect(page).toHaveURL(AT.record(FIRST_RECORD_ID))
  await expectScreen(page, HEADING.record(FIRST_RECORD_ID), 'loaded')
  await expectRecord()
  await expect(fields).toHaveText(before.fields, { useInnerText: true })
  await expect(details).toHaveText(before.details, { useInnerText: true })

  expect(await readStored(page)).toBe(before.stored)

  // Each also checks the address, the heading, the whole visible text and the saved value after the reload.
  await backToOverview(page)
  await expectSameAfterReload(page, AT.overview, HEADING.overview, expectOverviewAfterVerify)

  await openRequest(page, LEGIT)
  await expectSameAfterReload(page, AT.request(LEGIT), HEADING.request(LEGIT), expectVerifiedDetail)

  expect(await readStored(page)).toBe(before.stored)
})
