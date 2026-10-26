import type { Page } from '@playwright/test'
import {
  ANSWER_LABELS,
  AT,
  FIRST_RECORD_ID,
  HEADING,
  LEGIT,
  MISMATCH,
  PAYMENT_STATUS,
  RECORD_HONESTY,
  attemptRow,
  attemptRows,
  backToOverview,
  checkScreen,
  control,
  couldntVerifyButton,
  couldntVerifyPanel,
  escapeRegExp,
  expect,
  expectScreen,
  expectStatus,
  fillAnswers,
  mainHeading,
  openCouldntVerify,
  openOverview,
  openRequest,
  panelSaveButton,
  paymentRow,
  paymentStatus,
  readState,
  readStored,
  reasonField,
  recordValue,
  rowOf,
  saveCouldntVerify,
  screenTitle,
  startCallback,
  storedCounts,
  table,
  test,
} from './helpers'

// Couldn't verify on the mismatch sample: always on offer at the Call-back step, never needs the person spoken
// to, holds the payment as incomplete with its reason, and writes a record that checked nothing. Every test
// starts from an empty store and walks the UI itself, so any one of them passes when run alone.

const COULDNT_VERIFY = "Couldn't verify"
const NO_ANSWER = 'No answer'
const NOT_CHECKED = 'Not checked'
const DETAILS = ['Payee name', 'Institution', 'Transit', 'Account'] as const

async function openMismatchCallback(page: Page): Promise<void> {
  await openOverview(page)
  await openRequest(page, MISMATCH)
  await startCallback(page, MISMATCH)
}

test("CB-6 Couldn't verify is offered on arrival and after a refused Compare, and saves with the person blank", async ({ page }) => {
  await openMismatchCallback(page)
  const disclosure = couldntVerifyButton(page)
  await expect(disclosure).toBeVisible()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await expect(couldntVerifyPanel(page)).toHaveCount(0)

  // Compare with every field blank is refused, saves nothing, and leaves Couldn't verify where it was.
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  const summary = page.getByTestId('missing-summary')
  await expect(summary).toBeFocused()
  await expect(summary.getByRole('button')).toHaveText(Object.values(ANSWER_LABELS))
  await expect(page).toHaveURL(AT.callback(MISMATCH))
  expect(await readStored(page)).toBeNull()
  await expect(disclosure).toBeVisible()
  await expect(disclosure).toBeEnabled()

  // The person spoken to is still blank (and marked missing for Compare), yet the panel saves.
  await openCouldntVerify(page)
  await expect(reasonField(page)).toBeFocused()
  await expect(page.getByLabel(ANSWER_LABELS.personSpokenTo, { exact: true })).toHaveValue('')
  await panelSaveButton(page).click()
  await expect(page).toHaveURL(AT.record(FIRST_RECORD_ID))
  await expectScreen(page, HEADING.record(FIRST_RECORD_ID), 'navigated')

  await expect(recordValue(page, 'Outcome')).toContainText(COULDNT_VERIFY)
  await expect(recordValue(page, 'Resulting payment status')).toContainText(PAYMENT_STATUS.incomplete)
  await expect(recordValue(page, 'Person spoken to')).toHaveText('Not recorded')
  await expect(recordValue(page, 'Reason or note')).toHaveText('No reason recorded')

  const saved = await readState(page)
  expect(saved?.attempts).toHaveLength(1)
  expect(saved?.attempts[0]).toMatchObject({ status: 'saved', outcome: 'couldnt_verify', personSpokenTo: null })
  expect(saved?.records).toHaveLength(1)
})

test('OS-3 "No answer" holds the payment as incomplete with its reason, offers a retry, and a double-click saves one record', async ({ page }) => {
  await openMismatchCallback(page)
  await openCouldntVerify(page)
  await reasonField(page).fill(NO_ANSWER)

  // The first click saves and leaves the step in the same handler, so the second lands on the record and can't
  // save again. That second click may take focus off the heading, so only the title is checked here.
  await panelSaveButton(page).dblclick()
  await expect(page).toHaveURL(AT.record(FIRST_RECORD_ID))
  await expect(mainHeading(page, HEADING.record(FIRST_RECORD_ID))).toBeVisible()
  await checkScreen(page, { title: screenTitle(HEADING.record(FIRST_RECORD_ID)) })
  await expect.poll(() => storedCounts(page)).toEqual({ attempts: 1, records: 1 })

  await expect(recordValue(page, 'Outcome')).toContainText(COULDNT_VERIFY)
  await expect(recordValue(page, 'Resulting payment status')).toContainText(PAYMENT_STATUS.incomplete)
  await expect(recordValue(page, 'Reason or note')).toHaveText(NO_ANSWER)
  await expect(control(page, 'Start a new call-back attempt')).toBeVisible()

  await backToOverview(page)
  await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(PAYMENT_STATUS.incomplete)
  await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(PAYMENT_STATUS.needsVerification)
  // PRD States and Boundaries: the payment row shows the incomplete hold "with the reason", and only that row.
  await expect(paymentRow(page, MISMATCH.supplier)).toContainText(NO_ANSWER)
  await expect(paymentRow(page, LEGIT.supplier)).not.toContainText(NO_ANSWER)

  // The detail announces the hold together with its reason, lists the one attempt, and offers the retry.
  await openRequest(page, MISMATCH)
  await expectStatus(page, PAYMENT_STATUS.incomplete)
  await expect(mainHeading(page, HEADING.request(MISMATCH))).toHaveAccessibleDescription(
    new RegExp(`${escapeRegExp(PAYMENT_STATUS.incomplete)}.*${escapeRegExp(NO_ANSWER)}`),
  )
  await expect(attemptRows(page)).toHaveCount(1)
  const attempt = attemptRow(page, FIRST_RECORD_ID)
  await expect(attempt).toContainText(COULDNT_VERIFY)
  await expect(attempt).toContainText(NO_ANSWER)
  await expect(control(page, 'Try verification again')).toBeVisible()
  await expect(control(page, 'Start call-back')).toHaveCount(0)

  expect(await storedCounts(page)).toEqual({ attempts: 1, records: 1 })
})

test('VR-3 a couldn\'t-verify record reads "Not checked" for all four details and never "Matches", even with answers typed', async ({ page }) => {
  await openMismatchCallback(page)
  // Three of these four details agree with the email, so a record that compared them would say "Matches".
  await fillAnswers(page, MISMATCH.answers)
  await saveCouldntVerify(page, '')

  // Guard: the record has rendered, so the absence checks below can fail.
  await expect(recordValue(page, 'Record ID')).toHaveText(FIRST_RECORD_ID)

  const details = table(page, 'Requested and stated details')
  for (const detail of DETAILS) {
    await expect(rowOf(details, detail).getByRole('cell', { name: NOT_CHECKED, exact: true })).toBeVisible()
  }
  const main = page.getByRole('main')
  await expect(main.getByText(NOT_CHECKED, { exact: true })).toHaveCount(4)
  await expect(main.getByText('Matches', { exact: true })).toHaveCount(0)
  await expect(main).not.toContainText('Match')
  await expect(details).not.toContainText('Does not match')
  // Nothing typed was compared or kept as a stated detail: the account typed ended 4471.
  await expect(details).not.toContainText('4471')

  await expect(page.getByText(RECORD_HONESTY, { exact: true })).toBeVisible()
  await expect(recordValue(page, 'Outcome')).toContainText(COULDNT_VERIFY)
  // The person spoken to is the one answer a couldn't-verify record keeps, as typed.
  await expect(recordValue(page, 'Person spoken to')).toHaveText(MISMATCH.answers.personSpokenTo)
})
