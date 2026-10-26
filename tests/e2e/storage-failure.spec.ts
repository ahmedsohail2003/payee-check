import type { Page } from '@playwright/test'
import type { AnswerKey, Answers } from '../../src/kernel/types'
import {
  ANSWER_LABELS,
  AT,
  FIRST_RECORD_ID,
  HEADING,
  LEGIT,
  MISMATCH,
  PAYMENT_STATUS,
  attemptRows,
  blockStorage,
  checkScreen,
  confirmReset,
  couldntVerifyButton,
  expect,
  expectScreen,
  expectStartingStatuses,
  expectStatus,
  fillAnswers,
  installFailureSwitch,
  mainHeading,
  openCouldntVerify,
  openOverview,
  openRequest,
  openResetDialog,
  panelSaveButton,
  paymentStatus,
  readState,
  readStored,
  reasonField,
  recordValue,
  resetDemoButton,
  resetDialog,
  resetDialogButton,
  seedPendingComparison,
  seedSavedMismatch,
  setFailSaves,
  startAt,
  startCallback,
  storageStateWith,
  storedCounts,
  table,
  test,
} from './helpers'

// When the browser misbehaves, the app says so and never shows a result it didn't save. Unreadable data gets the
// Recovery notice and nothing from it; blocked storage gets the "can't save" notice; every failed save keeps
// the screen and the typing, says "Couldn't save—nothing was changed." and recovers through Try again; a reset
// that can't clear keeps everything. Failures come from the switch in helpers.ts, so each test passes alone.

const SAVE_FAILED = "Couldn't save—nothing was changed."
const CANT_SAVE = "This browser isn't letting Payee Check save. You can look around, but attempts can't be saved."
const RECOVERY = "Your saved demo data couldn't be read. Nothing has been shown from it."
const MISMATCH_OVERALL = 'Full account number does not match: supplier said …4471, email requested …9020.'
const DETAILS_MATCH = 'Details match.'
const NO_ANSWER = 'No answer'
const ANSWER_KEYS = Object.keys(ANSWER_LABELS) as AnswerKey[]

// Words only a saved attempt may put on screen.
const ONLY_AFTER_SAVING = ['Saved', 'Verified', 'Ready to pay']
// Words of any status, which invalid data must never produce.
const STATUS_WORDS = ['On hold', 'Verified', 'Ready to pay', 'Scheduled']

// A later moment for Try again, so the record shows when the save actually succeeded, not when it first failed.
const RETRY_TIME = new Date('2026-10-25T19:45:00Z')
const RETRY_RECORD_ID = 'PC-20261025-154500-001'
const RETRY_SAVED_AT = 'Oct 25, 2026, 3:45 PM EDT'

function compareButton(page: Page) {
  return page.getByRole('button', { name: 'Compare', exact: true })
}

function tryAgain(page: Page) {
  return page.getByRole('button', { name: 'Try again', exact: true })
}

// The always-mounted alert announces the failure and offers Try again. Also the guard before absence checks.
async function expectSaveFailed(page: Page): Promise<void> {
  await expect(page.getByRole('alert').getByText(SAVE_FAILED, { exact: true })).toBeVisible()
  await expect(tryAgain(page)).toBeVisible()
}

async function expectBannerCleared(page: Page): Promise<void> {
  await expect(page.getByText(SAVE_FAILED, { exact: true })).toHaveCount(0)
  await expect(tryAgain(page)).toHaveCount(0)
}

// Callers first assert something that must be on the same screen.
async function expectNothingClaimedSaved(page: Page): Promise<void> {
  const body = page.locator('body')
  for (const words of ONLY_AFTER_SAVING) {
    await expect(body, `no "${words}" from an unsaved action`).not.toContainText(words)
  }
}

// Every answer still holds what was typed, and can still be edited: a failed Compare locks nothing.
async function expectAnswersKept(page: Page, answers: Readonly<Answers>): Promise<void> {
  for (const key of ANSWER_KEYS) {
    const field = page.getByLabel(ANSWER_LABELS[key], { exact: true })
    await expect(field).toHaveValue(answers[key])
    await expect(field).toBeEditable()
  }
}

async function openMismatchCallback(page: Page): Promise<void> {
  await openOverview(page)
  await openRequest(page, MISMATCH)
  await startCallback(page, MISMATCH)
}

test.describe('with unreadable saved data', () => {
  const BROKEN = '{not json'
  test.use({ storageState: storageStateWith(BROKEN) })

  // Callers first assert the Recovery text.
  async function expectNoStatus(page: Page): Promise<void> {
    await expect(page.getByTestId('status')).toHaveCount(0)
    await expect(table(page, "This week's payment run")).toHaveCount(0)
    const body = page.locator('body')
    for (const words of STATUS_WORDS) await expect(body, `no "${words}" from invalid data`).not.toContainText(words)
  }

  test('SB-1 unreadable saved data shows only the Recovery notice and is kept until Reset is confirmed', async ({ page }) => {
    await startAt(page)
    await expect(page.getByText(RECOVERY, { exact: true })).toBeVisible()
    await expect(mainHeading(page, 'Payee Check')).toBeVisible()
    await expect(resetDemoButton(page)).toBeVisible()
    await checkScreen(page)
    await expectNoStatus(page)
    expect(await readStored(page), 'showing the notice wrote nothing').toBe(BROKEN)

    // A reload reads the same bad value and still shows nothing from it.
    await page.reload()
    await expect(page.getByText(RECOVERY, { exact: true })).toBeVisible()
    await expectNoStatus(page)
    expect(await readStored(page)).toBe(BROKEN)

    // Reset asks first, and Cancel keeps the bad value where it is.
    await openResetDialog(page)
    expect(await readStored(page)).toBe(BROKEN)
    await resetDialogButton(page, 'Cancel').click()
    await expect(resetDialog(page)).toBeHidden()
    await expect(page.getByText(RECOVERY, { exact: true })).toBeVisible()
    await expectNoStatus(page)
    expect(await readStored(page)).toBe(BROKEN)

    // Only a confirmed reset removes it, and the starting sample data comes back.
    await openResetDialog(page)
    await confirmReset(page)
    await expect(page).toHaveURL(AT.overview)
    await expectScreen(page, HEADING.overview, 'navigated')
    await expectStartingStatuses(page)
    await expect(page.getByText(RECOVERY, { exact: true })).toHaveCount(0)
    expect(await readStored(page)).toBeNull()
  })
})

test("SB-2 blocked storage: the Overview shows the sample data and the can't-save notice, and Compare fails safely", async ({ page }) => {
  await blockStorage(page)
  await openOverview(page)
  const notice = page.getByText(CANT_SAVE, { exact: true })
  await expect(notice).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: CANT_SAVE }), 'static text, not an alert').toHaveCount(0)
  await expectStartingStatuses(page)

  await openRequest(page, MISMATCH)
  await startCallback(page, MISMATCH)
  await fillAnswers(page, MISMATCH.answers)
  const address = page.url()

  await compareButton(page).click()
  await expectSaveFailed(page)
  await expect(page).toHaveURL(address)
  await expect(mainHeading(page, HEADING.callback(MISMATCH))).toBeVisible()
  await expectAnswersKept(page, MISMATCH.answers)
  await expect(page.getByTestId('overall'), 'no comparison is revealed').toHaveCount(0)
  await expectNothingClaimedSaved(page)
  await checkScreen(page)
})

test('SB-3 a failed Compare stays on the Call-back step with the typing unlocked, and Try again compares', async ({ page }) => {
  await installFailureSwitch(page)
  await openMismatchCallback(page)
  await fillAnswers(page, MISMATCH.answers)
  const address = page.url()
  await setFailSaves(page, true)

  await compareButton(page).click()
  await expectSaveFailed(page)
  await expect(page).toHaveURL(address)
  await expect(mainHeading(page, HEADING.callback(MISMATCH))).toBeVisible()
  await expect(compareButton(page), 'focus stays on the button that was pressed').toBeFocused()
  await expectAnswersKept(page, MISMATCH.answers)
  await expect(page.getByTestId('overall'), 'no comparison is revealed').toHaveCount(0)
  await expectNothingClaimedSaved(page)
  await checkScreen(page)
  expect(await readStored(page), 'nothing was saved').toBeNull()

  await setFailSaves(page, false)
  await tryAgain(page).click()
  await expect(page).toHaveURL(AT.comparison(MISMATCH))
  await expectScreen(page, HEADING.comparison(MISMATCH), 'navigated')
  await expect(page.getByTestId('overall')).toHaveText(MISMATCH_OVERALL)
  await expectBannerCleared(page)
  expect(await storedCounts(page)).toEqual({ attempts: 1, records: 0 })
})

test.describe('with an unsaved matching comparison', () => {
  // The legit request: a save that wrongly showed would read "Saved", "Verified" and "Ready to pay".
  const seed = seedPendingComparison(LEGIT)
  test.use({ storageState: storageStateWith(seed) })

  test('SB-3 a failed Save attempt stays on the unsaved Comparison, and Try again saves at the moment it succeeds', async ({ page }) => {
    await installFailureSwitch(page)
    await startAt(page, `#/request/${LEGIT.requestId}/compare`)
    await expect(page).toHaveURL(AT.comparison(LEGIT))
    await expectScreen(page, HEADING.comparison(LEGIT), 'loaded')
    await expect(page.getByTestId('overall')).toHaveText(DETAILS_MATCH)
    const details = table(page, 'Requested and stated details')
    const shown = await details.innerText()
    expect(await readStored(page), 'the seeded comparison is what the app found').toBe(seed)
    const address = page.url()
    await setFailSaves(page, true)

    const save = page.getByRole('button', { name: 'Save attempt', exact: true })
    await save.click()
    await expectSaveFailed(page)
    await expect(page).toHaveURL(address)
    await expect(mainHeading(page, HEADING.comparison(LEGIT))).toBeVisible()
    await expect(save, 'focus stays on the button that was pressed').toBeFocused()
    await expect(page.getByTestId('overall')).toHaveText(DETAILS_MATCH)
    await expect(details).toHaveText(shown, { useInnerText: true })
    await expectNothingClaimedSaved(page)
    await checkScreen(page)
    expect(await readStored(page), 'the saved value is byte-identical').toBe(seed)

    // Try again re-runs the save with a fresh clock reading; it never re-sends what failed.
    await page.clock.setFixedTime(RETRY_TIME)
    await setFailSaves(page, false)
    await tryAgain(page).click()
    await expect(page).toHaveURL(AT.record(RETRY_RECORD_ID))
    await expectScreen(page, HEADING.record(RETRY_RECORD_ID), 'navigated')
    await expectBannerCleared(page)
    await expect(page.getByTestId('saved-note'), 'only now does "Saved" appear').toHaveText('Saved')
    await expect(recordValue(page, 'Saved')).toHaveText(RETRY_SAVED_AT)
    await expect(recordValue(page, 'Outcome')).toContainText('Verified')
    const saved = await readState(page)
    expect(saved?.attempts).toHaveLength(1)
    expect(saved?.attempts[0]).toMatchObject({
      status: 'saved',
      savedAt: RETRY_TIME.toISOString(),
      recordId: RETRY_RECORD_ID,
    })
    expect(saved?.records).toHaveLength(1)
  })
})

test("SB-3 a failed Couldn't verify stays on the Call-back step with the reason and typing intact, and Try again saves", async ({ page }) => {
  await installFailureSwitch(page)
  await openMismatchCallback(page)
  const person = MISMATCH.answers.personSpokenTo
  await fillAnswers(page, { personSpokenTo: person })
  await openCouldntVerify(page)
  await reasonField(page).fill(NO_ANSWER)
  const address = page.url()
  await setFailSaves(page, true)

  await panelSaveButton(page).click()
  await expectSaveFailed(page)
  await expect(page).toHaveURL(address)
  await expect(mainHeading(page, HEADING.callback(MISMATCH))).toBeVisible()
  await expect(panelSaveButton(page), 'focus stays on the button that was pressed').toBeFocused()
  await expect(couldntVerifyButton(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(reasonField(page)).toHaveValue(NO_ANSWER)
  await expect(page.getByLabel(ANSWER_LABELS.personSpokenTo, { exact: true })).toHaveValue(person)
  await expect(page.getByTestId('record-fields'), 'no record is shown').toHaveCount(0)
  await expectNothingClaimedSaved(page)
  await checkScreen(page)
  expect(await readStored(page), 'nothing was saved').toBeNull()

  await setFailSaves(page, false)
  await tryAgain(page).click()
  await expect(page).toHaveURL(AT.record(FIRST_RECORD_ID))
  await expectScreen(page, HEADING.record(FIRST_RECORD_ID), 'navigated')
  await expectBannerCleared(page)
  await expect(recordValue(page, 'Reason or note')).toHaveText(NO_ANSWER)
  await expect(recordValue(page, 'Person spoken to')).toHaveText(person)
  expect(await storedCounts(page)).toEqual({ attempts: 1, records: 1 })
})

test.describe('with a saved mismatch', () => {
  const seed = seedSavedMismatch()
  test.use({ storageState: storageStateWith(seed) })

  test("SB-5 a reset that can't clear storage shows the banner and keeps every status and the saved value", async ({ page }) => {
    await installFailureSwitch(page)
    await openOverview(page)
    await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(PAYMENT_STATUS.mismatch)
    await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(PAYMENT_STATUS.needsVerification)
    expect(await readStored(page), 'the seeded mismatch is what the app found').toBe(seed)
    await setFailSaves(page, true)

    await openResetDialog(page)
    await confirmReset(page)
    await expect(page.getByRole('alert').filter({ hasText: "Couldn't" })).toBeVisible()
    await expect(page).toHaveURL(AT.overview)
    await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(PAYMENT_STATUS.mismatch)
    await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(PAYMENT_STATUS.needsVerification)
    await checkScreen(page)
    expect(await readStored(page), 'the saved value is byte-identical').toBe(seed)

    // The app's own state wasn't cleared either: the request still opens on its saved mismatch.
    await openRequest(page, MISMATCH)
    await expectStatus(page, PAYMENT_STATUS.mismatch)
    await expect(attemptRows(page)).toHaveCount(1)
  })
})
