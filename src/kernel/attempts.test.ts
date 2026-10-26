import { expect, test } from 'vitest'
import { SAMPLES } from '../data/samples'
import {
  callbackView,
  canStartAttempt,
  deriveRequestView,
  lockAndCompare,
  missingAnswers,
  paymentStatusForPayment,
  paymentStatusOf,
  phaseOf,
  saveAttempt,
} from './attempts'
import { buildRecord, recordResultLabel } from './record'
import type { Answers, Attempt, Ctx, KernelResult, PersistedState, Phase } from './types'

// Every input is deep-frozen, so any in-place change (a push, a property write) throws.
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

const ctx: Ctx = deepFreeze({ samples: SAMPLES, now: new Date('2026-10-25T19:42:00Z'), timeZone: 'America/Toronto' })
const at = (iso: string): Ctx => deepFreeze({ ...ctx, now: new Date(iso) })
const EMPTY: PersistedState = deepFreeze({ version: 1, attempts: [], records: [] })
const MISMATCH = 'req-mismatch'
const LEGIT = 'req-legit'

// The supplier's demo lines: the account ends 4471, the email asked for …9020.
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
const blankAnswers: Answers = deepFreeze({ payeeName: '', institution: '', transit: '', account: '', personSpokenTo: '' })

type Ok = Extract<KernelResult, { ok: true }>
function ok(result: KernelResult): Ok {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
  return result
}
const next = (result: KernelResult): PersistedState => deepFreeze(ok(result).state)

// States reached only through the kernel, one per phase.
const pending = next(lockAndCompare(EMPTY, MISMATCH, mismatchAnswers, ctx)) // A-001 compared, mismatch
const heldMismatch = next(saveAttempt(pending, 'A-001', ctx))
const pendingMatch = next(lockAndCompare(EMPTY, MISMATCH, matchingAnswers, ctx)) // A-001 compared, verified
const verified = next(saveAttempt(pendingMatch, 'A-001', ctx))
const retryPending = next(lockAndCompare(heldMismatch, MISMATCH, matchingAnswers, ctx)) // A-002 compared, verified

// A saved couldn't-verify attempt, hand-built until saveCouldntVerify exists, with its record so the
// state stays consistent.
function savedIncomplete(reason: string): PersistedState {
  const attempt: Attempt = {
    id: 'A-001',
    requestId: MISMATCH,
    status: 'saved',
    outcome: 'couldnt_verify',
    stated: null,
    personSpokenTo: null,
    results: { payeeName: 'not_checked', institution: 'not_checked', transit: 'not_checked', account: 'not_checked' },
    reason,
    comparedAt: null,
    savedAt: ctx.now.toISOString(),
    recordId: 'PC-20261025-154200-001',
  }
  return deepFreeze({ version: 1, attempts: [attempt], records: [buildRecord(attempt, ctx, 1)] })
}

type LifecycleRow = {
  id: string
  name: string
  from: PersistedState
  phase: Phase
  act: (s: PersistedState) => KernelResult
  then?: Phase
  refused?: string
}

// One row per cell of the lifecycle table reachable without saveCouldntVerify.
const lifecycle: LifecycleRow[] = [
  {
    id: 'OS-4',
    name: 'needs_verification × lockAndCompare',
    from: EMPTY,
    phase: 'needs_verification',
    act: (s) => lockAndCompare(s, MISMATCH, mismatchAnswers, ctx),
    then: 'pending',
  },
  {
    id: 'OS-4 CR-1',
    name: 'needs_verification × blank → missing',
    from: EMPTY,
    phase: 'needs_verification',
    act: (s) => lockAndCompare(s, MISMATCH, blankAnswers, ctx),
    refused: 'missing',
  },
  {
    id: 'OS-4',
    name: 'needs_verification × saveAttempt',
    from: EMPTY,
    phase: 'needs_verification',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    refused: 'unknown_attempt',
  },
  {
    id: 'OS-4 CR-2',
    name: 'pending × lockAndCompare',
    from: pending,
    phase: 'pending',
    act: (s) => lockAndCompare(s, MISMATCH, matchingAnswers, ctx),
    refused: 'pending_comparison',
  },
  {
    id: 'OS-4',
    name: 'pending × saveAttempt (mismatch)',
    from: pending,
    phase: 'pending',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    then: 'held_mismatch',
  },
  {
    id: 'OS-4',
    name: 'pending × saveAttempt (verified)',
    from: pendingMatch,
    phase: 'pending',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    then: 'verified',
  },
  {
    id: 'OS-4 RT-1',
    name: 'retry pending × saveAttempt',
    from: retryPending,
    phase: 'pending',
    act: (s) => saveAttempt(s, 'A-002', ctx),
    then: 'verified',
  },
  {
    id: 'OS-4 RT-1',
    name: 'held_mismatch × lockAndCompare',
    from: heldMismatch,
    phase: 'held_mismatch',
    act: (s) => lockAndCompare(s, MISMATCH, matchingAnswers, ctx),
    then: 'pending',
  },
  {
    id: 'OS-4 CR-1',
    name: 'held_mismatch × blank → missing',
    from: heldMismatch,
    phase: 'held_mismatch',
    act: (s) => lockAndCompare(s, MISMATCH, blankAnswers, ctx),
    refused: 'missing',
  },
  {
    id: 'OS-4',
    name: 'held_mismatch × saveAttempt',
    from: heldMismatch,
    phase: 'held_mismatch',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    refused: 'not_compared',
  },
  {
    id: 'OS-4 RT-3',
    name: 'verified × lockAndCompare',
    from: verified,
    phase: 'verified',
    act: (s) => lockAndCompare(s, MISMATCH, matchingAnswers, ctx),
    refused: 'verified',
  },
  {
    id: 'OS-4',
    name: 'verified × saveAttempt',
    from: verified,
    phase: 'verified',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    refused: 'not_compared',
  },
]

test.each(lifecycle)('$id $name', ({ from, phase, act, then, refused }) => {
  expect(phaseOf(from, MISMATCH)).toBe(phase)
  const result = act(from)
  if (refused !== undefined) {
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(refused)
  } else {
    expect(phaseOf(ok(result).state, MISMATCH)).toBe(then)
    // The other request is never touched.
    expect(phaseOf(ok(result).state, LEGIT)).toBe('needs_verification')
  }
})

const startRows = [
  { id: 'OS-4', name: 'needs_verification × Start', from: EMPTY, phase: 'needs_verification', canStart: true },
  { id: 'OS-4', name: 'pending × Start', from: pending, phase: 'pending', canStart: false },
  { id: 'OS-4 RT-1', name: 'held_mismatch × Start', from: heldMismatch, phase: 'held_mismatch', canStart: true },
  { id: 'OS-4 RT-3', name: 'verified × Start', from: verified, phase: 'verified', canStart: false },
]

test.each(startRows)('$id $name', ({ from, phase, canStart }) => {
  expect(phaseOf(from, MISMATCH)).toBe(phase)
  expect(canStartAttempt(from, MISMATCH)).toBe(canStart)
  expect(deriveRequestView(from, MISMATCH, SAMPLES)?.canStart).toBe(canStart)
})

const refusalOrder = [
  {
    id: 'OS-4',
    name: 'unknown request before missing',
    run: () => lockAndCompare(EMPTY, 'req-nope', blankAnswers, ctx),
    reason: 'unknown_request',
  },
  {
    id: 'OS-4 RT-3',
    name: 'verified before missing',
    run: () => lockAndCompare(verified, MISMATCH, blankAnswers, ctx),
    reason: 'verified',
  },
  {
    id: 'OS-4 CR-2',
    name: 'pending_comparison before missing',
    run: () => lockAndCompare(pending, MISMATCH, blankAnswers, ctx),
    reason: 'pending_comparison',
  },
  {
    id: 'OS-4',
    name: 'saveAttempt: unknown attempt',
    run: () => saveAttempt(heldMismatch, 'A-009', ctx),
    reason: 'unknown_attempt',
  },
  {
    id: 'OS-4',
    name: 'saveAttempt: not the pending one',
    run: () => saveAttempt(retryPending, 'A-001', ctx),
    reason: 'not_compared',
  },
]

test.each(refusalOrder)('$id refusal order: $name', ({ run, reason }) => {
  expect(run()).toEqual({ ok: false, reason })
})

const FORM_ORDER = ['payeeName', 'institution', 'transit', 'account', 'personSpokenTo'] as const

const missingRows = [
  ...FORM_ORDER.map((key) => ({
    id: 'CR-1',
    name: `${key} blank`,
    answers: { ...matchingAnswers, [key]: '' },
    missing: [key] as string[],
  })),
  { id: 'CR-1', name: 'all blank', answers: blankAnswers, missing: [...FORM_ORDER] as string[] },
  {
    id: 'CR-1',
    name: 'whitespace-only',
    answers: { ...matchingAnswers, account: ' \t\n ', personSpokenTo: '   ' },
    missing: ['account', 'personSpokenTo'],
  },
  {
    id: 'CR-1',
    name: 'NBSP-only',
    answers: { ...matchingAnswers, institution: ' ', transit: '  ' },
    missing: ['institution', 'transit'],
  },
  {
    id: 'CR-1',
    name: 'zero-width-only',
    answers: { ...matchingAnswers, payeeName: '​', personSpokenTo: '⁠​' },
    missing: ['payeeName', 'personSpokenTo'],
  },
  {
    id: 'CR-1',
    name: 'listed in form order',
    answers: { ...matchingAnswers, personSpokenTo: '', payeeName: ' ' },
    missing: ['payeeName', 'personSpokenTo'],
  },
]

test.each(missingRows)('$id missing: $name', ({ answers, missing }) => {
  const frozen: Answers = deepFreeze(answers)
  expect(missingAnswers(frozen)).toEqual(missing)
  // Matching values everywhere else, so only the blank keeps this from "Verified".
  expect(lockAndCompare(EMPTY, MISMATCH, frozen, ctx)).toEqual({ ok: false, reason: 'missing', missing })
  expect(lockAndCompare(heldMismatch, MISMATCH, frozen, ctx)).toEqual({ ok: false, reason: 'missing', missing })
})

test('CR-2 a second lockAndCompare on a pending comparison → pending_comparison', () => {
  expect(lockAndCompare(pending, MISMATCH, mismatchAnswers, ctx)).toEqual({ ok: false, reason: 'pending_comparison' })
  expect(lockAndCompare(pendingMatch, MISMATCH, mismatchAnswers, ctx)).toEqual({ ok: false, reason: 'pending_comparison' })
})

test('CR-2 CR-5 lockAndCompare appends a locked attempt with the answers exactly as typed', () => {
  const typed: Answers = deepFreeze({
    payeeName: '  harbourline LUMBER ltd. ',
    institution: '952',
    transit: '60 415',
    account: '7341 4471',
    personSpokenTo: ' Sam Okafor ',
  })
  const result = ok(lockAndCompare(EMPTY, MISMATCH, typed, ctx))
  expect(result.attemptId).toBe('A-001')
  expect(result.recordId).toBeNull()
  expect(result.state.records).toEqual([])
  expect(result.state.attempts).toEqual([
    {
      id: 'A-001',
      requestId: 'req-mismatch',
      status: 'compared',
      outcome: 'mismatch',
      stated: { payeeName: '  harbourline LUMBER ltd. ', institution: '952', transit: '60 415', account: '7341 4471' },
      personSpokenTo: ' Sam Okafor ',
      results: { payeeName: 'match', institution: 'match', transit: 'match', account: 'mismatch' },
      reason: '',
      comparedAt: '2026-10-25T19:42:00.000Z',
      savedAt: null,
      recordId: null,
    },
  ])
  expect(EMPTY.attempts).toEqual([])
})

test('OS-4 a pending comparison blocks only its own request', () => {
  const both = next(lockAndCompare(pending, LEGIT, legitAnswers, ctx))
  expect(both.attempts.map((a) => a.id)).toEqual(['A-001', 'A-002'])
  expect(phaseOf(both, MISMATCH)).toBe('pending')
  expect(phaseOf(both, LEGIT)).toBe('pending')
  expect(both.attempts[1]?.outcome).toBe('verified')
})

test('OS-1 an unsaved verified comparison leaves the payment "On hold—verification needed"', () => {
  expect(phaseOf(pendingMatch, MISMATCH)).toBe('pending')
  expect(pendingMatch.attempts[0]?.outcome).toBe('verified')
  expect(paymentStatusOf(pendingMatch, MISMATCH)).toBe('On hold—verification needed')
  expect(deriveRequestView(pendingMatch, MISMATCH, SAMPLES)?.requestVerified).toBe(false)
  // Only Save attempt releases it.
  expect(paymentStatusOf(verified, MISMATCH)).toBe('Ready to pay')
  expect(deriveRequestView(verified, MISMATCH, SAMPLES)?.requestVerified).toBe(true)
})

test('OS-1 OS-2 an unsaved verified retry keeps "On hold—details do not match"', () => {
  expect(phaseOf(retryPending, MISMATCH)).toBe('pending')
  expect(paymentStatusOf(retryPending, MISMATCH)).toBe('On hold—details do not match')
})

test('OS-2 a saved mismatch → "On hold—details do not match"', () => {
  expect(phaseOf(heldMismatch, MISMATCH)).toBe('held_mismatch')
  expect(paymentStatusOf(heldMismatch, MISMATCH)).toBe('On hold—details do not match')
  const payment = SAMPLES.payments.find((p) => p.requestId === MISMATCH)
  if (!payment) throw new Error('mismatch payment missing from samples')
  expect(paymentStatusForPayment(heldMismatch, payment)).toBe('On hold—details do not match')
})

test('OV-3 with no attempts both flagged payments read "On hold—verification needed"', () => {
  expect(SAMPLES.payments.map((p) => paymentStatusForPayment(EMPTY, p))).toEqual([
    'On hold—verification needed',
    'Scheduled',
    'On hold—verification needed',
    'Scheduled',
    'Scheduled',
  ])
  expect(paymentStatusOf(EMPTY, MISMATCH)).toBe('On hold—verification needed')
  expect(paymentStatusOf(EMPTY, LEGIT)).toBe('On hold—verification needed')
})

test('OV-4 a payment without a request is "Scheduled", whatever else is saved', () => {
  const plain = SAMPLES.payments.filter((p) => p.requestId === undefined)
  expect(plain).toHaveLength(3)
  for (const state of [EMPTY, pending, heldMismatch, verified]) {
    for (const payment of plain) expect(paymentStatusForPayment(state, payment)).toBe('Scheduled')
  }
})

test('RT-3 lockAndCompare on a verified request → verified, and it cannot start again', () => {
  expect(lockAndCompare(verified, MISMATCH, mismatchAnswers, ctx)).toEqual({ ok: false, reason: 'verified' })
  expect(canStartAttempt(verified, MISMATCH)).toBe(false)
})

test('RT-1 a new attempt can start after a saved mismatch or a saved couldn\'t-verify', () => {
  expect(canStartAttempt(heldMismatch, MISMATCH)).toBe(true)
  const incomplete = savedIncomplete('No answer')
  expect(phaseOf(incomplete, MISMATCH)).toBe('held_incomplete')
  expect(canStartAttempt(incomplete, MISMATCH)).toBe(true)
  expect(ok(lockAndCompare(incomplete, MISMATCH, matchingAnswers, ctx)).attemptId).toBe('A-002')
})

test('OS-3 a saved couldn\'t-verify → "On hold—verification incomplete" with its reason', () => {
  const noAnswer = savedIncomplete('No answer')
  expect(paymentStatusOf(noAnswer, MISMATCH)).toBe('On hold—verification incomplete')
  expect(deriveRequestView(noAnswer, MISMATCH, SAMPLES)?.reason).toBe('No answer')
  expect(deriveRequestView(savedIncomplete('  ​'), MISMATCH, SAMPLES)?.reason).toBe('No reason recorded')
  // A retry left unsaved changes neither the status nor the reason shown beside it.
  const retry = next(lockAndCompare(noAnswer, MISMATCH, matchingAnswers, ctx))
  expect(paymentStatusOf(retry, MISMATCH)).toBe('On hold—verification incomplete')
  expect(deriveRequestView(retry, MISMATCH, SAMPLES)?.reason).toBe('No answer')
  expect(deriveRequestView(heldMismatch, MISMATCH, SAMPLES)?.reason).toBeNull()
})

test('OS-4 phaseOf follows array order, never timestamps', () => {
  // The retry is saved with a clock set back before the first save.
  const first = next(saveAttempt(pending, 'A-001', at('2026-10-25T19:42:00Z')))
  const retry = next(lockAndCompare(first, MISMATCH, matchingAnswers, at('2026-10-01T12:00:00Z')))
  const second = next(saveAttempt(retry, 'A-002', at('2026-10-01T12:00:00Z')))
  expect(phaseOf(second, MISMATCH)).toBe('verified')
  expect(paymentStatusOf(second, MISMATCH)).toBe('Ready to pay')
})

test('OS-4 deriveRequestView reads the same phase as every guard', () => {
  const view = deriveRequestView(retryPending, MISMATCH, SAMPLES)
  expect(view).not.toBeNull()
  expect(view?.request.id).toBe('req-mismatch')
  expect(view?.supplier.id).toBe('sup-harbourline')
  expect(view?.payment.id).toBe('pay-1041')
  expect(view?.phase).toBe('pending')
  expect(view?.paymentStatus).toBe('On hold—details do not match')
  expect(view?.pending?.id).toBe('A-002')
  expect(view?.savedAttempts.map((a) => a.id)).toEqual(['A-001'])
  expect(view?.canStart).toBe(false)
  expect(deriveRequestView(EMPTY, 'req-nope', SAMPLES)).toBeNull()
  expect(deriveRequestView(heldMismatch, MISMATCH, SAMPLES)?.pending).toBeNull()
})

test('CB-1 CB-4 callbackView carries only the supplier name and the on-file phone', () => {
  const view = callbackView(MISMATCH, SAMPLES)
  expect(view).toEqual({ requestId: 'req-mismatch', supplierName: 'Harbourline Lumber Ltd.', trustedNumber: '519-555-0142' })
  expect(Object.keys(view ?? {})).toEqual(['requestId', 'supplierName', 'trustedNumber'])
  expect(callbackView('req-nope', SAMPLES)).toBeNull()
})

test('VR-2 saveAttempt writes a dated record with every PRD field, snapshotted at save time', () => {
  const saved = ok(saveAttempt(pending, 'A-001', ctx))
  expect(saved.attemptId).toBe('A-001')
  expect(saved.recordId).toBe('PC-20261025-154200-001')
  expect(saved.state.attempts).toEqual([
    {
      ...pending.attempts[0],
      status: 'saved',
      savedAt: '2026-10-25T19:42:00.000Z',
      recordId: 'PC-20261025-154200-001',
    },
  ])
  expect(saved.state.records).toEqual([
    {
      id: 'PC-20261025-154200-001',
      attemptId: 'A-001',
      requestId: 'req-mismatch',
      savedAt: '2026-10-25T19:42:00.000Z',
      timeZone: 'America/Toronto',
      supplierName: 'Harbourline Lumber Ltd.',
      paymentRef: 'PR-2026-1041',
      amountCents: 1248000,
      dueDate: '2026-10-30',
      emailRef: 'Updated banking details for Harbourline Lumber Ltd. (received Oct 23, 2026)',
      trustedNumber: '519-555-0142',
      personSpokenTo: 'Sam Okafor',
      requested: { payeeName: 'Harbourline Lumber Ltd.', institution: '952', transit: '60415', account: '73419020' },
      stated: { payeeName: 'Harbourline Lumber Ltd.', institution: '952', transit: '60415', account: '73414471' },
      results: { payeeName: 'match', institution: 'match', transit: 'match', account: 'mismatch' },
      outcome: 'mismatch',
      reason: '',
      resultingPaymentStatus: 'On hold—details do not match',
      label: 'Fictional sample data—no real call or payment',
    },
  ])
  // The input state is unchanged: still one compared attempt and no record.
  expect(pending.attempts[0]?.status).toBe('compared')
  expect(pending.records).toEqual([])
})

test('VR-1 saving a retry appends a record and never changes the earlier one', () => {
  const firstRecord = structuredClone(heldMismatch.records[0])
  const firstAttempt = structuredClone(heldMismatch.attempts[0])
  // Same instant on purpose: the position alone keeps the IDs apart.
  const later = ok(saveAttempt(retryPending, 'A-002', ctx)).state
  expect(later.records).toHaveLength(2)
  expect(later.records[0]).toEqual(firstRecord)
  expect(later.attempts[0]).toEqual(firstAttempt)
  expect(later.records[0]?.id).toBe('PC-20261025-154200-001')
  expect(later.records[1]?.id).toBe('PC-20261025-154200-002')
  expect(later.records[0]?.resultingPaymentStatus).toBe('On hold—details do not match')
  expect(later.records[1]?.resultingPaymentStatus).toBe('Ready to pay')
  expect(later.attempts.map((a) => a.recordId)).toEqual(['PC-20261025-154200-001', 'PC-20261025-154200-002'])
  expect(paymentStatusOf(later, MISMATCH)).toBe('Ready to pay')
})

test('VR-4 recordResultLabel: same last four → "Does not match (differs before the last four digits)"', () => {
  const lookalike = next(lockAndCompare(EMPTY, MISMATCH, { ...matchingAnswers, account: '73429020' }, ctx))
  const record = next(saveAttempt(lookalike, 'A-001', ctx)).records[0]
  if (!record) throw new Error('no record')
  expect(recordResultLabel('account', record)).toBe('Does not match (differs before the last four digits)')
  expect(recordResultLabel('payeeName', record)).toBe('Matches')

  const demo = heldMismatch.records[0]
  if (!demo) throw new Error('no record')
  expect(recordResultLabel('account', demo)).toBe('Does not match')
  expect(recordResultLabel('institution', demo)).toBe('Matches')

  const notChecked = savedIncomplete('').records[0]
  if (!notChecked) throw new Error('no record')
  expect(recordResultLabel('account', notChecked)).toBe('Not checked')
})
