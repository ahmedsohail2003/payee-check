import type { Page, Request } from '@playwright/test'
import {
  APP_ORIGIN,
  LEGIT,
  MISMATCH,
  backToOverview,
  expect,
  reachComparison,
  recordValue,
  saveAttempt,
  test,
  type Sample,
} from './helpers'

// SB-4 made explicit: each Success journey, from the Overview through Compare and Save to its record and back,
// while this spec writes down every request and websocket the page opens. The automatic fixture in helpers.ts
// already fails any spec that reaches beyond the laptop; this one adds the guard that the watch was live (the
// app itself was seen loading from the dev server), so an empty list can't pass for "nothing left the laptop".

// Written out here rather than reusing the fixture's isLocalUrl, so this proof doesn't lean on the code it checks.
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]']
const INLINE_SCHEMES = ['data:', 'blob:']

function staysOnTheLaptop(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return INLINE_SCHEMES.includes(parsed.protocol) || LOCAL_HOSTNAMES.includes(parsed.hostname)
}

type Journey = { sample: Sample; overall: string; outcome: string }

const MISMATCH_JOURNEY: Journey = {
  sample: MISMATCH,
  overall: 'Full account number does not match: supplier said …4471, email requested …9020.',
  outcome: 'Details do not match',
}
const LEGIT_JOURNEY: Journey = { sample: LEGIT, overall: 'Details match.', outcome: 'Verified' }

// Every request and websocket URL the page, any page it opens, or anything else in its browser context (such as
// a service worker) asks for, in order. A request reported by both its page and the context is listed once.
function watchNetwork(page: Page): string[] {
  const seen: string[] = []
  const listed = new WeakSet<Request>()
  const onRequest = (request: Request) => {
    if (listed.has(request)) return
    listed.add(request)
    seen.push(request.url())
  }
  const watch = (target: Page) => {
    target.on('request', onRequest)
    target.on('websocket', (socket) => seen.push(socket.url()))
  }
  watch(page)
  page.context().on('page', watch)
  page.context().on('request', onRequest)
  return seen
}

async function expectJourneyStaysLocal(page: Page, journey: Journey): Promise<void> {
  // The check itself can fail: it turns away the email's own link, a look-alike host and an outside websocket.
  expect(staysOnTheLaptop(`${APP_ORIGIN}/`), 'the dev server is local').toBe(true)
  const outside = ['https://harbourline-pay.example/confirm', 'http://localhost.example/', 'wss://outside.example/socket']
  for (const url of outside) expect(staysOnTheLaptop(url), `${url} is not local`).toBe(false)

  const seen = watchNetwork(page) // before the first goto, so the app's own first request is caught

  // Demo answers typed in, Compare, Save, then back to the Overview with the saved status.
  await reachComparison(page, journey.sample)
  await expect(page.getByTestId('overall')).toHaveText(journey.overall)
  await saveAttempt(page)
  await expect(recordValue(page, 'Outcome')).toHaveText(journey.outcome)
  await backToOverview(page)

  // Guard: the watch saw the app load from localhost:5180, so the check below has something to judge.
  const fromDevServer = seen.filter((url) => url.startsWith(`${APP_ORIGIN}/`))
  expect(fromDevServer.length, 'requests to the dev server at localhost:5180').toBeGreaterThanOrEqual(1)

  const offSite = seen.filter((url) => !staysOnTheLaptop(url))
  expect(offSite, 'requests or websockets beyond localhost, 127.0.0.1, [::1], data: and blob:').toEqual([])
}

test('SB-4 the mismatch journey, Overview to saved record and back, reaches nothing beyond this laptop', async ({ page }) => {
  await expectJourneyStaysLocal(page, MISMATCH_JOURNEY)
})

test('SB-4 the legitimate journey, Overview to saved record and back, reaches nothing beyond this laptop', async ({ page }) => {
  await expectJourneyStaysLocal(page, LEGIT_JOURNEY)
})
