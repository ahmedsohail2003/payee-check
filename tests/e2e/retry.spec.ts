import type { Page } from '@playwright/test'
import {
  ANSWER_LABELS,
  AT,
  CALL_SCRIPT,
  FIRST_RECORD_ID,
  FIXED_SAVED_AT,
  HEADING,
  LEGIT,
  MISMATCH,
  MISMATCH_EMAIL,
  PAYMENT_STATUS,
  SECOND_RECORD_ID,
  type Sample,
  attemptRow,
  attemptRows,
  backToOverview,
  backToRequest,
  compareAnswers,
  control,
  emailPanel,
  escapeRegExp,
  everythingInBody,
  expect,
  expectBlankAnswers,
  expectRecordText,
  expectScreen,
  expectSimulatedBesideReadyToPay,
  expectStatus,
  mainHeading,
  openAttemptRecord,
  openOverview,
  openRequest,
  paymentRow,
  paymentStatus,
  reachComparison,
  readState,
  readStored,
  recordLink,
  recordText,
  recordValue,
  retryFromDetail,
  retryFromRecord,
  saveAttempt,
  saveCouldntVerify,
  startCallback,
  test,
} from './helpers'

// Retrying the mismatch request: the saved mismatch stays listed with its record, each way back in opens a
// blank Call-back step that knows nothing of the email or the first answers, a matching retry verifies the
// payment without touching record 1, and every one of these states survives a reload. Every test starts from
// an empty store and walks the UI itself, so any one of them passes when run alone.

const VERIFIED = 'Verified'
const NO_ANSWER = 'No answer'

// On the retry the supplier states exactly what the email asked for, so the second attempt verifies.
const MISMATCH_RETRY: Sample = {
  ...MISMATCH,
  answers: {
    payeeName: 'Harbourline Lumber Ltd.',
    institution: '952',
    transit: '60415',
    account: '73419020',
    personSpokenTo: 'Sam Okafor',
  },
}

// Through the UI to the saved mismatch record, PC-20261025-154200-001.
async function saveMismatch(page: Page): Promise<void> {
  await reachComparison(page, MISMATCH)
  await saveAttempt(page)
}

// Unresolved after the saved mismatch: the hold, the one attempt with its record, and the retry.
async function expectHeldMismatchDetail(page: Page): Promise<void> {
  await expectStatus(page, PAYMENT_STATUS.mismatch)
  await expect(attemptRows(page)).toHaveCount(1)
  const attempt = attemptRow(page, FIRST_RECORD_ID)
  await expect(attempt).toContainText(/details do not match/i)
  await expect(attempt).toContainText(FIXED_SAVED_AT)
  // A mismatch is saved with no reason; its row says so in the record's own words.
  await expect(attempt).toContainText('No reason recorded')
  await expect(recordLink(page, FIRST_RECORD_ID)).toHaveAttribute('href', `#/record/${FIRST_RECORD_ID}`)
  await expect(control(page, 'Try verification again')).toBeVisible()
  await expect(control(page, 'Start call-back')).toHaveCount(0)
}

// Unresolved after a "No answer" couldn't-verify: the hold announced with its reason, the attempt, the retry.
async function expectHeldIncompleteDetail(page: Page): Promise<void> {
  await expectStatus(page, PAYMENT_STATUS.incomplete)
  await expect(mainHeading(page, HEADING.request(MISMATCH))).toHaveAccessibleDescription(
    new RegExp(`${escapeRegExp(PAYMENT_STATUS.incomplete)}.*${escapeRegExp(NO_ANSWER)}`),
  )
  await expect(attemptRows(page)).toHaveCount(1)
  await expect(attemptRow(page, FIRST_RECORD_ID)).toContainText(NO_ANSWER)
  await expect(control(page, 'Try verification again')).toBeVisible()
}

// Verified after the retry: read-only, both attempts listed, and the record to print is the verified one.
async function expectVerifiedDetail(page: Page): Promise<void> {
  await expectStatus(page, VERIFIED)
  await expectStatus(page, PAYMENT_STATUS.readyToPay)
  await expectSimulatedBesideReadyToPay(page)
  await expect(attemptRows(page)).toHaveCount(2)
  await expect(control(page, 'View/Print record')).toHaveAttribute('href', `#/record/${SECOND_RECORD_ID}`)
  for (const name of ['Start call-back', 'Try verification again']) {
    await expect(control(page, name), `no "${name}" control`).toHaveCount(0)
  }
}

// Reloads the screen and expects the same address, heading, state, visible text and saved value.
async function expectSameAfterReload(
  page: Page,
  at: RegExp,
  heading: string,
  expectState: (page: Page) => Promise<void>,
): Promise<void> {
  const main = page.getByRole('main')
  await expectState(page) // the state is on screen before its text is captured
  const before = { text: await main.innerText(), stored: await readStored(page) }

  await page.reload()
  await expect(page).toHaveURL(at)
  await expectScreen(page, heading, 'loaded')
  await expectState(page)
  await expect(main).toHaveText(before.text, { useInnerText: true })
  expect(await readStored(page)).toBe(before.stored)
}

test('RT-1 a saved mismatch lists its attempt and record, and both retry buttons open a blank call-back', async ({ page }) => {
  await saveMismatch(page)
  const stored = await readStored(page)

  await backToRequest(page, MISMATCH)
  await expectHeldMismatchDetail(page)
  await retryFromDetail(page, MISMATCH)
  await expectBlankAnswers(page)

  // The record's own way back in, reached through the attempt list.
  await backToOverview(page)
  await openRequest(page, MISMATCH)
  await openAttemptRecord(page, FIRST_RECORD_ID)
  await expect(recordValue(page, 'Resulting payment status')).toContainText(PAYMENT_STATUS.mismatch)
  await retryFromRecord(page, MISMATCH)
  await expectBlankAnswers(page)

  // Opening a new attempt writes nothing: only Compare and the saves do.
  expect(await readStored(page)).toBe(stored)
})

test('RT-2 CB-3 CB-4 the retry starts with five blank text fields, no earlier answer and nothing from the email', async ({ page }) => {
  await saveMismatch(page)
  await backToRequest(page, MISMATCH)
  // The email was on screen right before the retry.
  await expect(emailPanel(page).getByText(MISMATCH_EMAIL.from)).toBeVisible()
  await retryFromDetail(page, MISMATCH)

  for (const label of Object.values(ANSWER_LABELS)) {
    const field = page.getByLabel(label, { exact: true })
    await expect(field).toBeEditable()
    await expect(field).toHaveValue('')
    await expect(field).toHaveAttribute('type', 'text')
    await expect(field).toHaveAttribute('autocomplete', 'off')
  }
  await expect(page.getByRole('textbox')).toHaveCount(5)
  await expect(page.locator('input[type="number"]')).toHaveCount(0)

  // Guard: the step has rendered, so the absence checks below can fail.
  await expect(page.getByText(CALL_SCRIPT, { exact: true })).toBeVisible()
  await expect(emailPanel(page)).toHaveCount(0)

  // No field of attempt 2 holds anything, hidden ones included, so no attempt-1 answer was copied in.
  const values = await page
    .locator('input, textarea')
    .evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement | HTMLTextAreaElement).value))
  expect(values.length).toBeGreaterThanOrEqual(5)
  for (const value of values) expect(value, 'every field of the new attempt starts empty').toBe('')

  // Nor does anything else on the step carry the first answers or the email.
  const everything = await everythingInBody(page)
  const neverHere = [
    MISMATCH_EMAIL.from,
    MISMATCH_EMAIL.subject,
    ...MISMATCH_EMAIL.bodyLines,
    ...MISMATCH_EMAIL.contacts,
    'harbourline-pay',
    MISMATCH_EMAIL.requested.institution,
    MISMATCH_EMAIL.requested.transit,
    MISMATCH_EMAIL.requested.account,
    MISMATCH.answers.account,
    '…4471',
    MISMATCH.answers.personSpokenTo,
  ]
  for (const value of neverHere) {
    expect(everything, `"${value}" must not reach the retry's Call-back step`).not.toContain(value)
  }
})

test('VR-1 after the retry verifies, record 1 is unchanged and still reads "On hold—details do not match"', async ({ page }) => {
  await saveMismatch(page)
  const first = await recordText(page)
  const before = await readState(page)
  expect(before?.records).toHaveLength(1)

  await retryFromRecord(page, MISMATCH)
  await compareAnswers(page, MISMATCH_RETRY)
  await expect(page.getByTestId('overall')).toHaveText('Details match.')
  await saveAttempt(page, SECOND_RECORD_ID)
  await expect(recordValue(page, 'Record ID')).toHaveText(SECOND_RECORD_ID)
  await expect(recordValue(page, 'Outcome')).toContainText(VERIFIED)
  await expect(recordValue(page, 'Resulting payment status')).toContainText(PAYMENT_STATUS.readyToPay)

  await backToOverview(page)
  await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(PAYMENT_STATUS.readyToPay)
  await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(PAYMENT_STATUS.needsVerification)

  // Record 1, opened from the now-verified request's attempt list.
  await openRequest(page, MISMATCH)
  await expectVerifiedDetail(page)
  await openAttemptRecord(page, FIRST_RECORD_ID)
  await expect(recordValue(page, 'Record ID')).toHaveText(FIRST_RECORD_ID)
  await expect(recordValue(page, 'Resulting payment status')).toHaveText(PAYMENT_STATUS.mismatch)
  await expect(page.getByTestId('record-fields')).not.toContainText(PAYMENT_STATUS.readyToPay)
  await expectRecordText(page, first)
  // The request is verified now, so even its earlier record offers no new attempt.
  await expect(control(page, 'Start a new call-back attempt')).toHaveCount(0)

  const after = await readState(page)
  expect(after?.records.map((record) => record.id)).toEqual([FIRST_RECORD_ID, SECOND_RECORD_ID])
  expect(after?.records[0]).toEqual(before?.records[0])
  expect(after?.attempts[0]).toEqual(before?.attempts[0])
})

test("RT-4 the held request, the retry's blank call-back and the verified request each look the same after a reload", async ({ page }) => {
  await saveMismatch(page)
  await backToRequest(page, MISMATCH)
  await expectSameAfterReload(page, AT.request(MISMATCH), HEADING.request(MISMATCH), expectHeldMismatchDetail)

  await retryFromDetail(page, MISMATCH)
  await expectSameAfterReload(page, AT.callback(MISMATCH), HEADING.callback(MISMATCH), expectBlankAnswers)

  await compareAnswers(page, MISMATCH_RETRY)
  await saveAttempt(page, SECOND_RECORD_ID)
  await backToRequest(page, MISMATCH)
  await expectSameAfterReload(page, AT.request(MISMATCH), HEADING.request(MISMATCH), expectVerifiedDetail)
})

test("RT-4 a couldn't-verify hold, its reason and its record look the same after a reload", async ({ page }) => {
  await openOverview(page)
  await openRequest(page, MISMATCH)
  await startCallback(page, MISMATCH)
  await saveCouldntVerify(page, NO_ANSWER)

  // The record, compared field by field: the "Saved" note after a save is not part of it.
  await expect(recordValue(page, 'Reason or note')).toHaveText(NO_ANSWER)
  const record = await recordText(page)
  const stored = await readStored(page)
  await page.reload()
  await expect(page).toHaveURL(AT.record(FIRST_RECORD_ID))
  await expectScreen(page, HEADING.record(FIRST_RECORD_ID), 'loaded')
  await expectRecordText(page, record)
  expect(await readStored(page)).toBe(stored)

  await backToRequest(page, MISMATCH)
  await expectSameAfterReload(page, AT.request(MISMATCH), HEADING.request(MISMATCH), expectHeldIncompleteDetail)

  await backToOverview(page)
  await expectSameAfterReload(page, AT.overview, HEADING.overview, async () => {
    await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(PAYMENT_STATUS.incomplete)
    await expect(paymentRow(page, MISMATCH.supplier), 'the Overview row keeps its reason').toContainText(NO_ANSWER)
    await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(PAYMENT_STATUS.needsVerification)
  })
})
