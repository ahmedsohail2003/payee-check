import type { Page } from '@playwright/test'
import {
  AT,
  HEADING,
  LEGIT,
  MISMATCH,
  PAYMENT_STATUS,
  attemptsTable,
  backToOverview,
  checkScreen,
  confirmReset,
  control,
  expect,
  expectScreen,
  expectStartingStatuses,
  openRequest,
  openResetDialog,
  paymentStatus,
  readLocal,
  readStored,
  resetDemoButton,
  resetDialog,
  resetDialogButton,
  reviewLink,
  screenTitle,
  seedPendingComparison,
  seedSavedMismatch,
  startAt,
  storageStateWith,
  test,
} from './helpers'

// Reset demo always asks first. Cancel and Esc change nothing, byte for byte. Confirming clears only Payee
// Check's own key, so the two starting requests come back while another site's data on the same origin stays.
// Each test starts from a kernel-built seed (storageState), so any one of them passes when run alone.

const RESET_BODY =
  'This clears your saved attempts, records and any unsaved comparison, and restores the starting sample data.'
const OTHER_SITE = { name: 'other-site:keep', value: 'kept' }

// Opens the Overview on a seeded store and proves the app loaded that seed, not an empty or recovered state.
async function openSeededOverview(page: Page, seed: string): Promise<void> {
  await startAt(page)
  await expect(page).toHaveURL(AT.overview)
  await expectScreen(page, HEADING.overview, 'loaded')
  expect(await readStored(page), 'the seeded value is what the app found').toBe(seed)
}

async function expectSavedMismatchStatuses(page: Page): Promise<void> {
  await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(PAYMENT_STATUS.mismatch)
  await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(PAYMENT_STATUS.needsVerification)
}

// After Cancel or Esc: the dialog is gone, focus is back where the person left it, and nothing changed.
async function expectNothingChanged(page: Page, seed: string): Promise<void> {
  await expect(resetDialog(page)).toBeHidden()
  await expect(resetDemoButton(page), 'focus returns to "Reset demo"').toBeFocused()
  await expect(page).toHaveURL(AT.overview)
  await expectSavedMismatchStatuses(page)
  expect(await readStored(page), 'the saved value is byte-identical').toBe(seed)
  await checkScreen(page, { title: screenTitle(HEADING.overview) })
}

test.describe('with a saved mismatch', () => {
  const seed = seedSavedMismatch()
  test.use({ storageState: storageStateWith(seed) })

  test('RS-1 Reset demo asks first: a modal dialog opens on Cancel, and nothing changes while it is open', async ({ page }) => {
    await openSeededOverview(page, seed)
    await expectSavedMismatchStatuses(page)

    await openResetDialog(page)
    const dialog = resetDialog(page)
    expect(await dialog.evaluate((element) => element.matches(':modal')), 'opened with showModal()').toBe(true)
    await expect(dialog.getByRole('heading', { name: 'Reset demo?', exact: true })).toBeVisible()
    await expect(dialog.getByText(RESET_BODY, { exact: true })).toBeVisible()
    await expect(resetDialogButton(page, 'Cancel')).toBeVisible()
    await expect(resetDialogButton(page, 'Yes, reset')).toBeVisible()

    // Checked through storage, not the page: the modal makes everything behind it inert.
    await expect(page).toHaveURL(AT.overview)
    expect(await readStored(page), 'opening the dialog writes nothing').toBe(seed)
  })

  test('RS-3 Cancel closes the dialog, changes nothing and returns focus to Reset demo', async ({ page }) => {
    await openSeededOverview(page, seed)
    await expectSavedMismatchStatuses(page)

    await openResetDialog(page)
    await resetDialogButton(page, 'Cancel').click()
    await expectNothingChanged(page, seed)
  })

  test('RS-3 Esc closes the dialog, changes nothing and returns focus to Reset demo', async ({ page }) => {
    await openSeededOverview(page, seed)
    await expectSavedMismatchStatuses(page)

    await openResetDialog(page)
    await page.keyboard.press('Escape')
    await expectNothingChanged(page, seed)
  })
})

test.describe("with an unsaved comparison and another site's data", () => {
  const seed = seedPendingComparison(MISMATCH)
  test.use({ storageState: storageStateWith(seed, [OTHER_SITE]) })

  test('RS-2 confirming clears the unsaved comparison and only Payee Check\'s key, and the two starting requests come back', async ({ page }) => {
    await openSeededOverview(page, seed)
    expect(await readLocal(page, OTHER_SITE.name), "the other site's key is there to start with").toBe(OTHER_SITE.value)

    // Guard: the seeded comparison is live, so the request opens on it rather than on its detail.
    await reviewLink(page, MISMATCH).click()
    await expect(page).toHaveURL(AT.comparison(MISMATCH))
    await expectScreen(page, HEADING.comparison(MISMATCH), 'navigated')
    await backToOverview(page)

    await openResetDialog(page)
    await confirmReset(page)

    // A confirmed reset lands on the Overview heading.
    await expect(page).toHaveURL(AT.overview)
    await expectScreen(page, HEADING.overview, 'navigated')
    await expectStartingStatuses(page)
    expect(await readStored(page), 'payee-check:v1 is removed, so no attempt or record is left').toBeNull()
    expect(await readLocal(page, OTHER_SITE.name), "another site's key on the same origin is untouched").toBe(
      OTHER_SITE.value,
    )

    // The comparison is gone: the request opens on its detail, ready for a first call-back, with no attempts.
    await openRequest(page, MISMATCH)
    await expect(control(page, 'Start call-back')).toBeVisible()
    await expect(attemptsTable(page)).toHaveCount(0)
  })
})
