import { test as base, expect, type Locator, type Page, type Request } from '@playwright/test'
import { SAMPLES } from '../../src/data/samples'
import { lockAndCompare, saveAttempt as saveAttemptKernel } from '../../src/kernel/attempts'
import type { AnswerKey, Answers, Ctx, PersistedState } from '../../src/kernel/types'
import { EMPTY_STATE } from '../../src/storage/store'

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
      // A request reported by both its page and the context is counted once.
      const counted = new WeakSet<Request>()
      const onRequest = (request: Request) => {
        if (counted.has(request)) return
        counted.add(request)
        seen(request.url())
      }
      const attach = (target: Page) => {
        target.on('request', onRequest)
        target.on('websocket', (socket) => seen(socket.url()))
        target.on('console', (message) => {
          if (message.type() === 'error') watch.errors.push(`console.error: ${message.text()}`)
        })
        target.on('pageerror', (error) => watch.errors.push(`pageerror: ${error.message}`))
      }
      attach(page)
      page.context().on('page', attach) // a popup would be a way out of the laptop too
      // The context also reports requests no page makes, such as a service worker's.
      page.context().on('request', onRequest)
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

// The Screen contract's filled navy "next action". The spec names this class for the every-screen check, and no
// role or name tells a primary button from a secondary one.
export const PRIMARY_BUTTON = '.btn-primary'

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

  // One obvious next action (LF-2): at most one filled navy button shows at a time. A closed panel's or
  // dialog's buttons don't count, because nobody can see them.
  expect(await page.locator(PRIMARY_BUTTON).visible().count(), 'at most one visible primary button').toBeLessThanOrEqual(1)

  // Status = colour + icon + words (LF-1): every status badge holds an icon and words, so colour never stands
  // alone.
  for (const badge of await page.getByTestId('status').all()) {
    await expect(badge.locator('svg'), 'every status has an icon').not.toHaveCount(0)
    await expect(badge, 'every status has words').toHaveText(/\S/)
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

// From the Comparison. Every save happens at FIXED_TIME, so a test's first record is FIRST_RECORD_ID and a
// later one is told apart only by its position (SECOND_RECORD_ID).
export async function saveAttempt(page: Page, recordId = FIRST_RECORD_ID): Promise<void> {
  await page.getByRole('button', { name: 'Save attempt', exact: true }).click()
  await expect(page).toHaveURL(AT.record(recordId))
  await expectScreen(page, HEADING.record(recordId), 'navigated')
}

// The Back on the Request detail, Call-back step or Comparison, or the record's "Back to overview".
export async function backToOverview(page: Page): Promise<void> {
  await control(page, BACK).click()
  await expect(page).toHaveURL(AT.overview)
  await expectScreen(page, HEADING.overview, 'navigated')
}

// Couldn't verify, retries and the attempt history (slice 3).

export const SECOND_RECORD_ID = 'PC-20261025-154200-002'

export const PAYMENT_STATUS = {
  needsVerification: 'On hold—verification needed',
  mismatch: 'On hold—details do not match',
  incomplete: 'On hold—verification incomplete',
  readyToPay: 'Ready to pay',
} as const

export const CALL_SCRIPT =
  'We received a request to change your payment details. Please state the account-holder name and the institution, transit and account numbers we should use.'
export const RECORD_HONESTY = "This record shows what was entered and when. It doesn't prove a call took place."

// What Harbourline's email says, none of which may ever reach a Call-back step (CB-4, RT-2).
export const MISMATCH_EMAIL = {
  from: 'accounts@harbourline-pay.example',
  subject: 'Updated banking details for Harbourline Lumber Ltd.',
  bodyLines: [
    'Harbourline Lumber Ltd. has moved its banking. Effective immediately, please send all payments, including PR-2026-1041, to our new account:',
    'Dana Whitlow',
    'Accounts Receivable, Harbourline Lumber Ltd.',
  ],
  contacts: [
    'accounts@harbourline-pay.example',
    '519-555-0187',
    'ap@harbourline-pay.example',
    'https://harbourline-pay.example/confirm',
  ],
  requested: { institution: '952', transit: '60415', account: '73419020' },
} as const

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function emailPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Email', exact: true })
}

// Text (hidden text included), every attribute outside the icons' path data, and every field's value: all the
// ways a screen could carry a value to the person using it.
export async function everythingInBody(page: Page): Promise<string> {
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

// The saved value parsed, so a test can count what one action wrote.
export async function readState(page: Page): Promise<PersistedState | null> {
  const raw = await readStored(page)
  return raw === null ? null : (JSON.parse(raw) as PersistedState)
}

export async function storedCounts(page: Page): Promise<{ attempts: number; records: number } | null> {
  const state = await readState(page)
  return state === null ? null : { attempts: state.attempts.length, records: state.records.length }
}

// Every answer field the person types into on the Call-back step reads empty.
export async function expectBlankAnswers(page: Page): Promise<void> {
  for (const label of Object.values(ANSWER_LABELS)) {
    await expect(page.getByLabel(label, { exact: true }), `"${label}" starts blank`).toHaveValue('')
  }
}

// The Call-back step's disclosure, and the panel it opens: a group named by its legend, holding the reason and
// its own Save attempt, so that button is never confused with the Comparison's.
export function couldntVerifyButton(page: Page): Locator {
  return page.getByRole('button', { name: "Couldn't verify", exact: true })
}

export function couldntVerifyPanel(page: Page): Locator {
  return page.getByRole('group', { name: "Couldn't verify", exact: true })
}

export function reasonField(page: Page): Locator {
  return couldntVerifyPanel(page).getByRole('textbox', { name: 'Reason (optional)', exact: true })
}

export function panelSaveButton(page: Page): Locator {
  return couldntVerifyPanel(page).getByRole('button', { name: 'Save attempt', exact: true })
}

export async function openCouldntVerify(page: Page): Promise<void> {
  const disclosure = couldntVerifyButton(page)
  await disclosure.click()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await expect(couldntVerifyPanel(page)).toBeVisible()
}

// From the Call-back step: saves a couldn't-verify attempt with this reason ('' leaves it blank).
export async function saveCouldntVerify(page: Page, reason: string, recordId = FIRST_RECORD_ID): Promise<void> {
  await openCouldntVerify(page)
  if (reason !== '') await reasonField(page).fill(reason)
  await panelSaveButton(page).click()
  await expect(page).toHaveURL(AT.record(recordId))
  await expectScreen(page, HEADING.record(recordId), 'navigated')
}

// From a record.
export async function backToRequest(page: Page, sample: Sample): Promise<void> {
  await control(page, 'Back to request').click()
  await expect(page).toHaveURL(AT.request(sample))
  await expectScreen(page, HEADING.request(sample), 'navigated')
}

// From an unresolved Request detail that already lists an attempt.
export async function retryFromDetail(page: Page, sample: Sample): Promise<void> {
  await control(page, 'Try verification again').click()
  await expect(page).toHaveURL(AT.callback(sample))
  await expectScreen(page, HEADING.callback(sample), 'navigated')
}

// From a saved mismatch or couldn't-verify record.
export async function retryFromRecord(page: Page, sample: Sample): Promise<void> {
  await control(page, 'Start a new call-back attempt').click()
  await expect(page).toHaveURL(AT.callback(sample))
  await expectScreen(page, HEADING.callback(sample), 'navigated')
}

// The Request detail's saved attempts. A row is found by its record link, whose name carries the record ID.
export function attemptsTable(page: Page): Locator {
  return table(page, 'Previous attempts')
}

// Body rows only: the header row has column headers and no cells.
export function attemptRows(page: Page): Locator {
  return attemptsTable(page).getByRole('row').filter({ has: page.getByRole('cell') })
}

export function attemptRow(page: Page, recordId: string): Locator {
  return attemptsTable(page).getByRole('row').filter({ has: page.getByRole('link', { name: recordId }) })
}

export function recordLink(page: Page, recordId: string): Locator {
  return attemptRow(page, recordId).getByRole('link', { name: recordId })
}

// From the Request detail's attempt list.
export async function openAttemptRecord(page: Page, recordId: string): Promise<void> {
  await recordLink(page, recordId).click()
  await expect(page).toHaveURL(AT.record(recordId))
  await expectScreen(page, HEADING.record(recordId), 'navigated')
}

// A record's value for one of its labelled pairs ("Outcome", "Person spoken to", "Reason or note"): the
// <dd> that follows that exact <dt>.
export function recordValue(page: Page, term: string): Locator {
  return page
    .getByRole('main')
    .locator('dt')
    .filter({ hasText: new RegExp(`^${escapeRegExp(term)}$`) })
    .locator('xpath=following-sibling::dd[1]')
}

// What a record prints from its own snapshot. The "Saved" note after a save is left out: it belongs to the
// moment of saving, not to the record.
export type RecordText = { fields: string; details: string; reason: string }

export async function recordText(page: Page): Promise<RecordText> {
  return {
    fields: await page.getByTestId('record-fields').innerText(),
    details: await table(page, 'Requested and stated details').innerText(),
    reason: await recordValue(page, 'Reason or note').innerText(),
  }
}

export async function expectRecordText(page: Page, expected: RecordText): Promise<void> {
  await expect(page.getByTestId('record-fields')).toHaveText(expected.fields, { useInnerText: true })
  await expect(table(page, 'Requested and stated details')).toHaveText(expected.details, { useInnerText: true })
  await expect(recordValue(page, 'Reason or note')).toHaveText(expected.reason, { useInnerText: true })
}

// Saved data you can trust (slice 4): seeded mid-journey states, failure injection and Reset demo.

// Seeds are built by the kernel itself at FIXED_TIME in the zone playwright.config.ts pins, so they always pass
// the schema and checkInvariants, and a seeded record reads exactly like one saved through the UI.
const SEED_CTX: Ctx = { samples: SAMPLES, now: FIXED_TIME, timeZone: 'America/Toronto' }

function comparedSeed(sample: Sample): { state: PersistedState; attemptId: string } {
  const result = lockAndCompare(EMPTY_STATE, sample.requestId, { ...sample.answers }, SEED_CTX)
  if (!result.ok) throw new Error(`seed: the kernel refused Compare (${result.reason})`)
  return { state: result.state, attemptId: result.attemptId }
}

// The payee-check:v1 value of one unsaved comparison of the sample's answers (A-001, status "compared").
export function seedPendingComparison(sample: Sample = MISMATCH): string {
  return JSON.stringify(comparedSeed(sample).state)
}

// The payee-check:v1 value of the mismatch request's saved attempt and its record, FIRST_RECORD_ID.
export function seedSavedMismatch(): string {
  const compared = comparedSeed(MISMATCH)
  const result = saveAttemptKernel(compared.state, compared.attemptId, SEED_CTX)
  if (!result.ok) throw new Error(`seed: the kernel refused Save attempt (${result.reason})`)
  return JSON.stringify(result.state)
}

// The dev server's origin (playwright.config.ts baseURL): storageState is set per origin.
export const APP_ORIGIN = 'http://localhost:5180'

export type StoredItem = { name: string; value: string }
export type SeededStorageState = { cookies: []; origins: { origin: string; localStorage: StoredItem[] }[] }

// For test.use({ storageState }): the context starts with `value` under payee-check:v1, plus any other keys on
// the same origin. It's applied once when the context is created, so a reload keeps what the app saved since.
export function storageStateWith(value: string, extra: StoredItem[] = []): SeededStorageState {
  return { cookies: [], origins: [{ origin: APP_ORIGIN, localStorage: [{ name: STORAGE_KEY, value }, ...extra] }] }
}

// Any key on the app's origin, such as another site's data that Reset must leave alone.
export async function readLocal(page: Page, key: string): Promise<string | null> {
  return page.evaluate((name) => window.localStorage.getItem(name), key)
}

type FailWindow = Window & { __failSaves?: boolean }

// Failure injection uses addInitScript, so the patch is in place before the app's first line and after every
// reload; each new document starts the switch at `failing`. While window.__failSaves is true, setItem and
// removeItem throw as a full or locked-down store would. getItem is untouched, so readStored still sees what's
// there. The store catches these, so nothing reaches console.error.
export async function installFailureSwitch(page: Page, { failing = false }: { failing?: boolean } = {}): Promise<void> {
  await page.addInitScript((startFailing) => {
    const w = window as FailWindow
    w.__failSaves = startFailing
    const { setItem, removeItem } = Storage.prototype
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (w.__failSaves === true) throw new DOMException('test: saving is switched off', 'QuotaExceededError')
      setItem.call(this, key, value)
    }
    Storage.prototype.removeItem = function (this: Storage, key: string) {
      if (w.__failSaves === true) throw new DOMException('test: saving is switched off', 'SecurityError')
      removeItem.call(this, key)
    }
  }, failing)
}

// Flips the switch for the current document, so a test can fail one action and then prove Try again recovers.
export async function setFailSaves(page: Page, on: boolean): Promise<void> {
  await page.evaluate((value) => {
    const w = window as FailWindow
    w.__failSaves = value
  }, on)
}

// What Chrome does when site data is blocked: even reading window.localStorage throws. readStored can't be used
// after this.
export async function blockStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('test: site data is blocked', 'SecurityError')
      },
    })
  })
}

// First use, and again after a confirmed Reset: the two flagged rows held for verification, the other three
// scheduled.
export async function expectStartingStatuses(page: Page): Promise<void> {
  const badges = page.getByTestId('status')
  await expect(badges).toHaveCount(5)
  await expect(badges.filter({ hasText: PAYMENT_STATUS.needsVerification })).toHaveCount(2)
  await expect(paymentStatus(page, MISMATCH.supplier)).toHaveText(PAYMENT_STATUS.needsVerification)
  await expect(paymentStatus(page, LEGIT.supplier)).toHaveText(PAYMENT_STATUS.needsVerification)
  await expect(badges.filter({ hasText: 'Scheduled' })).toHaveCount(3)
}

// Reset demo, on the Overview and on the Recovery notice, and the native <dialog> it opens.
export function resetDemoButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Reset demo', exact: true })
}

export function resetDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Reset demo?', exact: true })
}

export function resetDialogButton(page: Page, name: 'Cancel' | 'Yes, reset'): Locator {
  return resetDialog(page).getByRole('button', { name, exact: true })
}

// Opens the dialog and checks it starts on Cancel, so a stray Enter cancels instead of resetting.
export async function openResetDialog(page: Page): Promise<void> {
  await resetDemoButton(page).click()
  await expect(resetDialog(page)).toBeVisible()
  await expect(resetDialogButton(page, 'Cancel'), 'Cancel is focused when the dialog opens').toBeFocused()
}

// Presses "Yes, reset". The dialog closes either way: a modal left open would hide the error banner behind it.
export async function confirmReset(page: Page): Promise<void> {
  await resetDialogButton(page, 'Yes, reset').click()
  await expect(resetDialog(page)).toBeHidden()
}

// The register look, the printed record and keyboard use (slice 5).

// Keyboard only (LF-2): presses Tab (or Shift+Tab) until `target` has focus, as a person tabbing through the
// screen would, and fails after `max` presses. It never clicks, so it also proves the control is reachable.
export async function tabTo(page: Page, target: Locator, max = 40, key: 'Tab' | 'Shift+Tab' = 'Tab'): Promise<void> {
  // Guard: the control is on this screen, so a wrong name fails here instead of after `max` presses.
  await expect(target, 'the control to reach by keyboard is on the screen').toHaveCount(1)
  const focused = () => target.evaluate((element) => element === document.activeElement)
  for (let presses = 0; presses < max; presses += 1) {
    if (await focused()) return
    await page.keyboard.press(key)
  }
  expect(await focused(), `focus reaches the control within ${max} presses of ${key}`).toBe(true)
}

// Proof the proofs hold (slice 6): every record field (VR-2) and the reload check (RT-4).

// The PRD's record fields (prd.md > Verification records, "Each record shows"), in the PRD's order, each as the
// record view shows it: a labelled pair (a term and the value after it), the details table (by its caption) or
// the fictional-data label itself. Written out rather than imported, so a renamed or dropped field fails VR-2.
export type RecordField = {
  prd: string // the PRD's wording
  shownAs: 'pair' | 'table' | 'label'
  label: string // the term, the table's caption, or the label's own text
}

export const RECORD_FIELDS: readonly RecordField[] = [
  { prd: 'a unique record ID', shownAs: 'pair', label: 'Record ID' },
  { prd: 'the date and time with timezone', shownAs: 'pair', label: 'Saved' },
  { prd: 'the supplier name', shownAs: 'pair', label: 'Supplier' },
  { prd: 'the payment reference', shownAs: 'pair', label: 'Payment reference' },
  { prd: 'the amount', shownAs: 'pair', label: 'Amount (CAD)' },
  { prd: 'the due date', shownAs: 'pair', label: 'Due date' },
  { prd: 'which sample email was checked', shownAs: 'pair', label: 'Email checked' },
  { prd: 'the trusted number used', shownAs: 'pair', label: 'Trusted number used' },
  { prd: 'the person spoken to', shownAs: 'pair', label: 'Person spoken to' },
  {
    prd: 'the requested and stated details with a result for each field',
    shownAs: 'table',
    label: 'Requested and stated details',
  },
  { prd: 'the overall outcome', shownAs: 'pair', label: 'Outcome' },
  { prd: 'any reason or note', shownAs: 'pair', label: 'Reason or note' },
  { prd: 'the resulting simulated payment status', shownAs: 'pair', label: 'Resulting payment status' },
  { prd: 'the label', shownAs: 'label', label: 'Fictional sample data—no real call or payment' },
]

// The labelled pairs only, so a journey's VR-2 test can prove it gives an exact value for each one.
export const RECORD_PAIR_LABELS: readonly string[] = RECORD_FIELDS.filter((field) => field.shownAs === 'pair').map(
  (field) => field.label,
)

export const RECORD_DETAIL_COLUMNS = ['Detail', 'Requested (email)', 'Stated (supplier)', 'Result'] as const
export const RECORD_DETAIL_ROWS = ['Payee name', 'Institution', 'Transit', 'Account'] as const

// Every result a record can print for a field. Regex text isn't whitespace-normalised, hence the \s*.
const RECORD_RESULT =
  /^\s*(?:Matches|Does not match|Does not match \(differs before the last four digits\)|Not checked)\s*$/

// A record's term, found by its exact words. The value after it is recordValue(page, term).
export function recordTerm(page: Page, term: string): Locator {
  return page
    .getByRole('main')
    .getByRole('term')
    .filter({ hasText: new RegExp(`^${escapeRegExp(term)}$`) })
}

// VR-2 on whatever record is open: every RECORD_FIELDS item is visible, each pair with a value, and the details
// table holds a requested value, a stated value and a result for each of the four fields.
export async function expectRecordFields(page: Page): Promise<void> {
  for (const field of RECORD_FIELDS) {
    const what = `the record shows ${field.prd} ("${field.label}")`
    if (field.shownAs === 'pair') {
      await expect(recordTerm(page, field.label), what).toBeVisible()
      await expect(recordValue(page, field.label), `${what} with a value`).toBeVisible()
      await expect(recordValue(page, field.label), `${what} with a value`).toHaveText(/\S/)
    } else if (field.shownAs === 'table') {
      const details = table(page, field.label)
      await expect(details, what).toBeVisible()
      await expect(details.getByRole('columnheader'), 'its columns').toHaveText(RECORD_DETAIL_COLUMNS)
      await expect(details.getByRole('rowheader'), 'one row per field').toHaveText(RECORD_DETAIL_ROWS)
      for (const detail of RECORD_DETAIL_ROWS) {
        await expect(rowOf(details, detail).getByRole('cell'), `${detail}: requested, stated and a result`).toHaveText([
          /\S/,
          /\S/,
          RECORD_RESULT,
        ])
      }
    } else {
      await expect(page.getByRole('main').getByText(field.label, { exact: true }), what).toBeVisible()
    }
  }
}

// RT-4: reloads the screen and expects the same address, heading, state, visible text and saved value. Not for
// a record just saved, whose "Saved" note belongs to the moment of saving: compare its recordText instead.
export async function expectSameAfterReload(
  page: Page,
  at: RegExp,
  heading: string,
  expectState: (page: Page) => Promise<void>,
): Promise<void> {
  const main = page.getByRole('main')
  await expectState(page) // the state is on screen before its text is captured
  const before = { text: await main.innerText(), stored: await readStored(page) }
  expect(before.stored, 'there is a saved state to keep').not.toBeNull()

  await page.reload()
  await expect(page).toHaveURL(at)
  await expectScreen(page, heading, 'loaded')
  await expectState(page)
  await expect(main, 'the same text after the reload').toHaveText(before.text, { useInnerText: true })
  expect(await readStored(page), 'the reload saved nothing').toBe(before.stored)
}
