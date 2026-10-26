import type { Page } from '@playwright/test'
import type { AnswerKey } from '../../src/kernel/types'
import {
  ANSWER_LABELS,
  AT,
  HEADING,
  LEGIT,
  MISMATCH,
  backToOverview,
  checkScreen,
  compareAnswers,
  control,
  expect,
  expectNothingEditable,
  expectScreen,
  fillAnswers,
  goToHash,
  mainHeading,
  openOverview,
  openRequest,
  paymentStatus,
  reachComparison,
  readStored,
  reviewLink,
  screenTitle,
  startCallback,
  table,
  test,
} from './helpers'

// The comparison lock, attacked from every direction on the mismatch sample: Enter, the app's Back, the
// browser's Back button, a typed address and a reload. Once Compare has run nothing editable ever comes back,
// and the saved value changes only when Compare or Save attempt writes it. Every test starts from an empty
// store and walks the UI itself, so any one of them passes alone.

const NEEDS_VERIFICATION = 'On hold—verification needed'
const OVERALL = 'Full account number does not match: supplier said …4471, email requested …9020.'
const ANSWER_KEYS = Object.keys(ANSWER_LABELS) as AnswerKey[]

// A comparison waiting to be saved offers no way to start or compare again; Save attempt is the only way on.
const NEW_ATTEMPT_CONTROLS = [
  'Start call-back',
  'Try verification again',
  "Couldn't verify",
  'Start a new call-back attempt',
  'Compare',
]

function field(page: Page, key: AnswerKey) {
  return page.getByLabel(ANSWER_LABELS[key], { exact: true })
}

// The mismatch comparison, locked. The overall line is the guard before the absence check.
async function expectLockedComparison(page: Page): Promise<void> {
  await expect(page).toHaveURL(AT.comparison(MISMATCH))
  await expect(page.getByTestId('overall')).toHaveText(OVERALL)
  await expectNothingEditable(page)
}

async function expectBothHeld(page: Page): Promise<void> {
  await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(NEEDS_VERIFICATION)
  await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(NEEDS_VERIFICATION)
}

async function openMismatchCallback(page: Page): Promise<void> {
  await openOverview(page)
  await openRequest(page, MISMATCH)
  await startCallback(page, MISMATCH)
}

test('RQ-3 Back from an unsaved comparison returns to the Overview with statuses and the saved value unchanged', async ({ page }) => {
  await openOverview(page)
  await expectBothHeld(page)
  await openRequest(page, MISMATCH)
  await startCallback(page, MISMATCH)
  await compareAnswers(page, MISMATCH)
  await expectLockedComparison(page)
  const stored = await readStored(page)
  expect(stored, 'Compare saved the locked attempt').not.toBeNull()

  await backToOverview(page)
  await expectBothHeld(page)
  expect(await readStored(page)).toBe(stored)

  // The locked comparison is still there, exactly as it was.
  await reviewLink(page, MISMATCH).click()
  await expectScreen(page, HEADING.comparison(MISMATCH), 'navigated')
  await expectLockedComparison(page)
  expect(await readStored(page)).toBe(stored)
})

test('CB-7 Back before Compare discards the typing, and the next visit starts blank with nothing saved', async ({ page }) => {
  await openMismatchCallback(page)
  await fillAnswers(page, MISMATCH.answers)
  for (const key of ANSWER_KEYS) await expect(field(page, key)).toHaveValue(MISMATCH.answers[key])

  await backToOverview(page)
  await expectBothHeld(page)
  expect(await readStored(page)).toBeNull()

  await openRequest(page, MISMATCH)
  await startCallback(page, MISMATCH)
  for (const key of ANSWER_KEYS) await expect(field(page, key)).toHaveValue('')
  expect(await readStored(page)).toBeNull()
})

test('CR-2 Enter in the last field does not compare, and after Compare nothing is left to edit', async ({ page }) => {
  await openMismatchCallback(page)
  await fillAnswers(page, MISMATCH.answers)

  // Only a deliberate press of Compare may lock: an Enter typed out of habit does nothing.
  await field(page, 'personSpokenTo').press('Enter')
  await expect(page).toHaveURL(AT.callback(MISMATCH))
  await expect(mainHeading(page, HEADING.callback(MISMATCH))).toBeVisible()
  for (const key of ANSWER_KEYS) await expect(field(page, key)).toHaveValue(MISMATCH.answers[key])
  await expect(page.getByTestId('missing-summary')).toHaveCount(0)
  expect(await readStored(page)).toBeNull()

  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page).toHaveURL(AT.comparison(MISMATCH))
  await expectScreen(page, HEADING.comparison(MISMATCH), 'navigated')
  await expectLockedComparison(page)
  await expect(page.getByRole('button', { name: 'Compare', exact: true })).toHaveCount(0)
  expect(await readStored(page)).not.toBeNull()
})

test('CR-2 the call-back address of a compared request always lands on the locked comparison', async ({ page }) => {
  const callAddress = `#/request/${MISMATCH.requestId}/call`
  await reachComparison(page, MISMATCH)
  const stored = await readStored(page)

  // Typed over the comparison's own address: the guard puts the comparison back.
  await goToHash(page, callAddress)
  await expectLockedComparison(page)
  await expect(mainHeading(page, HEADING.comparison(MISMATCH))).toBeVisible()
  await checkScreen(page, { title: screenTitle(HEADING.comparison(MISMATCH)) })

  // Followed from the Overview, as an old bookmark would be.
  await backToOverview(page)
  await goToHash(page, callAddress)
  await expectScreen(page, HEADING.comparison(MISMATCH), 'navigated')
  await expectLockedComparison(page)

  // Loaded fresh in the tab: the guard runs before the first screen is drawn.
  await page.goto('about:blank')
  await page.goto(`/${callAddress}`)
  await expectScreen(page, HEADING.comparison(MISMATCH), 'loaded')
  await expectLockedComparison(page)

  expect(await readStored(page)).toBe(stored)
})

test('CR-2 the browser Back button three times from the comparison reaches the Overview without ever showing an input', async ({ page }) => {
  // History: Overview → request → call-back → comparison, each entry pushed by a click.
  await reachComparison(page, MISMATCH)
  await expectLockedComparison(page)
  const stored = await readStored(page)

  // The call-back and request entries: each guard replaces the entry with the comparison, never the answers.
  for (const press of [1, 2]) {
    await page.goBack()
    await expect(page, `browser Back ${press}`).toHaveURL(AT.comparison(MISMATCH))
    await expect(mainHeading(page, HEADING.comparison(MISMATCH))).toBeVisible()
    await expectLockedComparison(page)
    await checkScreen(page, { title: screenTitle(HEADING.comparison(MISMATCH)) })
  }

  await page.goBack()
  await expect(page, 'browser Back 3').toHaveURL(AT.overview)
  await expectScreen(page, HEADING.overview, 'navigated')
  await expectNothingEditable(page)
  await expectBothHeld(page)
  expect(await readStored(page)).toBe(stored)
})

test('CR-9 an unsaved comparison survives a reload and reopening from the Overview, still locked', async ({ page }) => {
  await reachComparison(page, MISMATCH)
  await expectLockedComparison(page)
  const comparison = table(page, 'Requested and stated details')
  const before = { table: await comparison.innerText(), stored: await readStored(page) }

  await page.reload()
  await expect(page).toHaveURL(AT.comparison(MISMATCH))
  await expectScreen(page, HEADING.comparison(MISMATCH), 'loaded')
  await expectLockedComparison(page)
  await expect(comparison).toHaveText(before.table, { useInnerText: true })
  await expect(page.getByRole('button', { name: 'Save attempt', exact: true })).toBeVisible()

  await backToOverview(page)
  await expectBothHeld(page)
  await reviewLink(page, MISMATCH).click()
  await expectScreen(page, HEADING.comparison(MISMATCH), 'navigated')
  await expectLockedComparison(page)
  await expect(comparison).toHaveText(before.table, { useInnerText: true })
  await expect(page.getByRole('button', { name: 'Save attempt', exact: true })).toBeVisible()

  expect(await readStored(page)).toBe(before.stored)
})

test('OS-4 a request with an unsaved comparison opens on it, with no way to start another attempt', async ({ page }) => {
  await reachComparison(page, MISMATCH)
  await backToOverview(page)

  const expectNoNewAttempt = async () => {
    await expectLockedComparison(page) // the guard for the absence checks below
    for (const name of NEW_ATTEMPT_CONTROLS) await expect(control(page, name), `no "${name}" control`).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save attempt', exact: true })).toBeVisible()
  }

  await reviewLink(page, MISMATCH).click()
  await expect(page).toHaveURL(AT.comparison(MISMATCH))
  await expectScreen(page, HEADING.comparison(MISMATCH), 'navigated')
  await expectNoNewAttempt()

  // The request's own address leads to the same place.
  await backToOverview(page)
  await goToHash(page, `#/request/${MISMATCH.requestId}`)
  await expectScreen(page, HEADING.comparison(MISMATCH), 'navigated')
  await expectNoNewAttempt()
})
