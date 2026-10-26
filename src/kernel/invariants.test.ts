import { expect, test } from 'vitest'
import { SAMPLES } from '../data/samples'
import { lockAndCompare, saveAttempt, saveCouldntVerify } from './attempts'
import { appendOnlyProblems, assertAppendOnly, checkInvariants } from './invariants'
import type { Answers, Attempt, Ctx, KernelResult, PersistedState, Samples, VerificationRecord } from './types'

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

const at = (iso: string): Ctx => deepFreeze({ samples: SAMPLES, now: new Date(iso), timeZone: 'America/Toronto' })
const EMPTY: PersistedState = deepFreeze({ version: 1, attempts: [], records: [] })
const MISMATCH = 'req-mismatch'
const LEGIT = 'req-legit'

const mismatchAnswers: Answers = deepFreeze({
  payeeName: 'Harbourline Lumber Ltd.',
  institution: '952',
  transit: '60415',
  account: '73414471',
  personSpokenTo: 'Sam Okafor',
})
const matchingAnswers: Answers = deepFreeze({ ...mismatchAnswers, account: '73419020' })
const legitAnswers: Answers = deepFreeze({
  payeeName: 'Cedarline Electrical Supply Inc.',
  institution: '958',
  transit: '40388',
  account: '3307126',
  personSpokenTo: 'Priya Natarajan',
})

function step(from: PersistedState, result: KernelResult): PersistedState {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
  return deepFreeze(result.state)
}

// A valid base with every kind of attempt, built only by the kernel with fixed clocks:
// A-001 Harbourline saved mismatch (record 1), A-002 Cedarline saved verified (record 2),
// A-003 Harbourline saved couldn't-verify (record 3), A-004 Harbourline compared, not saved.
const s1 = step(EMPTY, lockAndCompare(EMPTY, MISMATCH, mismatchAnswers, at('2026-10-25T19:41:00Z')))
const s2 = step(s1, saveAttempt(s1, 'A-001', at('2026-10-25T19:42:00Z')))
const s3 = step(s2, lockAndCompare(s2, LEGIT, legitAnswers, at('2026-10-25T19:49:00Z')))
const s4 = step(s3, saveAttempt(s3, 'A-002', at('2026-10-25T19:50:00Z')))
const s5 = step(s4, saveCouldntVerify(s4, MISMATCH, { reason: 'No answer' }, at('2026-10-25T20:00:00Z')))
const BASE = step(s5, lockAndCompare(s5, MISMATCH, matchingAnswers, at('2026-10-25T20:05:00Z')))
const CHAIN = [EMPTY, s1, s2, s3, s4, s5, BASE]

const R1 = 'PC-20261025-154200-001'
const R2 = 'PC-20261025-155000-002'
const R3 = 'PC-20261025-160000-003'

function attemptAt(state: PersistedState, index: number): Attempt {
  const attempt = state.attempts[index]
  if (!attempt) throw new Error(`no attempt ${index}`)
  return attempt
}
function recordAt(state: PersistedState, index: number): VerificationRecord {
  const record = state.records[index]
  if (!record) throw new Error(`no record ${index}`)
  return record
}

// A changed copy; the frozen original is never touched.
function broken(change: (s: PersistedState) => void, from: PersistedState = BASE): PersistedState {
  const copy = structuredClone(from)
  change(copy)
  return copy
}

test('SB-1 the base and every state on the way to it are valid', () => {
  expect(BASE.attempts.map((a) => [a.id, a.requestId, a.status, a.outcome, a.recordId])).toEqual([
    ['A-001', MISMATCH, 'saved', 'mismatch', R1],
    ['A-002', LEGIT, 'saved', 'verified', R2],
    ['A-003', MISMATCH, 'saved', 'couldnt_verify', R3],
    ['A-004', MISMATCH, 'compared', 'verified', null],
  ])
  for (const state of CHAIN) expect(checkInvariants(state, SAMPLES)).toEqual([])
})

const fixtures: { id: string; name: string; state: PersistedState; problems: string[] }[] = [
  {
    id: 'SB-1',
    name: 'an unknown requestId',
    state: broken((s) => {
      attemptAt(s, 2).requestId = 'req-nope'
      recordAt(s, 2).requestId = 'req-nope'
    }),
    problems: ['unknown_request:A-003', `unknown_request:${R3}`],
  },
  {
    id: 'SB-1',
    name: 'a saved verified with a one-digit account difference',
    state: broken((s) => {
      const stated = { ...legitAnswers, account: '3307127' }
      const { personSpokenTo: _person, ...details } = stated
      attemptAt(s, 1).stated = details
      recordAt(s, 1).stated = { ...details }
    }),
    problems: ['results_rederive:A-002'],
  },
  {
    id: 'SB-1',
    name: 'two compared attempts on one request',
    state: broken((s) => {
      s.attempts.push({ ...attemptAt(s, 3), id: 'A-005' })
    }),
    problems: ['compared_not_last:A-004'],
  },
  {
    id: 'SB-1',
    name: 'an attempt after a saved verified one',
    state: broken((s) => {
      s.attempts.push({ ...attemptAt(s, 1), id: 'A-005', status: 'compared', savedAt: null, recordId: null })
    }),
    problems: ['attempt_after_verified:A-005'],
  },
  {
    id: 'SB-1',
    name: 'an attempt-ID gap',
    state: broken((s) => {
      attemptAt(s, 3).id = 'A-005'
    }),
    problems: ['attempt_id_not_positional:A-005'],
  },
  {
    id: 'SB-1',
    name: 'a reissued attempt ID',
    state: broken((s) => {
      attemptAt(s, 3).id = 'A-003'
    }),
    problems: ['attempt_id_not_positional:A-003', 'compared_has_record:A-003', `record_link:${R3}`],
  },
  {
    id: 'SB-1',
    name: "timeZone 'Mars/Base'",
    state: broken((s) => {
      recordAt(s, 0).timeZone = 'Mars/Base'
    }),
    problems: [`time_zone:${R1}`],
  },
  {
    id: 'SB-1',
    name: 'a record-number gap',
    state: broken((s) => {
      attemptAt(s, 2).recordId = 'PC-20261025-160000-004'
      recordAt(s, 2).id = 'PC-20261025-160000-004'
    }),
    problems: ['record_id_not_positional:PC-20261025-160000-004'],
  },
  {
    id: 'SB-1',
    name: 'a broken record link (the attempt points at another record)',
    state: broken((s) => {
      attemptAt(s, 0).recordId = R2
    }),
    problems: ['record_link:A-001', `record_link:${R1}`],
  },
  {
    id: 'SB-1',
    name: 'a broken record link (the record points at another attempt)',
    state: broken((s) => {
      recordAt(s, 2).attemptId = 'A-009'
    }),
    problems: ['record_link:A-003', `record_link:${R3}`],
  },
  {
    id: 'SB-1',
    name: 'a saved attempt with no record',
    state: broken((s) => {
      s.records.pop()
    }),
    problems: ['record_link:A-003'],
  },
  {
    id: 'SB-1',
    name: 'a compared attempt with a save time',
    state: broken((s) => {
      attemptAt(s, 3).savedAt = '2026-10-25T20:06:00.000Z'
    }),
    problems: ['compared_has_record:A-004'],
  },
  {
    id: 'SB-1',
    name: 'a compared attempt with no compare time',
    state: broken((s) => {
      attemptAt(s, 3).comparedAt = null
    }),
    problems: ['compared_at_missing:A-004'],
  },
  {
    id: 'SB-1 VR-3',
    name: "a couldn't-verify with a match result",
    state: broken((s) => {
      attemptAt(s, 2).results.account = 'match'
      recordAt(s, 2).results.account = 'match'
    }),
    problems: ['couldnt_verify_shape:A-003'],
  },
  {
    id: 'SB-1 VR-3',
    name: "a couldn't-verify with stated details",
    state: broken((s) => {
      const { personSpokenTo: _person, ...details } = matchingAnswers
      attemptAt(s, 2).stated = details
      recordAt(s, 2).stated = { ...details }
    }),
    problems: ['couldnt_verify_shape:A-003'],
  },
  {
    id: 'SB-1 CB-6',
    name: "a couldn't-verify storing a blank person spoken to",
    state: broken((s) => {
      attemptAt(s, 2).personSpokenTo = '  '
      recordAt(s, 2).personSpokenTo = '  '
    }),
    problems: ['blank_person:A-003'],
  },
  {
    id: 'SB-1',
    name: 'a saved mismatch relabelled verified, record and status included',
    state: broken((s) => {
      attemptAt(s, 0).outcome = 'verified'
      recordAt(s, 0).outcome = 'verified'
      recordAt(s, 0).resultingPaymentStatus = 'Ready to pay'
    }),
    // The later Harbourline attempts now also follow a "verified" one.
    problems: ['attempt_after_verified:A-003', 'attempt_after_verified:A-004', 'results_rederive:A-001'],
  },
  {
    id: 'SB-1',
    name: 'a saved verified with no stated details',
    state: broken((s) => {
      attemptAt(s, 1).stated = null
      recordAt(s, 1).stated = null
    }),
    problems: ['stated_missing:A-002'],
  },
  {
    id: 'SB-1',
    name: 'a saved verified with no person spoken to',
    state: broken((s) => {
      attemptAt(s, 1).personSpokenTo = null
      recordAt(s, 1).personSpokenTo = null
    }),
    problems: ['missing_answers:A-002'],
  },
  {
    id: 'SB-1',
    name: 'a record whose resultingPaymentStatus disagrees with its outcome',
    state: broken((s) => {
      recordAt(s, 0).resultingPaymentStatus = 'Ready to pay'
    }),
    problems: [`record_status:${R1}`],
  },
  {
    id: 'SB-1',
    name: 'a record whose person spoken to differs from its attempt',
    state: broken((s) => {
      recordAt(s, 0).personSpokenTo = 'Someone Else'
    }),
    problems: [`record_differs_from_attempt:${R1}`],
  },
  {
    id: 'SB-1',
    name: 'a record whose outcome differs from its attempt',
    state: broken((s) => {
      recordAt(s, 0).outcome = 'verified'
      recordAt(s, 0).resultingPaymentStatus = 'Ready to pay'
    }),
    problems: [`record_differs_from_attempt:${R1}`],
  },
  {
    id: 'SB-1',
    name: 'a record whose reason differs from its attempt',
    state: broken((s) => {
      recordAt(s, 2).reason = 'Supplier confirmed'
    }),
    problems: [`record_differs_from_attempt:${R3}`],
  },
  {
    id: 'SB-1',
    name: "a record whose requested account isn't the sample's",
    state: broken((s) => {
      recordAt(s, 0).requested.account = '73414471'
    }),
    problems: [`record_differs_from_samples:${R1}`],
  },
  {
    id: 'SB-1',
    name: "a record whose trusted number is the email's",
    state: broken((s) => {
      recordAt(s, 0).trustedNumber = '519-555-0187'
    }),
    problems: [`record_differs_from_samples:${R1}`],
  },
]

test.each(fixtures)('$id $name → invalid', ({ state, problems }) => {
  expect(checkInvariants(state, SAMPLES)).toEqual(problems)
  // The frozen base is untouched by building the fixture.
  expect(checkInvariants(BASE, SAMPLES)).toEqual([])
})

test('SB-1 saved results are re-judged against the samples: an edited request invalidates the verified attempt', () => {
  const edited: Samples = deepFreeze({
    ...SAMPLES,
    requests: SAMPLES.requests.map((r) => (r.id === LEGIT ? { ...r, requested: { ...r.requested, account: '3307127' } } : r)),
  })
  expect(checkInvariants(BASE, edited)).toEqual(['results_rederive:A-002', `record_differs_from_samples:${R2}`])
})

test('VR-1 every kernel action on the way to the base is append-only', () => {
  CHAIN.slice(1).forEach((state, i) => {
    const prev = CHAIN[i]
    if (!prev) throw new Error('no previous state')
    expect(appendOnlyProblems(prev, state)).toEqual([])
    expect(() => assertAppendOnly(prev, state)).not.toThrow()
  })
})

const appendOnlyRows: { id: string; name: string; prev: PersistedState; next: PersistedState; problems: string[] }[] = [
  {
    id: 'VR-1',
    name: 'an earlier record edited',
    prev: BASE,
    next: broken((s) => {
      recordAt(s, 0).reason = 'edited'
    }),
    problems: [`record_changed:${R1}`],
  },
  {
    id: 'VR-1',
    name: 'earlier records reordered',
    prev: BASE,
    next: broken((s) => {
      s.records = [recordAt(s, 1), recordAt(s, 0), recordAt(s, 2)]
    }),
    problems: [`record_changed:${R1}`, `record_changed:${R2}`],
  },
  {
    id: 'VR-1',
    name: 'an earlier record removed',
    prev: BASE,
    next: broken((s) => {
      s.records.shift()
    }),
    problems: [`record_changed:${R1}`, `record_changed:${R2}`, `record_changed:${R3}`],
  },
  {
    id: 'VR-1',
    name: "an earlier attempt's stated account rewritten",
    prev: BASE,
    next: broken((s) => {
      const stated = attemptAt(s, 0).stated
      if (stated) stated.account = '73419020'
    }),
    problems: ['attempt_changed:A-001'],
  },
  {
    id: 'VR-1',
    name: 'an earlier attempt removed',
    prev: BASE,
    next: broken((s) => {
      s.attempts.pop()
    }),
    problems: ['attempt_changed:A-004'],
  },
  {
    id: 'VR-1',
    name: 'compared → saved that also changes the person spoken to',
    prev: s1,
    next: broken((s) => {
      attemptAt(s, 0).personSpokenTo = 'Someone Else'
    }, s2),
    problems: ['attempt_changed:A-001'],
  },
  {
    id: 'VR-1',
    name: 'a save undone (saved → compared, record dropped)',
    prev: s2,
    next: s1,
    problems: [`record_changed:${R1}`, 'attempt_changed:A-001'],
  },
]

test.each(appendOnlyRows)('$id append-only: $name', ({ prev, next, problems }) => {
  expect(appendOnlyProblems(prev, next)).toEqual(problems)
  expect(() => assertAppendOnly(prev, next)).toThrow(problems[0])
})

test('VR-1 append-only: the single compared → saved step is the only change allowed to an earlier attempt', () => {
  expect(appendOnlyProblems(s1, s2)).toEqual([])
  expect(appendOnlyProblems(s3, s4)).toEqual([])
  // Two comparisons saved in one action is two steps, not one.
  const both = step(s1, lockAndCompare(s1, LEGIT, legitAnswers, at('2026-10-25T19:49:00Z')))
  const oneSaved = step(both, saveAttempt(both, 'A-001', at('2026-10-25T19:50:00Z')))
  const twoSaved = step(oneSaved, saveAttempt(oneSaved, 'A-002', at('2026-10-25T19:51:00Z')))
  expect(appendOnlyProblems(both, oneSaved)).toEqual([])
  expect(appendOnlyProblems(oneSaved, twoSaved)).toEqual([])
  expect(appendOnlyProblems(both, twoSaved)).toEqual(['more_than_one_save:2'])
})
