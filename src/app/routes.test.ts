import { afterEach, expect, test, vi } from 'vitest'
import { SAMPLES } from '../data/samples'
import { canStartAttempt, lockAndCompare, phaseOf, saveAttempt } from '../kernel/attempts'
import { buildRecord } from '../kernel/record'
import type { Answers, Attempt, Ctx, KernelResult, PersistedState } from '../kernel/types'
import { parseHash, pushHash, replaceHash, resolveRoute, toHash } from './routes'

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

const ctx: Ctx = deepFreeze({ samples: SAMPLES, now: new Date('2026-10-25T19:42:00Z'), timeZone: 'America/Toronto' })
const EMPTY: PersistedState = deepFreeze({ version: 1, attempts: [], records: [] })
const MISMATCH = 'req-mismatch'
const LEGIT = 'req-legit'
const RECORD_1 = 'PC-20261025-154200-001'

const mismatchAnswers: Answers = deepFreeze({
  payeeName: 'Harbourline Lumber Ltd.',
  institution: '952',
  transit: '60415',
  account: '73414471',
  personSpokenTo: 'Sam Okafor',
})
const legitAnswers: Answers = deepFreeze({
  payeeName: 'Cedarline Electrical Supply Inc.',
  institution: '958',
  transit: '40388',
  account: '3307126',
  personSpokenTo: 'Priya Natarajan',
})

function next(result: KernelResult): PersistedState {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
  return deepFreeze(result.state)
}

// States reached through the kernel, one per phase.
const legitPending = next(lockAndCompare(EMPTY, LEGIT, legitAnswers, ctx))
const legitVerified = next(saveAttempt(legitPending, 'A-001', ctx))
const mismatchPending = next(lockAndCompare(EMPTY, MISMATCH, mismatchAnswers, ctx))
const heldMismatch = next(saveAttempt(mismatchPending, 'A-001', ctx))

// A saved couldn't-verify attempt, hand-built until saveCouldntVerify exists (slice 3).
const heldIncomplete: PersistedState = (() => {
  const attempt: Attempt = {
    id: 'A-001',
    requestId: MISMATCH,
    status: 'saved',
    outcome: 'couldnt_verify',
    stated: null,
    personSpokenTo: null,
    results: { payeeName: 'not_checked', institution: 'not_checked', transit: 'not_checked', account: 'not_checked' },
    reason: 'No answer',
    comparedAt: null,
    savedAt: ctx.now.toISOString(),
    recordId: RECORD_1,
  }
  return deepFreeze({ version: 1, attempts: [attempt], records: [buildRecord(attempt, ctx, 1)] })
})()

// A stand-in for the browser's location and history: the top entry is the current address. Setting the
// hash pushes an entry (and would fire hashchange); replaceState rewrites the top entry and fires nothing.
type FakeBrowser = { entries: string[]; pushes: number; replaces: number }

function fakeBrowser(entries: string[]): FakeBrowser {
  const browser: FakeBrowser = { entries: [...entries], pushes: 0, replaces: 0 }
  const location = {
    get hash() {
      return browser.entries.at(-1) ?? ''
    },
    set hash(value: string) {
      browser.entries.push(value)
      browser.pushes += 1
    },
  }
  const history = {
    state: null,
    replaceState(_state: unknown, _unused: string, url: string) {
      browser.entries[browser.entries.length - 1] = url
      browser.replaces += 1
    },
  }
  vi.stubGlobal('window', { location, history })
  return browser
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const PREVIOUS = '#/previous-screen'

type RouteRow = { id: string; name: string; hash: string; state: PersistedState; target: string; history: 'replace' | 'push' }

const rows: RouteRow[] = [
  // Guard 1: an unknown route shape, an unknown request ID, or a record ID not in saved state → #/.
  { id: 'RT-4', name: 'unknown route shape → #/', hash: '#/nowhere', state: EMPTY, target: '#/', history: 'replace' },
  { id: 'RT-4', name: 'request without an ID → #/', hash: '#/request', state: EMPTY, target: '#/', history: 'replace' },
  { id: 'RT-4', name: 'unknown request action → #/', hash: '#/request/req-legit/edit', state: EMPTY, target: '#/', history: 'replace' },
  { id: 'RT-4', name: 'extra path segment → #/', hash: '#/request/req-legit/call/now', state: EMPTY, target: '#/', history: 'replace' },
  { id: 'RT-4', name: 'trailing slash → #/', hash: '#/request/req-legit/', state: EMPTY, target: '#/', history: 'replace' },
  { id: 'RT-4', name: 'malformed % escape → #/', hash: '#/request/%E0%A4%A', state: EMPTY, target: '#/', history: 'replace' },
  { id: 'RT-4', name: 'no leading slash → #/', hash: '#request/req-legit', state: EMPTY, target: '#/', history: 'replace' },
  { id: 'RT-4', name: 'empty address → #/', hash: '', state: EMPTY, target: '#/', history: 'replace' },
  { id: 'RT-4', name: 'unknown request ID → #/', hash: '#/request/req-nope', state: EMPTY, target: '#/', history: 'replace' },
  { id: 'RT-4', name: '/call for an unknown request → #/', hash: '#/request/req-nope/call', state: EMPTY, target: '#/', history: 'replace' },
  { id: 'RT-4', name: '/compare for an unknown request → #/', hash: '#/request/req-nope/compare', state: legitPending, target: '#/', history: 'replace' },
  { id: 'RT-4', name: 'record not in saved state (stale after Reset) → #/', hash: `#/record/${RECORD_1}`, state: EMPTY, target: '#/', history: 'replace' },
  { id: 'RT-4', name: 'unknown record ID → #/', hash: '#/record/PC-20261025-154200-009', state: legitVerified, target: '#/', history: 'replace' },
  // Guard 2: /request/:id with a compared attempt → /compare.
  { id: 'CR-9 OS-4 RT-4', name: '/request/:id with a pending comparison → /compare', hash: '#/request/req-legit', state: legitPending, target: '#/request/req-legit/compare', history: 'replace' },
  { id: 'CR-9 OS-4 RT-4', name: '/request/:id with a pending mismatch → /compare', hash: '#/request/req-mismatch', state: mismatchPending, target: '#/request/req-mismatch/compare', history: 'replace' },
  // Guard 3: /call with a compared attempt → /compare.
  { id: 'CR-2 RT-4', name: '/call with a pending comparison → /compare', hash: '#/request/req-legit/call', state: legitPending, target: '#/request/req-legit/compare', history: 'replace' },
  { id: 'CR-2 RT-4', name: '/call with a pending mismatch → /compare', hash: '#/request/req-mismatch/call', state: mismatchPending, target: '#/request/req-mismatch/compare', history: 'replace' },
  // Guard 4: /call when verified → /request/:id.
  { id: 'RT-3 RT-4', name: '/call when verified → /request/:id', hash: '#/request/req-legit/call', state: legitVerified, target: '#/request/req-legit', history: 'replace' },
  // Guard 5: /compare with no compared attempt → /request/:id.
  { id: 'RT-4', name: '/compare with no attempts → /request/:id', hash: '#/request/req-legit/compare', state: EMPTY, target: '#/request/req-legit', history: 'replace' },
  { id: 'RT-3 RT-4', name: '/compare when verified → /request/:id', hash: '#/request/req-legit/compare', state: legitVerified, target: '#/request/req-legit', history: 'replace' },
  { id: 'RT-4', name: '/compare after a saved mismatch → /request/:id', hash: '#/request/req-mismatch/compare', state: heldMismatch, target: '#/request/req-mismatch', history: 'replace' },
  { id: 'RT-4', name: '/compare after a saved couldn\'t-verify → /request/:id', hash: '#/request/req-mismatch/compare', state: heldIncomplete, target: '#/request/req-mismatch', history: 'replace' },
  // Pass-through: no guard fires, so ordinary navigation pushes.
  { id: 'RT-4', name: 'overview passes', hash: '#/', state: legitPending, target: '#/', history: 'push' },
  { id: 'RT-4', name: '/request/:id with no attempts passes', hash: '#/request/req-legit', state: EMPTY, target: '#/request/req-legit', history: 'push' },
  { id: 'RT-3 RT-4', name: '/request/:id when verified passes (read-only)', hash: '#/request/req-legit', state: legitVerified, target: '#/request/req-legit', history: 'push' },
  { id: 'RT-4', name: '/request/:id after a saved mismatch passes', hash: '#/request/req-mismatch', state: heldMismatch, target: '#/request/req-mismatch', history: 'push' },
  { id: 'RT-4', name: '/call with no attempts passes', hash: '#/request/req-legit/call', state: EMPTY, target: '#/request/req-legit/call', history: 'push' },
  { id: 'RT-4', name: '/call after a saved mismatch passes', hash: '#/request/req-mismatch/call', state: heldMismatch, target: '#/request/req-mismatch/call', history: 'push' },
  { id: 'RT-4', name: '/call after a saved couldn\'t-verify passes', hash: '#/request/req-mismatch/call', state: heldIncomplete, target: '#/request/req-mismatch/call', history: 'push' },
  { id: 'OS-4 RT-4', name: '/call passes while only another request is pending', hash: '#/request/req-mismatch/call', state: legitPending, target: '#/request/req-mismatch/call', history: 'push' },
  { id: 'CR-9 RT-4', name: '/compare with a pending comparison passes (reload stays locked)', hash: '#/request/req-legit/compare', state: legitPending, target: '#/request/req-legit/compare', history: 'push' },
  { id: 'RT-4', name: 'saved record passes', hash: `#/record/${RECORD_1}`, state: legitVerified, target: `#/record/${RECORD_1}`, history: 'push' },
]

test.each(rows)('$id $name', ({ hash, state, target, history }) => {
  const resolved = resolveRoute(hash, state, SAMPLES)
  expect(resolved.hash).toBe(target)
  expect(resolved.route).toEqual(parseHash(target))
  expect(resolved.redirected).toBe(history === 'replace')

  // The browser has just put `hash` on top (a typed address, a link, Back or a reload). The app
  // replaces it on a redirect, so the redirect adds no entry and fires no hashchange.
  const landed = fakeBrowser([PREVIOUS, hash])
  if (resolved.redirected) replaceHash(resolved.hash)
  else pushHash(resolved.hash)
  expect(landed.entries).toEqual([PREVIOUS, target])
  expect(landed.pushes).toBe(0)
  expect(landed.replaces).toBe(history === 'replace' ? 1 : 0)

  // Ordinary navigation to a route that passes pushes exactly one entry.
  if (history === 'push') {
    const navigated = fakeBrowser([PREVIOUS])
    pushHash(resolved.hash)
    expect(navigated.entries).toEqual([PREVIOUS, target])
    expect(navigated.pushes).toBe(1)
    expect(navigated.replaces).toBe(0)
  }
})

test('RT-4 replaceHash and pushHash do nothing when the address is already shown', () => {
  const browser = fakeBrowser([PREVIOUS, '#/request/req-legit'])
  replaceHash('#/request/req-legit')
  pushHash('#/request/req-legit')
  expect(browser).toEqual({ entries: [PREVIOUS, '#/request/req-legit'], pushes: 0, replaces: 0 })
})

test('RT-4 the router opens /call exactly when the kernel would accept Compare', () => {
  const states = [EMPTY, legitPending, legitVerified, mismatchPending, heldMismatch, heldIncomplete]
  for (const state of states) {
    for (const requestId of [MISMATCH, LEGIT]) {
      const resolved = resolveRoute(toHash({ name: 'call', requestId }), state, SAMPLES)
      expect(resolved.route.name === 'call').toBe(canStartAttempt(state, requestId))
      const phase = phaseOf(state, requestId)
      if (phase === 'pending') expect(resolved.route).toEqual({ name: 'compare', requestId })
      if (phase === 'verified') expect(resolved.route).toEqual({ name: 'request', requestId })
    }
  }
})

// Walks the browser's Back button through the entries a real journey leaves behind, resolving each one
// the way the app does on hashchange, and returns the screens it showed.
function walkBack(entries: string[], state: PersistedState): string[] {
  const shown: string[] = []
  for (let i = entries.length - 2; i >= 0; i -= 1) {
    const entry = entries[i]
    if (entry === undefined) continue
    const resolved = resolveRoute(entry, state, SAMPLES)
    entries[i] = resolved.hash // replaceState on a redirect
    shown.push(resolved.hash)
  }
  return shown
}

const JOURNEY = ['#/', '#/request/req-legit', '#/request/req-legit/call', '#/request/req-legit/compare']

test('CR-2 CR-9 browser Back ×3 from a revealed comparison reaches the Overview without reopening the answers', () => {
  const shown = walkBack([...JOURNEY], legitPending)
  expect(shown).toEqual(['#/request/req-legit/compare', '#/request/req-legit/compare', '#/'])
  expect(shown).not.toContain('#/request/req-legit/call')
})

test('RT-3 browser Back after saving a match reopens the request read-only, never /call or /compare', () => {
  const entries = [...JOURNEY, `#/record/${RECORD_1}`]
  const shown = walkBack(entries, legitVerified)
  expect(shown).toEqual(['#/request/req-legit', '#/request/req-legit', '#/request/req-legit', '#/'])
  expect(resolveRoute('#/request/req-legit', legitVerified, SAMPLES).route).toEqual({ name: 'request', requestId: LEGIT })
})

test('RT-4 toHash and parseHash round-trip every route shape', () => {
  const routes = [
    { name: 'overview' },
    { name: 'request', requestId: LEGIT },
    { name: 'call', requestId: LEGIT },
    { name: 'compare', requestId: LEGIT },
    { name: 'record', recordId: RECORD_1 },
  ] as const
  for (const route of routes) expect(parseHash(toHash(route))).toEqual(route)
  expect(toHash({ name: 'request', requestId: 'a/b c' })).toBe('#/request/a%2Fb%20c')
  expect(parseHash('#/request/a%2Fb%20c')).toEqual({ name: 'request', requestId: 'a/b c' })
})
