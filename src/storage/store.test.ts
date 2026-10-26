import { afterEach, describe, expect, test, vi } from 'vitest'
import { SAMPLES } from '../data/samples'
import { lockAndCompare, saveAttempt, saveCouldntVerify } from '../kernel/attempts'
import type { Attempt, Ctx, KernelResult, PersistedState, Samples, VerificationRecord } from '../kernel/types'
import { createStore, EMPTY_STATE, STORAGE_KEY } from './store'

// An in-memory Storage that records every call and can be told to fail the ways a browser does.
function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  const calls: string[] = []
  const fail: {
    getItem: unknown // thrown by getItem when set
    setItem: unknown // thrown by setItem when set
    removeItem: unknown // thrown by removeItem when set
    dropWrites: boolean // setItem returns normally but keeps nothing
    readBack: string | null // getItem returns this instead of what is stored
  } = { getItem: null, setItem: null, removeItem: null, dropWrites: false, readBack: null }
  const storage: Storage = {
    get length() {
      return data.size
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem(key) {
      calls.push(`getItem ${key}`)
      if (fail.getItem) throw fail.getItem
      return fail.readBack ?? data.get(key) ?? null
    },
    setItem(key, value) {
      calls.push(`setItem ${key}`)
      if (fail.setItem) throw fail.setItem
      if (!fail.dropWrites) data.set(key, String(value))
    },
    removeItem(key) {
      calls.push(`removeItem ${key}`)
      if (fail.removeItem) throw fail.removeItem
      data.delete(key)
    },
    clear() {
      calls.push('clear')
      data.clear()
    },
  }
  return { storage, data, calls, fail }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

const blocked = () => new DOMException('The operation is insecure.', 'SecurityError')

// Hand-built states on the real samples, consistent enough to pass the slice 3 invariants as well: positional
// IDs, results that re-derive from the stated details, records that repeat their attempts.
const MISMATCH_REQUESTED = { payeeName: 'Harbourline Lumber Ltd.', institution: '952', transit: '60415', account: '73419020' }
const MISMATCH_STATED = { payeeName: 'Harbourline Lumber Ltd.', institution: '952', transit: '60415', account: '73415568' }
const MISMATCH_RESULTS = { payeeName: 'match', institution: 'match', transit: 'match', account: 'mismatch' } as const
const NOT_CHECKED = { payeeName: 'not_checked', institution: 'not_checked', transit: 'not_checked', account: 'not_checked' } as const
const LEGIT_REQUESTED = { payeeName: 'Cedarline Electrical Supply Inc.', institution: '958', transit: '40388', account: '3307126' }

const COMPARED_MISMATCH: Attempt = {
  id: 'A-001',
  requestId: 'req-mismatch',
  status: 'compared',
  outcome: 'mismatch',
  stated: MISMATCH_STATED,
  personSpokenTo: 'Morgan Tilley',
  results: MISMATCH_RESULTS,
  reason: '',
  comparedAt: '2026-10-25T19:41:30.000Z',
  savedAt: null,
  recordId: null,
}
const SAVED_MISMATCH: Attempt = {
  ...COMPARED_MISMATCH,
  status: 'saved',
  savedAt: '2026-10-25T19:42:00.000Z',
  recordId: 'PC-20261025-154200-001',
}
const SAVED_COULDNT_VERIFY: Attempt = {
  id: 'A-002',
  requestId: 'req-mismatch',
  status: 'saved',
  outcome: 'couldnt_verify',
  stated: null,
  personSpokenTo: null,
  results: NOT_CHECKED,
  reason: 'No answer',
  comparedAt: null,
  savedAt: '2026-10-25T19:50:00.000Z',
  recordId: 'PC-20261025-155000-002',
}
const SAVED_VERIFIED: Attempt = {
  id: 'A-003',
  requestId: 'req-legit',
  status: 'saved',
  outcome: 'verified',
  // Exactly as typed: the space survives the round trip even though it compares equal.
  stated: { ...LEGIT_REQUESTED, account: '330 7126' },
  personSpokenTo: 'Avery Lindqvist',
  results: { payeeName: 'match', institution: 'match', transit: 'match', account: 'match' },
  reason: '',
  comparedAt: '2026-10-25T20:04:10.000Z',
  savedAt: '2026-10-25T20:05:00.000Z',
  recordId: 'PC-20261025-160500-003',
}

const HARBOURLINE = {
  requestId: 'req-mismatch',
  timeZone: 'America/Toronto',
  supplierName: 'Harbourline Lumber Ltd.',
  paymentRef: 'PR-2026-1041',
  amountCents: 1248000,
  dueDate: '2026-10-30',
  emailRef: 'Updated banking details for Harbourline Lumber Ltd. (received Oct 23, 2026)',
  trustedNumber: '519-555-0142',
  requested: MISMATCH_REQUESTED,
  label: 'Fictional sample data—no real call or payment',
} as const
const RECORD_MISMATCH: VerificationRecord = {
  ...HARBOURLINE,
  id: 'PC-20261025-154200-001',
  attemptId: 'A-001',
  savedAt: '2026-10-25T19:42:00.000Z',
  personSpokenTo: 'Morgan Tilley',
  stated: MISMATCH_STATED,
  results: MISMATCH_RESULTS,
  outcome: 'mismatch',
  reason: '',
  resultingPaymentStatus: 'On hold—details do not match',
}
const RECORD_COULDNT_VERIFY: VerificationRecord = {
  ...HARBOURLINE,
  id: 'PC-20261025-155000-002',
  attemptId: 'A-002',
  savedAt: '2026-10-25T19:50:00.000Z',
  personSpokenTo: null,
  stated: null,
  results: NOT_CHECKED,
  outcome: 'couldnt_verify',
  reason: 'No answer',
  resultingPaymentStatus: 'On hold—verification incomplete',
}
const RECORD_VERIFIED: VerificationRecord = {
  id: 'PC-20261025-160500-003',
  attemptId: 'A-003',
  requestId: 'req-legit',
  savedAt: '2026-10-25T20:05:00.000Z',
  timeZone: 'America/Toronto',
  supplierName: 'Cedarline Electrical Supply Inc.',
  paymentRef: 'PR-2026-1043',
  amountCents: 527340,
  dueDate: '2026-10-30',
  emailRef: 'New bank account for Cedarline Electrical Supply Inc. (received Oct 22, 2026)',
  trustedNumber: '519-555-0163',
  personSpokenTo: 'Avery Lindqvist',
  requested: LEGIT_REQUESTED,
  stated: { ...LEGIT_REQUESTED, account: '330 7126' },
  results: { payeeName: 'match', institution: 'match', transit: 'match', account: 'match' },
  outcome: 'verified',
  reason: '',
  resultingPaymentStatus: 'Ready to pay',
  label: 'Fictional sample data—no real call or payment',
}

// A comparison locked but not yet saved.
const PENDING_STATE: PersistedState = { version: 1, attempts: [COMPARED_MISMATCH], records: [] }
// Every outcome saved: mismatch, then couldn't verify on the retry, and the legitimate request verified.
const SAVED_STATE: PersistedState = {
  version: 1,
  attempts: [SAVED_MISMATCH, SAVED_COULDNT_VERIFY, SAVED_VERIFIED],
  records: [RECORD_MISMATCH, RECORD_COULDNT_VERIFY, RECORD_VERIFIED],
}

// A second comparison on the legitimate request, after its saved verified attempt.
const COMPARED_LEGIT_AFTER_VERIFIED: Attempt = {
  ...SAVED_VERIFIED,
  id: 'A-004',
  status: 'compared',
  comparedAt: '2026-10-25T20:10:00.000Z',
  savedAt: null,
  recordId: null,
}

const json = (value: unknown) => JSON.stringify(value)
const withAttempt = (index: number, patch: Record<string, unknown>) =>
  json({ ...SAVED_STATE, attempts: SAVED_STATE.attempts.map((a, i) => (i === index ? { ...a, ...patch } : a)) })
const withRecord = (index: number, patch: Record<string, unknown>) =>
  json({ ...SAVED_STATE, records: SAVED_STATE.records.map((r, i) => (i === index ? { ...r, ...patch } : r)) })
// A change to an attempt and its record together (SAVED_STATE pairs them by index), so the two still agree.
const withBoth = (index: number, patch: Record<string, unknown>, recordPatch: Record<string, unknown> = patch) =>
  json({
    ...SAVED_STATE,
    attempts: SAVED_STATE.attempts.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    records: SAVED_STATE.records.map((r, i) => (i === index ? { ...r, ...recordPatch } : r)),
  })
const { label: _dropped, ...recordWithoutLabel } = RECORD_MISMATCH

afterEach(() => {
  vi.restoreAllMocks()
})

describe('round trip', () => {
  test('CR-9 a locked, unsaved comparison survives save and reload, still compared with no record', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { storage, data, calls } = fakeStorage()
    const store = createStore(() => storage)

    expect(store.save(deepFreeze(structuredClone(PENDING_STATE)))).toEqual({ ok: true })
    // One write of the whole state under the one key, then the read-back.
    expect(calls).toEqual([`setItem ${STORAGE_KEY}`, `getItem ${STORAGE_KEY}`])
    expect(data.get(STORAGE_KEY)).toBe(JSON.stringify(PENDING_STATE))

    const reloaded = createStore(() => storage).load()
    expect(reloaded).toEqual({ kind: 'ok', state: PENDING_STATE })
    if (reloaded.kind !== 'ok') throw new Error('expected ok')
    expect(reloaded.state.attempts).toHaveLength(1)
    expect(reloaded.state.attempts[0]).toMatchObject({ id: 'A-001', status: 'compared', savedAt: null, recordId: null })
    expect(reloaded.state.records).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  test('VR-6 saved attempts and their records reload deep-equal, typed values untouched', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { storage } = fakeStorage()
    expect(createStore(() => storage).save(deepFreeze(structuredClone(SAVED_STATE)))).toEqual({ ok: true })

    const reloaded = createStore(() => storage).load()
    expect(reloaded).toEqual({ kind: 'ok', state: SAVED_STATE })
    if (reloaded.kind !== 'ok') throw new Error('expected ok')
    expect(reloaded.state.records.map((r) => r.resultingPaymentStatus)).toEqual([
      'On hold—details do not match',
      'On hold—verification incomplete',
      'Ready to pay',
    ])
    expect(reloaded.state.attempts[2]?.stated?.account).toBe('330 7126')
    expect(reloaded.state.records[0]?.label).toBe('Fictional sample data—no real call or payment')
    expect(warn).not.toHaveBeenCalled()
  })

  test('VR-6 a state built by every kernel action (mismatch, couldn\'t verify, verified retry) saves and reloads deep-equal', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = (iso: string): Ctx => ({ samples: SAMPLES, now: new Date(iso), timeZone: 'America/Toronto' })
    const answers = { payeeName: 'Harbourline Lumber Ltd.', institution: '952', transit: '60415', account: '73414471', personSpokenTo: 'Sam Okafor' }
    let state: PersistedState = EMPTY_STATE
    const run = (result: KernelResult) => {
      if (!result.ok) throw new Error(`kernel refused: ${result.reason}`)
      state = result.state
    }
    run(lockAndCompare(state, 'req-mismatch', answers, ctx('2026-10-25T19:42:00Z')))
    run(saveAttempt(state, 'A-001', ctx('2026-10-25T19:42:00Z')))
    run(saveCouldntVerify(state, 'req-mismatch', { reason: 'No answer' }, ctx('2026-10-25T19:50:00Z')))
    run(lockAndCompare(state, 'req-mismatch', { ...answers, account: '7341 9020' }, ctx('2026-10-25T20:05:00Z')))
    run(saveAttempt(state, 'A-003', ctx('2026-10-25T20:05:00Z')))

    const { storage } = fakeStorage()
    expect(createStore(() => storage).save(state)).toEqual({ ok: true })
    const reloaded = createStore(() => storage).load()
    expect(reloaded).toEqual({ kind: 'ok', state })
    if (reloaded.kind !== 'ok') throw new Error('expected ok')
    expect(reloaded.state.records.map((r) => r.resultingPaymentStatus)).toEqual([
      'On hold—details do not match',
      'On hold—verification incomplete',
      'Ready to pay',
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  test('RS-2 EMPTY_STATE, what first use and Reset return to, is a valid version 1 state with no attempts or records', () => {
    const { storage } = fakeStorage()
    const store = createStore(() => storage)
    expect(EMPTY_STATE).toEqual({ version: 1, attempts: [], records: [] })
    expect(store.save(EMPTY_STATE)).toEqual({ ok: true })
    expect(store.load()).toEqual({ kind: 'ok', state: EMPTY_STATE })
  })
})

describe('clear', () => {
  test('RS-2 clear() removes only payee-check:v1, leaves other-site:keep, and the next load is empty', () => {
    const { storage, data, calls } = fakeStorage({ 'other-site:keep': 'yes', [STORAGE_KEY]: json(SAVED_STATE) })
    const store = createStore(() => storage)

    expect(store.clear()).toEqual({ ok: true })
    expect(calls).toEqual(['removeItem payee-check:v1'])
    expect(data.has('payee-check:v1')).toBe(false)
    expect(data.get('other-site:keep')).toBe('yes')
    // First use and after-Reset are the same empty load.
    expect(store.load()).toEqual({ kind: 'empty' })
    expect(createStore(() => fakeStorage().storage).load()).toEqual({ kind: 'empty' })
  })

  test('RS-2 clear() works when the stored value is invalid', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { storage, data } = fakeStorage({ 'other-site:keep': 'yes', [STORAGE_KEY]: '{not json' })
    const store = createStore(() => storage)
    expect(store.load().kind).toBe('invalid')
    expect(store.clear()).toEqual({ ok: true })
    expect(store.load()).toEqual({ kind: 'empty' })
    expect(data.get('other-site:keep')).toBe('yes')
  })
})

describe('invalid saved data', () => {
  const cases: { id: string; name: string; raw: string; problem?: string }[] = [
    { id: 'SB-1', name: 'bad JSON', raw: '{not json' },
    { id: 'SB-1', name: 'version 2', raw: json({ ...SAVED_STATE, version: 2 }) },
    { id: 'SB-1', name: 'version missing', raw: json({ attempts: SAVED_STATE.attempts, records: SAVED_STATE.records }) },
    { id: 'SB-1', name: 'an extra top-level key', raw: json({ ...SAVED_STATE, extra: true }) },
    { id: 'SB-1', name: 'an extra key on an attempt', raw: withAttempt(0, { note: 'x' }) },
    { id: 'SB-1', name: 'an extra key on a record', raw: withRecord(0, { note: 'x' }) },
    { id: 'SB-1', name: 'an extra key in stated details', raw: withAttempt(0, { stated: { ...MISMATCH_STATED, iban: 'x' } }) },
    { id: 'SB-1', name: 'an extra key in results', raw: withAttempt(0, { results: { ...MISMATCH_RESULTS, phone: 'match' } }) },
    { id: 'SB-1', name: 'a result key missing', raw: withRecord(0, { results: { payeeName: 'match', institution: 'match', transit: 'match' } }) },
    { id: 'SB-1', name: 'an unknown attempt status', raw: withAttempt(0, { status: 'locked' }) },
    { id: 'SB-1', name: 'an unknown outcome', raw: withAttempt(0, { outcome: 'probably_fine' }) },
    { id: 'SB-1', name: 'an unknown field result', raw: withAttempt(0, { results: { ...MISMATCH_RESULTS, account: 'close' } }) },
    { id: 'SB-1', name: 'a status with a hyphen for the em dash', raw: withRecord(0, { resultingPaymentStatus: 'On hold-details do not match' }) },
    { id: 'SB-1', name: 'a different label', raw: withRecord(0, { label: 'Sample data' }) },
    { id: 'SB-1', name: 'a record missing its label', raw: json({ ...SAVED_STATE, records: [recordWithoutLabel, RECORD_COULDNT_VERIFY, RECORD_VERIFIED] }) },
    { id: 'SB-1', name: 'a bank detail stored as a number', raw: withRecord(0, { requested: { ...MISMATCH_REQUESTED, institution: 952 } }) },
    { id: 'SB-1', name: 'a saved time that is not ISO', raw: withAttempt(0, { savedAt: 'yesterday' }) },
    { id: 'SB-1', name: 'a due date that is not YYYY-MM-DD', raw: withRecord(0, { dueDate: '30/10/2026' }) },
    { id: 'SB-1', name: 'JSON null', raw: 'null' },
    { id: 'SB-1', name: 'a JSON array', raw: '[]' },
    // The right shape but against the rules: checkInvariants rejects each one.
    { id: 'SB-1', name: 'an unknown requestId', raw: withBoth(1, { requestId: 'req-nope' }), problem: 'unknown_request:A-002' },
    {
      id: 'SB-1',
      name: 'a saved verified with a one-digit account difference',
      raw: withBoth(2, { stated: { ...LEGIT_REQUESTED, account: '3307127' } }),
      problem: 'results_rederive:A-003',
    },
    {
      id: 'SB-1',
      name: 'two compared attempts',
      raw: json({ version: 1, attempts: [COMPARED_MISMATCH, { ...COMPARED_MISMATCH, id: 'A-002' }], records: [] }),
      problem: 'compared_not_last:A-001',
    },
    {
      id: 'SB-1',
      name: 'an attempt after verified',
      raw: json({ ...SAVED_STATE, attempts: [...SAVED_STATE.attempts, COMPARED_LEGIT_AFTER_VERIFIED] }),
      problem: 'attempt_after_verified:A-004',
    },
    {
      id: 'SB-1',
      name: 'an attempt-ID gap',
      raw: json({ version: 1, attempts: [{ ...COMPARED_MISMATCH, id: 'A-002' }], records: [] }),
      problem: 'attempt_id_not_positional:A-002',
    },
    { id: 'SB-1', name: "timeZone 'Mars/Base'", raw: withRecord(0, { timeZone: 'Mars/Base' }), problem: 'time_zone:PC-20261025-154200-001' },
    {
      id: 'SB-1',
      name: 'a record-number gap',
      raw: withBoth(2, { recordId: 'PC-20261025-160500-004' }, { id: 'PC-20261025-160500-004' }),
      problem: 'record_id_not_positional:PC-20261025-160500-004',
    },
    { id: 'SB-1', name: 'a broken record link', raw: withAttempt(0, { recordId: 'PC-20261025-155000-002' }), problem: 'record_link:A-001' },
    {
      id: 'SB-1',
      name: "a couldn't-verify with a match result",
      raw: withBoth(1, { results: { ...NOT_CHECKED, account: 'match' } }),
      problem: 'couldnt_verify_shape:A-002',
    },
    {
      id: 'SB-1',
      name: 'a record whose status disagrees with its outcome',
      raw: withRecord(0, { resultingPaymentStatus: 'Ready to pay' }),
      problem: 'record_status:PC-20261025-154200-001',
    },
  ]

  test.each(cases)('$id $name → invalid, warned, stored value untouched', ({ raw, problem }) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { storage, data, calls } = fakeStorage({ [STORAGE_KEY]: raw })

    const result = createStore(() => storage).load()

    expect(result.kind).toBe('invalid')
    if (result.kind !== 'invalid') throw new Error('expected invalid')
    expect(result.problem).not.toBe('')
    if (problem !== undefined) expect(result.problem).toContain(problem)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain(result.problem)
    // Loading never repairs or overwrites: the bad value stays until Reset is confirmed.
    expect(data.get(STORAGE_KEY)).toBe(raw)
    expect(calls).toEqual([`getItem ${STORAGE_KEY}`])
  })

  test('SB-1 the valid state every fixture above changes in one place loads ok', () => {
    const { storage } = fakeStorage({ [STORAGE_KEY]: json(SAVED_STATE) })
    expect(createStore(() => storage).load()).toEqual({ kind: 'ok', state: SAVED_STATE })
  })

  test('SB-1 loaded data is re-judged against the samples: SAMPLES by default, or the ones the store is given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { storage, data } = fakeStorage({ [STORAGE_KEY]: json(SAVED_STATE) })
    expect(createStore(() => storage, SAMPLES).load()).toEqual({ kind: 'ok', state: SAVED_STATE })

    // The same saved data after the legitimate request's account was edited: the saved "verified" no longer holds.
    const edited: Samples = {
      ...SAMPLES,
      requests: SAMPLES.requests.map((r) => (r.id === 'req-legit' ? { ...r, requested: { ...r.requested, account: '3307127' } } : r)),
    }
    const result = createStore(() => storage, edited).load()
    expect(result.kind).toBe('invalid')
    if (result.kind !== 'invalid') throw new Error('expected invalid')
    expect(result.problem).toContain('results_rederive:A-003')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(data.get(STORAGE_KEY)).toBe(json(SAVED_STATE))
  })
})

describe('storage failures', () => {
  test('SB-2 the getter throws → load is unavailable, save and clear fail, nothing throws', () => {
    const getStorage = () => {
      throw blocked()
    }
    const store = createStore(getStorage)
    expect(store.load()).toEqual({ kind: 'unavailable' })
    expect(store.save(SAVED_STATE)).toEqual({ ok: false, error: 'unavailable' })
    expect(store.clear()).toEqual({ ok: false })
  })

  test('SB-2 the getter is called inside each action, never at creation, so blocked storage is caught', () => {
    let blockedNow = true
    const { storage } = fakeStorage()
    const getStorage = vi.fn(() => {
      if (blockedNow) throw blocked()
      return storage
    })
    const store = createStore(getStorage)
    expect(getStorage).not.toHaveBeenCalled()
    expect(store.load()).toEqual({ kind: 'unavailable' })
    blockedNow = false
    expect(store.save(PENDING_STATE)).toEqual({ ok: true })
    expect(store.load()).toEqual({ kind: 'ok', state: PENDING_STATE })
  })

  test('SB-2 the default getter outside a browser (no window) → unavailable, not a crash', () => {
    const store = createStore()
    expect(store.load()).toEqual({ kind: 'unavailable' })
    expect(store.save(PENDING_STATE)).toEqual({ ok: false, error: 'unavailable' })
    expect(store.clear()).toEqual({ ok: false })
  })

  test('SB-2 getItem throws → load is unavailable', () => {
    const { storage, fail } = fakeStorage({ [STORAGE_KEY]: json(SAVED_STATE) })
    fail.getItem = blocked()
    expect(createStore(() => storage).load()).toEqual({ kind: 'unavailable' })
  })

  const saveFailures: { id: string; name: string; arrange: (f: ReturnType<typeof fakeStorage>['fail']) => void; error: string }[] = [
    { id: 'SB-3', name: 'setItem throws a SecurityError → unavailable', arrange: (f) => (f.setItem = blocked()), error: 'unavailable' },
    { id: 'SB-3', name: 'setItem throws a plain Error → unavailable', arrange: (f) => (f.setItem = new Error('nope')), error: 'unavailable' },
    {
      id: 'SB-3',
      name: 'setItem throws a QuotaExceededError DOMException → quota',
      arrange: (f) => (f.setItem = new DOMException('The quota has been exceeded.', 'QuotaExceededError')),
      error: 'quota',
    },
    {
      id: 'SB-3',
      name: 'setItem throws an error named QuotaExceededError → quota',
      arrange: (f) => (f.setItem = Object.assign(new Error('full'), { name: 'QuotaExceededError' })),
      error: 'quota',
    },
    {
      id: 'SB-3',
      name: 'setItem throws an error with legacy code 22 → quota',
      arrange: (f) => (f.setItem = Object.assign(new Error('full'), { code: 22 })),
      error: 'quota',
    },
    { id: 'SB-3', name: 'read-back returns a different value → readback', arrange: (f) => (f.readBack = '{"version":1}'), error: 'readback' },
    { id: 'SB-3', name: 'setItem silently keeps nothing → readback', arrange: (f) => (f.dropWrites = true), error: 'readback' },
    { id: 'SB-3', name: 'the read-back getItem throws → unavailable', arrange: (f) => (f.getItem = blocked()), error: 'unavailable' },
  ]

  test.each(saveFailures)('$id $name', ({ arrange, error }) => {
    const before = json(PENDING_STATE)
    const fake = fakeStorage({ [STORAGE_KEY]: before })
    arrange(fake.fail)

    const result = createStore(() => fake.storage).save(SAVED_STATE)

    expect(result).toEqual({ ok: false, error })
    // Exactly one write was attempted, of the whole state.
    expect(fake.calls.filter((c) => c.startsWith('setItem'))).toEqual([`setItem ${STORAGE_KEY}`])
  })

  test('SB-3 a failed setItem leaves the previous value in place', () => {
    const before = json(PENDING_STATE)
    const { storage, data, fail } = fakeStorage({ [STORAGE_KEY]: before })
    fail.setItem = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    expect(createStore(() => storage).save(SAVED_STATE)).toEqual({ ok: false, error: 'quota' })
    expect(data.get(STORAGE_KEY)).toBe(before)
  })

  test('SB-5 removeItem throws → clear is ok: false and the stored value is kept', () => {
    const before = json(SAVED_STATE)
    const { storage, data, fail } = fakeStorage({ [STORAGE_KEY]: before, 'other-site:keep': 'yes' })
    fail.removeItem = blocked()
    expect(createStore(() => storage).clear()).toEqual({ ok: false })
    expect(data.get(STORAGE_KEY)).toBe(before)
    expect(data.get('other-site:keep')).toBe('yes')
  })
})
