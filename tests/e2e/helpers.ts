import { test as base, expect, type Locator, type Page } from '@playwright/test'
import type { AnswerKey, Answers } from '../../src/kernel/types'

// Shared by every E2E spec: the automatic network and console watch, the fixed clock, the print counter and
// the every-screen checks. Specs import `test` and `expect` from here, never from @playwright/test.

export { expect }

export const STORAGE_KEY = 'payee-check:v1'

// Records print a zone, so any test that saves fixes the clock (the zone is pinned in playwright.config.ts).
// The first record saved at this instant is PC-20261025-154200-001, saved "Oct 25, 2026, 3:42 PM EDT".
export const FIXED_TIME = new Date('2026-10-25T19:42:00Z')
export const FIRST_RECORD_ID = 'PC-20261025-154200-001'
export const FIXED_SAVED_AT = 'Oct 25, 2026, 3:42 PM EDT'

// The page may reach only the local dev server (its files and its reload websocket) and inline data.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const INLINE_SCHEMES = new Set(['data:', 'blob:'])

export function isLocalUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return INLINE_SCHEMES.has(parsed.protocol) || LOCAL_HOSTS.has(parsed.hostname)
}

export type PageWatch = {
  requests: string[] // every request and websocket URL a page in this test opened
  offSite: string[] // the ones that left this laptop
  errors: string[] // console.error messages and uncaught page errors
}

export const test = base.extend<{ pageWatch: PageWatch }>({
  // Automatic, so no spec can forget it. React reports missing keys and invalid props through console.error,
  // and handled failures log at warn, so any error here is a real fault.
  pageWatch: [
    async ({ page }, use) => {
      const watch: PageWatch = { requests: [], offSite: [], errors: [] }
      const seen = (url: string) => {
        watch.requests.push(url)
        if (!isLocalUrl(url)) watch.offSite.push(url)
      }
      const attach = (target: Page) => {
        target.on('request', (request) => seen(request.url()))
        target.on('websocket', (socket) => seen(socket.url()))
        target.on('console', (message) => {
          if (message.type() === 'error') watch.errors.push(`console.error: ${message.text()}`)
        })
        target.on('pageerror', (error) => watch.errors.push(`pageerror: ${error.message}`))
      }
      attach(page)
      page.context().on('page', attach) // a popup would be a way out of the laptop too
      await use(watch)
      expect(watch.offSite, 'requests or websockets beyond localhost, data: and blob:').toEqual([])
      expect(watch.errors, 'console errors and uncaught page errors').toEqual([])
    },
    { auto: true },
  ],
})

type TestWindow = Window & { __printCalls?: number }

// Fixes the clock and stubs window.print before the app's first line runs, then opens `hash`. Each test has
// its own browser context, so localStorage starts empty. Seeded states use test.use({ storageState }), never
// addInitScript, which would re-run on every reload and overwrite what the app saved.
export async function startAt(page: Page, hash = '#/'): Promise<void> {
  await page.clock.setFixedTime(FIXED_TIME)
  await page.addInitScript(() => {
    const w = window as TestWindow
    w.__printCalls = 0
    w.print = () => {
      w.__printCalls = (w.__printCalls ?? 0) + 1
    }
  })
  await page.goto(`/${hash}`)
}

// Calls to window.print since this document loaded (a reload starts the count again).
export async function printCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as TestWindow).__printCalls ?? 0)
}

// What a screen change should also have done. `title` is the Screen contract's document.title; `focused` is
// for in-app navigation (a click, browser Back, a hash change), which moves focus to the new heading. A first
// load or a reload only sets the title, because a screen reader already starts at the top.
export type ScreenExpectation = { title?: string; focused?: boolean }

// The app-wide rules every screen keeps. Call it after each screen change, once the new heading is visible.
export async function checkScreen(page: Page, expected: ScreenExpectation = {}): Promise<void> {
  // Guard: a blank or crashed page would pass every absence check below.
  await expect(page.locator('main h1'), 'each screen has exactly one main heading').toHaveCount(1)

  // No tel:, mailto: or external link: the app never starts a call and never leaves the laptop.
  const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  for (const href of hrefs) expect(href, 'every link is an in-app route').toMatch(/^#\//)

  const text = (await page.locator('body').textContent()) ?? ''
  for (const broken of ['NaN', 'undefined', '[object Object]']) {
    expect(text, `no "${broken}" on screen`).not.toContain(broken)
  }

  if (expected.title !== undefined) {
    await expect(page, 'the page title follows the Screen contract').toHaveTitle(expected.title)
  }
  if (expected.focused === true) {
    await expect(page.locator('main h1'), 'an in-app navigation moves focus to the heading').toBeFocused()
  }
}

// The Screen contract: the title is the heading + " — Payee Check", except the Overview's.
export const OVERVIEW_HEADING = 'Payee Check'

export function screenTitle(heading: string): string {
  return heading === OVERVIEW_HEADING ? 'Overview — Payee Check' : `${heading} — Payee Check`
}

export function mainHeading(page: Page, name: string): Locator {
  return page.getByRole('main').getByRole('heading', { level: 1, name, exact: true })
}

// Waits for the screen's heading (the guard), then runs the every-screen checks with its title. 'navigated'
// also expects focus on the heading; 'loaded' (a first load or a reload) does not.
export async function expectScreen(page: Page, heading: string, how: 'navigated' | 'loaded'): Promise<void> {
  await expect(mainHeading(page, heading)).toBeVisible()
  await checkScreen(page, { title: screenTitle(heading), focused: how === 'navigated' })
}

// A navigation control may be a link or a button; its exact name is what the person relies on.
export function control(page: Page, name: string | RegExp): Locator {
  return page.getByRole('link', { name, exact: true }).or(page.getByRole('button', { name, exact: true }))
}

// The Back on the Request detail, Call-back step and Comparison: visibly "Back", and it may carry a visually
// hidden " to overview".
export const BACK = /^Back(?: to overview)?$/

export function table(page: Page, caption: string): Locator {
  return page.getByRole('table', { name: caption, exact: true })
}

// A table row found by its row heading (a detail such as "Account", or a supplier name).
export function rowOf(tableLocator: Locator, rowHeading: string): Locator {
  return tableLocator
    .getByRole('row')
    .filter({ has: tableLocator.page().getByRole('rowheader', { name: rowHeading, exact: true }) })
}

export function paymentRow(page: Page, supplier: string): Locator {
  return rowOf(table(page, "This week's payment run"), supplier)
}

export function paymentStatus(page: Page, supplier: string): Locator {
  return paymentRow(page, supplier).getByTestId('status')
}

// At least one status badge shows these words, and each one that does shows exactly them (its icon adds no
// text). Other badges, such as a saved attempt's outcome, may share the screen.
export async function expectStatus(page: Page, words: string): Promise<void> {
  const badges = page.getByTestId('status').filter({ hasText: words })
  await expect(badges).not.toHaveCount(0)
  for (const badge of await badges.all()) await expect(badge).toHaveText(words)
}

// "Ready to pay" is simulated, so every place that says it says so right beside it: the note shares the
// status's own container (its table cell, status line or record field).
export const SIMULATED = 'Simulated—no money moves.'

export async function expectSimulatedBesideReadyToPay(page: Page): Promise<void> {
  const readyToPay = page.getByText('Ready to pay', { exact: true })
  await expect(readyToPay, 'the screen shows "Ready to pay"').not.toHaveCount(0)
  for (const shown of await readyToPay.all()) {
    await expect(shown.locator('xpath=..'), 'beside "Ready to pay"').toContainText(SIMULATED)
  }
}

// Anything a person could type into. Callers first assert something that must be on the same screen.
export const EDITABLE = 'input, textarea, select, [contenteditable]'

export async function expectNothingEditable(page: Page): Promise<void> {
  await expect(page.locator(EDITABLE), 'no input, textarea, select or contenteditable').toHaveCount(0)
}

// Changes only the hash, as a typed address or an old bookmark would, so the router's guard decides the screen.
// Resolves once hashchange has fired: the app's listener was added first, so its guard has run by then and a
// URL check can't pass on the address from before. `hash` must differ from the current one.
export async function goToHash(page: Page, hash: string): Promise<void> {
  await page.evaluate(
    (target) =>
      new Promise<void>((resolve) => {
        window.addEventListener('hashchange', () => resolve(), { once: true })
        window.location.hash = target
      }),
    hash,
  )
}

// The PRD's exact field labels, in form order, written out rather than imported so a typo in copy.ts fails a test.
export const ANSWER_LABELS: Readonly<Record<AnswerKey, string>> = {
  payeeName: 'Account-holder/payee name',
  institution: 'Institution number',
  transit: 'Transit/branch number',
  account: 'Full account number',
  personSpokenTo: 'Name of person spoken to',
}

// What the fictional supplier says on the call (the README's "Try it" lines). These never appear in src/.
export const MISMATCH_ANSWERS: Readonly<Answers> = {
  payeeName: 'Harbourline Lumber Ltd.',
  institution: '952',
  transit: '60415',
  account: '73414471',
  personSpokenTo: 'Sam Okafor',
}
export const LEGIT_ANSWERS: Readonly<Answers> = {
  payeeName: 'Cedarline Electrical Supply Inc.',
  institution: '958',
  transit: '40388',
  account: '3307126',
  personSpokenTo: 'Priya Natarajan',
}

// Types each given answer into the field with that exact label; a key left out leaves its field untouched.
export async function fillAnswers(page: Page, answers: Partial<Answers>): Promise<void> {
  for (const key of Object.keys(ANSWER_LABELS) as AnswerKey[]) {
    const value = answers[key]
    if (value !== undefined) await page.getByLabel(ANSWER_LABELS[key], { exact: true }).fill(value)
  }
}

// The raw saved value, so a test can prove an action wrote nothing (null) or left it byte-identical.
export async function readStored(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
}

// The two sample requests, with what each supplier says on the call.
export type Sample = { requestId: string; supplier: string; answers: Readonly<Answers> }
export const MISMATCH: Sample = {
  requestId: 'req-mismatch',
  supplier: 'Harbourline Lumber Ltd.',
  answers: MISMATCH_ANSWERS,
}
export const LEGIT: Sample = {
  requestId: 'req-legit',
  supplier: 'Cedarline Electrical Supply Inc.',
  answers: LEGIT_ANSWERS,
}

export const HEADING = {
  overview: OVERVIEW_HEADING,
  request: (sample: Sample) => `Bank-change request: ${sample.supplier}`,
  callback: (sample: Sample) => `Call-back: ${sample.supplier}`,
  comparison: (sample: Sample) => `Comparison: ${sample.supplier}`,
  record: (recordId: string) => `Verification record ${recordId}`,
} as const

// Each address as the router writes it, anchored at the end so /request/x never passes for /request/x/call.
export const AT = {
  overview: /#\/$/,
  request: (sample: Sample) => new RegExp(`#/request/${sample.requestId}$`),
  callback: (sample: Sample) => new RegExp(`#/request/${sample.requestId}/call$`),
  comparison: (sample: Sample) => new RegExp(`#/request/${sample.requestId}/compare$`),
  record: (recordId: string) => new RegExp(`#/record/${recordId}$`),
} as const

export function reviewLink(page: Page, sample: Sample): Locator {
  return page.getByRole('link', { name: `Review request: ${sample.supplier}`, exact: true })
}

// Journey steps through the UI. Each one checks where it lands, so a test reads as the person's path.

export async function openOverview(page: Page): Promise<void> {
  await startAt(page)
  await expect(page).toHaveURL(AT.overview)
  await expectScreen(page, HEADING.overview, 'loaded')
}

// From the Overview, for a request with no unsaved comparison.
export async function openRequest(page: Page, sample: Sample): Promise<void> {
  await reviewLink(page, sample).click()
  await expect(page).toHaveURL(AT.request(sample))
  await expectScreen(page, HEADING.request(sample), 'navigated')
}

// From the Request detail.
export async function startCallback(page: Page, sample: Sample): Promise<void> {
  await control(page, 'Start call-back').click()
  await expect(page).toHaveURL(AT.callback(sample))
  await expectScreen(page, HEADING.callback(sample), 'navigated')
}

// From the Call-back step: types the sample's answers and presses Compare.
export async function compareAnswers(page: Page, sample: Sample): Promise<void> {
  await fillAnswers(page, sample.answers)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page).toHaveURL(AT.comparison(sample))
  await expectScreen(page, HEADING.comparison(sample), 'navigated')
}

// From an empty store to the sample's unsaved comparison, all through the UI.
export async function reachComparison(page: Page, sample: Sample): Promise<void> {
  await openOverview(page)
  await openRequest(page, sample)
  await startCallback(page, sample)
  await compareAnswers(page, sample)
}

// From the Comparison; the first record saved under the fixed clock.
export async function saveAttempt(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save attempt', exact: true }).click()
  await expect(page).toHaveURL(AT.record(FIRST_RECORD_ID))
  await expectScreen(page, HEADING.record(FIRST_RECORD_ID), 'navigated')
}

// The Back on the Request detail, Call-back step or Comparison, or the record's "Back to overview".
export async function backToOverview(page: Page): Promise<void> {
  await control(page, BACK).click()
  await expect(page).toHaveURL(AT.overview)
  await expectScreen(page, HEADING.overview, 'navigated')
}
