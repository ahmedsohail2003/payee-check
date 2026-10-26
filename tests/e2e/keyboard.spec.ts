import type { Locator, Page } from '@playwright/test'
import type { AnswerKey } from '../../src/kernel/types'
import {
  ANSWER_LABELS,
  AT,
  FIRST_RECORD_ID,
  HEADING,
  MISMATCH,
  PAYMENT_STATUS,
  control,
  expect,
  expectScreen,
  expectStartingStatuses,
  paymentStatus,
  readStored,
  resetDemoButton,
  resetDialog,
  resetDialogButton,
  reviewLink,
  startAt,
  tabTo,
  test,
} from './helpers'

// Keyboard alone, from the first Tab to a confirmed Reset: Tab, Shift+Tab, Enter and Space reach and press
// every control the mismatch journey needs, the answers are typed into whichever field Tab reached, and every
// screen change puts focus on the new main heading. After the page loads, nothing is clicked or filled in.

const OVERALL = 'Full account number does not match: supplier said …4471, email requested …9020.'

// Tabs forward to the control, then presses `key` on it: Enter for a link or button, Space for a button.
async function pressWithKeyboard(page: Page, target: Locator, key: 'Enter' | 'Space'): Promise<void> {
  await tabTo(page, target)
  await page.keyboard.press(key)
}

test('LF-2 the mismatch journey and a Reset work by keyboard alone, with the main heading focused on every screen', async ({ page }) => {
  await startAt(page)
  await expect(page).toHaveURL(AT.overview)
  await expectScreen(page, HEADING.overview, 'loaded')

  // Overview → Request detail.
  await pressWithKeyboard(page, reviewLink(page, MISMATCH), 'Enter')
  await expect(page).toHaveURL(AT.request(MISMATCH))
  await expectScreen(page, HEADING.request(MISMATCH), 'navigated')

  // Request detail → Call-back step.
  await pressWithKeyboard(page, control(page, 'Start call-back'), 'Enter')
  await expect(page).toHaveURL(AT.callback(MISMATCH))
  await expectScreen(page, HEADING.callback(MISMATCH), 'navigated')

  // Each answer is typed into the field Tab reached, in form order.
  for (const key of Object.keys(ANSWER_LABELS) as AnswerKey[]) {
    const field = page.getByLabel(ANSWER_LABELS[key], { exact: true })
    await tabTo(page, field)
    await page.keyboard.type(MISMATCH.answers[key])
    await expect(field).toHaveValue(MISMATCH.answers[key])
  }

  // Shift+Tab back from Compare finds the last answer still typed in; Space then presses Compare.
  const compare = page.getByRole('button', { name: 'Compare', exact: true })
  const lastAnswer = page.getByLabel(ANSWER_LABELS.personSpokenTo, { exact: true })
  await tabTo(page, compare)
  await tabTo(page, lastAnswer, 40, 'Shift+Tab')
  await expect(lastAnswer).toHaveValue(MISMATCH.answers.personSpokenTo)
  await pressWithKeyboard(page, compare, 'Space')
  await expect(page).toHaveURL(AT.comparison(MISMATCH))
  await expectScreen(page, HEADING.comparison(MISMATCH), 'navigated')
  await expect(page.getByTestId('overall')).toHaveText(OVERALL)

  // Comparison → record.
  await pressWithKeyboard(page, page.getByRole('button', { name: 'Save attempt', exact: true }), 'Enter')
  await expect(page).toHaveURL(AT.record(FIRST_RECORD_ID))
  await expectScreen(page, HEADING.record(FIRST_RECORD_ID), 'navigated')

  // Record → Overview, where the saved mismatch now holds the payment.
  await pressWithKeyboard(page, page.getByRole('link', { name: 'Back to overview', exact: true }), 'Enter')
  await expect(page).toHaveURL(AT.overview)
  await expectScreen(page, HEADING.overview, 'navigated')
  await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(PAYMENT_STATUS.mismatch)
  expect(await readStored(page), 'the journey saved its attempt').not.toBeNull()

  // Reset demo opens on Cancel, so a stray Enter would cancel; Tab reaches "Yes, reset" and Enter confirms.
  await pressWithKeyboard(page, resetDemoButton(page), 'Enter')
  await expect(resetDialog(page)).toBeVisible()
  await expect(resetDialogButton(page, 'Cancel'), 'the dialog opens on Cancel').toBeFocused()
  await pressWithKeyboard(page, resetDialogButton(page, 'Yes, reset'), 'Enter')
  await expect(resetDialog(page)).toBeHidden()

  // Back to the starting statuses, with focus on the Overview heading.
  await expect(page).toHaveURL(AT.overview)
  await expectScreen(page, HEADING.overview, 'navigated')
  await expectStartingStatuses(page)
  await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(PAYMENT_STATUS.needsVerification)
  expect(await readStored(page), 'the reset removed the saved attempts').toBeNull()
})
