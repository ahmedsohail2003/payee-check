import { test as base, expect, type Page } from '@playwright/test'
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

// The app-wide rules every screen keeps. Call it after each screen change, once the new heading is visible.
export async function checkScreen(page: Page): Promise<void> {
  // Guard: a blank or crashed page would pass every absence check below.
  await expect(page.locator('main h1'), 'each screen has exactly one main heading').toHaveCount(1)

  // No tel:, mailto: or external link: the app never starts a call and never leaves the laptop.
  const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  for (const href of hrefs) expect(href, 'every link is an in-app route').toMatch(/^#\//)

  const text = (await page.locator('body').textContent()) ?? ''
  for (const broken of ['NaN', 'undefined', '[object Object]']) {
    expect(text, `no "${broken}" on screen`).not.toContain(broken)
  }
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
