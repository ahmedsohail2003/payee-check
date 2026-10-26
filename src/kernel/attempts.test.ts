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
  saveCouldntVerify,
  type CouldntVerifyInput,
} from './attempts'
import { comparisonLine } from './compare'
import { assertAppendOnly, checkInvariants } from './invariants'
import { recordResultLabel } from './record'
import type { Answers, Ctx, FieldKey, KernelResult, PaymentStatus, PersistedState, Phase } from './types'

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
const FIELDS: FieldKey[] = ['payeeName', 'institution', 'transit', 'account']
const NOT_CHECKED = { payeeName: 'not_checked', institution: 'not_checked', transit: 'not_checked', account: 'not_checked' }

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
const noAnswer: CouldntVerifyInput = deepFreeze({ reason: 'No answer' })

type Ok = Extract<KernelResult, { ok: true }>
function ok(result: KernelResult): Ok {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
  return result
}

// Every fixture state is reached through the kernel, and each step is held to the same rules as a lifecycle
// row: accepted, the invariants hold, nothing earlier changed. Then it is frozen for the next step.
function step(from: PersistedState, act: (s: PersistedState) => KernelResult): PersistedState {
  const { state } = ok(act(from))
  const problems = checkInvariants(state, SAMPLES)
  if (problems.length > 0) throw new Error(`invariants: ${problems.join(', ')}`)
  assertAppendOnly(from, state)
  return deepFreeze(state)
}

// States reached only through the kernel, one per phase.
const pending = step(EMPTY, (s) => lockAndCompare(s, MISMATCH, mismatchAnswers, ctx)) // A-001 compared, mismatch
const heldMismatch = step(pending, (s) => saveAttempt(s, 'A-001', ctx))
const pendingMatch = step(EMPTY, (s) => lockAndCompare(s, MISMATCH, matchingAnswers, ctx)) // A-001 compared, verified
const verified = step(pendingMatch, (s) => saveAttempt(s, 'A-001', ctx))
const retryPending = step(heldMismatch, (s) => lockAndCompare(s, MISMATCH, matchingAnswers, ctx)) // A-002 compared, verified
const legitPending = step(EMPTY, (s) => lockAndCompare(s, LEGIT, legitAnswers, ctx)) // Cedarline A-001 compared, verified
const legitVerified = step(legitPending, (s) => saveAttempt(s, 'A-001', ctx))
const heldIncomplete = step(EMPTY, (s) => saveCouldntVerify(s, MISMATCH, noAnswer, ctx)) // A-001 saved, couldn't verify
const incompleteAfterMismatch = step(heldMismatch, (s) => saveCouldntVerify(s, MISMATCH, noAnswer, ctx)) // A-002
const incompleteRetryPending = step(heldIncomplete, (s) => lockAndCompare(s, MISMATCH, matchingAnswers, ctx)) // A-002 compared
const legitIncomplete = step(EMPTY, (s) => saveCouldntVerify(s, LEGIT, {}, ctx))

const NEEDED: PaymentStatus = 'On hold—verification needed'
const HELD_MISMATCH: PaymentStatus = 'On hold—details do not match'
const INCOMPLETE: PaymentStatus = 'On hold—verification incomplete'
const READY: PaymentStatus = 'Ready to pay'

type LifecycleRow = {
  id: string
  name: string
  from: PersistedState
  request?: string // MISMATCH unless named
  phase: Phase
  act: (s: PersistedState) => KernelResult
  then?: Phase
  refused?: string
  status: PaymentStatus // the request's payment status afterwards; a refusal leaves it as it was
}

// One row per cell of the lifecycle table.
const lifecycle: LifecycleRow[] = [
  {
    id: 'OS-4',
    name: 'needs_verification × lockAndCompare',
    from: EMPTY,
    phase: 'needs_verification',
    act: (s) => lockAndCompare(s, MISMATCH, mismatchAnswers, ctx),
    then: 'pending',
    status: NEEDED,
  },
  {
    id: 'OS-4 CR-1',
    name: 'needs_verification × blank → missing',
    from: EMPTY,
    phase: 'needs_verification',
    act: (s) => lockAndCompare(s, MISMATCH, blankAnswers, ctx),
    refused: 'missing',
    status: NEEDED,
  },
  {
    id: 'OS-4',
    name: 'needs_verification × saveAttempt',
    from: EMPTY,
    phase: 'needs_verification',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    refused: 'unknown_attempt',
    status: NEEDED,
  },
  {
    id: 'OS-4 OS-3 CB-6',
    name: 'needs_verification × saveCouldntVerify',
    from: EMPTY,
    phase: 'needs_verification',
    act: (s) => saveCouldntVerify(s, MISMATCH, noAnswer, ctx),
    then: 'held_incomplete',
    status: INCOMPLETE,
  },
  {
    id: 'OS-4',
    name: 'needs_verification × lockAndCompare beside a verified request',
    from: legitVerified,
    phase: 'needs_verification',
    act: (s) => lockAndCompare(s, MISMATCH, mismatchAnswers, ctx),
    then: 'pending',
    status: NEEDED,
  },
  {
    id: 'OS-4 OS-3',
    name: 'needs_verification × saveCouldntVerify beside a verified request',
    from: legitVerified,
    phase: 'needs_verification',
    act: (s) => saveCouldntVerify(s, MISMATCH, {}, ctx),
    then: 'held_incomplete',
    status: INCOMPLETE,
  },
  {
    id: 'OS-4 CR-2',
    name: 'pending × lockAndCompare',
    from: pending,
    phase: 'pending',
    act: (s) => lockAndCompare(s, MISMATCH, matchingAnswers, ctx),
    refused: 'pending_comparison',
    status: NEEDED,
  },
  {
    id: 'OS-4 OS-2',
    name: 'pending × saveAttempt (mismatch)',
    from: pending,
    phase: 'pending',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    then: 'held_mismatch',
    status: HELD_MISMATCH,
  },
  {
    id: 'OS-4 OS-1',
    name: 'pending × saveAttempt (verified)',
    from: pendingMatch,
    phase: 'pending',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    then: 'verified',
    status: READY,
  },
  {
    id: 'OS-4',
    name: 'pending × saveCouldntVerify',
    from: pending,
    phase: 'pending',
    act: (s) => saveCouldntVerify(s, MISMATCH, noAnswer, ctx),
    refused: 'pending_comparison',
    status: NEEDED,
  },
  {
    id: 'OS-4 RT-1',
    name: 'retry pending × saveAttempt',
    from: retryPending,
    phase: 'pending',
    act: (s) => saveAttempt(s, 'A-002', ctx),
    then: 'verified',
    status: READY,
  },
  {
    id: 'OS-4',
    name: 'retry pending × saveCouldntVerify',
    from: retryPending,
    phase: 'pending',
    act: (s) => saveCouldntVerify(s, MISMATCH, noAnswer, ctx),
    refused: 'pending_comparison',
    status: HELD_MISMATCH,
  },
  {
    id: 'OS-4 RT-1',
    name: 'retry after couldn\'t verify, pending × saveAttempt',
    from: incompleteRetryPending,
    phase: 'pending',
    act: (s) => saveAttempt(s, 'A-002', ctx),
    then: 'verified',
    status: READY,
  },
  {
    id: 'OS-4',
    name: 'retry after couldn\'t verify, pending × saveCouldntVerify',
    from: incompleteRetryPending,
    phase: 'pending',
    act: (s) => saveCouldntVerify(s, MISMATCH, {}, ctx),
    refused: 'pending_comparison',
    status: INCOMPLETE,
  },
  {
    id: 'OS-4 RT-1',
    name: 'held_mismatch × lockAndCompare',
    from: heldMismatch,
    phase: 'held_mismatch',
    act: (s) => lockAndCompare(s, MISMATCH, matchingAnswers, ctx),
    then: 'pending',
    status: HELD_MISMATCH,
  },
  {
    id: 'OS-4 CR-1',
    name: 'held_mismatch × blank → missing',
    from: heldMismatch,
    phase: 'held_mismatch',
    act: (s) => lockAndCompare(s, MISMATCH, blankAnswers, ctx),
    refused: 'missing',
    status: HELD_MISMATCH,
  },
  {
    id: 'OS-4',
    name: 'held_mismatch × saveAttempt',
    from: heldMismatch,
    phase: 'held_mismatch',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    refused: 'not_compared',
    status: HELD_MISMATCH,
  },
  {
    id: 'OS-4 OS-3 RT-1',
    name: 'held_mismatch × saveCouldntVerify (a new attempt)',
    from: heldMismatch,
    phase: 'held_mismatch',
    act: (s) => saveCouldntVerify(s, MISMATCH, noAnswer, ctx),
    then: 'held_incomplete',
    status: INCOMPLETE,
  },
  {
    id: 'OS-4 RT-1',
    name: 'held_incomplete × lockAndCompare',
    from: heldIncomplete,
    phase: 'held_incomplete',
    act: (s) => lockAndCompare(s, MISMATCH, matchingAnswers, ctx),
    then: 'pending',
    status: INCOMPLETE,
  },
  {
    id: 'OS-4 CR-1',
    name: 'held_incomplete × blank → missing',
    from: heldIncomplete,
    phase: 'held_incomplete',
    act: (s) => lockAndCompare(s, MISMATCH, blankAnswers, ctx),
    refused: 'missing',
    status: INCOMPLETE,
  },
  {
    id: 'OS-4',
    name: 'held_incomplete × saveAttempt',
    from: heldIncomplete,
    phase: 'held_incomplete',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    refused: 'not_compared',
    status: INCOMPLETE,
  },
  {
    id: 'OS-4 OS-3 RT-1',
    name: 'held_incomplete × saveCouldntVerify (a new attempt)',
    from: heldIncomplete,
    phase: 'held_incomplete',
    act: (s) => saveCouldntVerify(s, MISMATCH, { reason: "Supplier couldn't confirm" }, ctx),
    then: 'held_incomplete',
    status: INCOMPLETE,
  },
  {
    id: 'OS-4 RT-3',
    name: 'verified × lockAndCompare',
    from: verified,
    phase: 'verified',
    act: (s) => lockAndCompare(s, MISMATCH, matchingAnswers, ctx),
    refused: 'verified',
    status: READY,
  },
  {
    id: 'OS-4',
    name: 'verified × saveAttempt',
    from: verified,
    phase: 'verified',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    refused: 'not_compared',
    status: READY,
  },
  {
    id: 'OS-4 RT-3',
    name: 'verified × saveCouldntVerify',
    from: verified,
    phase: 'verified',
    act: (s) => saveCouldntVerify(s, MISMATCH, noAnswer, ctx),
    refused: 'verified',
    status: READY,
  },
  // The legitimate request (Cedarline), end to end through the same cells.
  {
    id: 'OS-4 OS-1',
    name: 'Cedarline needs_verification × lockAndCompare',
    from: EMPTY,
    request: LEGIT,
    phase: 'needs_verification',
    act: (s) => lockAndCompare(s, LEGIT, legitAnswers, ctx),
    then: 'pending',
    status: NEEDED,
  },
  {
    id: 'OS-4 OS-3',
    name: 'Cedarline needs_verification × saveCouldntVerify',
    from: EMPTY,
    request: LEGIT,
    phase: 'needs_verification',
    act: (s) => saveCouldntVerify(s, LEGIT, {}, ctx),
    then: 'held_incomplete',
    status: INCOMPLETE,
  },
  {
    id: 'OS-4 CR-2',
    name: 'Cedarline pending × lockAndCompare',
    from: legitPending,
    request: LEGIT,
    phase: 'pending',
    act: (s) => lockAndCompare(s, LEGIT, legitAnswers, ctx),
    refused: 'pending_comparison',
    status: NEEDED,
  },
  {
    id: 'OS-4 OS-1',
    name: 'Cedarline pending × saveAttempt',
    from: legitPending,
    request: LEGIT,
    phase: 'pending',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    then: 'verified',
    status: READY,
  },
  {
    id: 'OS-4',
    name: 'Cedarline pending × saveCouldntVerify',
    from: legitPending,
    request: LEGIT,
    phase: 'pending',
    act: (s) => saveCouldntVerify(s, LEGIT, noAnswer, ctx),
    refused: 'pending_comparison',
    status: NEEDED,
  },
  {
    id: 'OS-4 RT-1',
    name: 'Cedarline held_incomplete × lockAndCompare',
    from: legitIncomplete,
    request: LEGIT,
    phase: 'held_incomplete',
    act: (s) => lockAndCompare(s, LEGIT, legitAnswers, ctx),
    then: 'pending',
    status: INCOMPLETE,
  },
  {
    id: 'OS-4 RT-3',
    name: 'Cedarline verified × lockAndCompare',
    from: legitVerified,
    request: LEGIT,
    phase: 'verified',
    act: (s) => lockAndCompare(s, LEGIT, legitAnswers, ctx),
    refused: 'verified',
    status: READY,
  },
  {
    id: 'OS-4 RT-3',
    name: 'Cedarline verified × saveAttempt',
    from: legitVerified,
    request: LEGIT,
    phase: 'verified',
    act: (s) => saveAttempt(s, 'A-001', ctx),
    refused: 'not_compared',
    status: READY,
  },
  {
    id: 'OS-4 RT-3',
    name: 'Cedarline verified × saveCouldntVerify',
    from: legitVerified,
    request: LEGIT,
    phase: 'verified',
    act: (s) => saveCouldntVerify(s, LEGIT, noAnswer, ctx),
    refused: 'verified',
    status: READY,
  },
]

test.each(lifecycle)('$id $name', ({ from, request = MISMATCH, phase, act, then, refused, status }) => {
  const other = request === MISMATCH ? LEGIT : MISMATCH
  expect(checkInvariants(from, SAMPLES)).toEqual([])
  expect(phaseOf(from, request)).toBe(phase)
  const result = act(from) // `from` is deep-frozen, so an in-place change throws here
  if (refused !== undefined) {
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(refused)
    expect(paymentStatusOf(from, request)).toBe(status)
  } else {
    const after = ok(result).state
    expect(checkInvariants(after, SAMPLES)).toEqual([])
    expect(() => assertAppendOnly(from, after)).not.toThrow()
    expect(phaseOf(after, request)).toBe(then)
    expect(paymentStatusOf(after, request)).toBe(status)
    // The other request is never touched.
    expect(phaseOf(after, other)).toBe(phaseOf(from, other))
    expect(paymentStatusOf(after, other)).toBe(paymentStatusOf(from, other))
  }
})

const startRows = [
  { id: 'OS-4', name: 'needs_verification × Start', from: EMPTY, request: MISMATCH, phase: 'needs_verification', canStart: true },
  { id: 'OS-4 RT-1', name: 'pending × Start', from: pending, request: MISMATCH, phase: 'pending', canStart: false },
  { id: 'OS-4 RT-1', name: 'held_mismatch × Start', from: heldMismatch, request: MISMATCH, phase: 'held_mismatch', canStart: true },
  { id: 'OS-4 RT-1', name: 'held_incomplete × Start', from: heldIncomplete, request: MISMATCH, phase: 'held_incomplete', canStart: true },
  {
    id: 'OS-4 RT-1',
    name: 'held_incomplete after a mismatch × Start',
    from: incompleteAfterMismatch,
    request: MISMATCH,
    phase: 'held_incomplete',
    canStart: true,
  },
  {
    id: 'OS-4 RT-1',
    name: 'pending retry after a mismatch × Start',
    from: retryPending,
    request: MISMATCH,
    phase: 'pending',
    canStart: false,
  },
  {
    id: 'OS-4 RT-1',
    name: 'pending retry after couldn\'t verify × Start',
    from: incompleteRetryPending,
    request: MISMATCH,
    phase: 'pending',
    canStart: false,
  },
  { id: 'OS-4 RT-1 RT-3', name: 'verified × Start', from: verified, request: MISMATCH, phase: 'verified', canStart: false },
  { id: 'OS-4', name: 'Cedarline needs_verification × Start', from: EMPTY, request: LEGIT, phase: 'needs_verification', canStart: true },
  { id: 'OS-4 RT-1', name: 'Cedarline held_incomplete × Start', from: legitIncomplete, request: LEGIT, phase: 'held_incomplete', canStart: true },
  { id: 'OS-4', name: 'Cedarline pending × Start', from: legitPending, request: LEGIT, phase: 'pending', canStart: false },
  { id: 'OS-4 RT-3', name: 'Cedarline verified × Start', from: legitVerified, request: LEGIT, phase: 'verified', canStart: false },
]

test.each(startRows)('$id $name', ({ from, request, phase, canStart }) => {
  expect(phaseOf(from, request)).toBe(phase)
  expect(canStartAttempt(from, request)).toBe(canStart)
  expect(deriveRequestView(from, request, SAMPLES)?.canStart).toBe(canStart)
})

// The phase table's Payment status column, through the same view every screen reads.
const phaseTable = [
  { id: 'OS-4', name: 'needs_verification', from: EMPTY, request: LEGIT, phase: 'needs_verification', status: NEEDED, requestVerified: false },
  { id: 'OS-1 OS-4', name: 'pending, nothing saved yet', from: legitPending, request: LEGIT, phase: 'pending', status: NEEDED, requestVerified: false },
  { id: 'OS-1 OS-4', name: 'pending after a saved mismatch', from: retryPending, request: MISMATCH, phase: 'pending', status: HELD_MISMATCH, requestVerified: false },
  {
    id: 'OS-3 OS-4',
    name: 'pending after a saved couldn\'t-verify',
    from: incompleteRetryPending,
    request: MISMATCH,
    phase: 'pending',
    status: INCOMPLETE,
    requestVerified: false,
  },
  { id: 'OS-2 OS-4', name: 'held_mismatch', from: heldMismatch, request: MISMATCH, phase: 'held_mismatch', status: HELD_MISMATCH, requestVerified: false },
  { id: 'OS-3 OS-4', name: 'held_incomplete', from: heldIncomplete, request: MISMATCH, phase: 'held_incomplete', status: INCOMPLETE, requestVerified: false },
  {
    id: 'OS-3 OS-4',
    name: 'held_incomplete after a mismatch',
    from: incompleteAfterMismatch,
    request: MISMATCH,
    phase: 'held_incomplete',
    status: INCOMPLETE,
    requestVerified: false,
  },
  { id: 'OS-1 OS-4', name: 'verified (Cedarline)', from: legitVerified, request: LEGIT, phase: 'verified', status: READY, requestVerified: true },
  { id: 'OS-1 OS-4', name: 'verified (Harbourline, all four matching)', from: verified, request: MISMATCH, phase: 'verified', status: READY, requestVerified: true },
]

test.each(phaseTable)('$id phase table: $name', ({ from, request, phase, status, requestVerified }) => {
  const view = deriveRequestView(from, request, SAMPLES)
  expect(view?.phase).toBe(phase)
  expect(view?.paymentStatus).toBe(status)
  expect(view?.requestVerified).toBe(requestVerified)
  expect(paymentStatusOf(from, request)).toBe(status)
  const payment = SAMPLES.payments.find((p) => p.requestId === request)
  if (!payment) throw new Error(`no payment for ${request}`)
  expect(paymentStatusForPayment(from, payment)).toBe(status)
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
  {
    id: 'OS-4',
    name: 'saveAttempt: a saved couldn\'t-verify attempt',
    run: () => saveAttempt(incompleteAfterMismatch, 'A-002', ctx),
    reason: 'not_compared',
  },
  {
    id: 'OS-4',
    name: 'saveCouldntVerify: unknown request',
    run: () => saveCouldntVerify(EMPTY, 'req-nope', noAnswer, ctx),
    reason: 'unknown_request',
  },
  {
    id: 'OS-4',
    name: 'saveCouldntVerify: unknown request beside a verified one',
    run: () => saveCouldntVerify(verified, 'req-nope', {}, ctx),
    reason: 'unknown_request',
  },
  {
    id: 'OS-4 RT-3',
    name: 'saveCouldntVerify: verified',
    run: () => saveCouldntVerify(verified, MISMATCH, {}, ctx),
    reason: 'verified',
  },
  {
    id: 'OS-4',
    name: 'saveCouldntVerify: pending comparison',
    run: () => saveCouldntVerify(pending, MISMATCH, {}, ctx),
    reason: 'pending_comparison',
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
    answers: { ...matchingAnswers, institution: '\u00a0', transit: '\u202f\u00a0' },
    missing: ['institution', 'transit'],
  },
  {
    id: 'CR-1',
    name: 'zero-width-only',
    answers: { ...matchingAnswers, payeeName: '\u200b', personSpokenTo: '\u2060\u200b' },
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
  expect(lockAndCompare(heldIncomplete, MISMATCH, frozen, ctx)).toEqual({ ok: false, reason: 'missing', missing })
})

test('CR-2 a second lockAndCompare on a pending comparison → pending_comparison', () => {
  expect(lockAndCompare(pending, MISMATCH, mismatchAnswers, ctx)).toEqual({ ok: false, reason: 'pending_comparison' })
  expect(lockAndCompare(pendingMatch, MISMATCH, mismatchAnswers, ctx)).toEqual({ ok: false, reason: 'pending_comparison' })
  // Different answers can't replace a revealed comparison either.
  expect(lockAndCompare(legitPending, LEGIT, { ...legitAnswers, account: '3307127' }, ctx)).toEqual({
    ok: false,
    reason: 'pending_comparison',
  })
  expect(legitPending.attempts).toHaveLength(1)
})

test('OS-1 Cedarline: "Details match." stays "On hold—verification needed" until saved, then Verified and "Ready to pay"', () => {
  const attempt = legitPending.attempts[0]
  const request = SAMPLES.requests.find((r) => r.id === LEGIT)
  if (!attempt?.stated || !request) throw new Error('no compared Cedarline attempt')
  expect(attempt.outcome).toBe('verified')
  expect(attempt.results).toEqual({ payeeName: 'match', institution: 'match', transit: 'match', account: 'match' })
  expect(comparisonLine(request.requested, attempt.stated, attempt.results)).toBe('Details match.')

  // Compared but not saved: a match on screen releases nothing.
  const unsaved = deriveRequestView(legitPending, LEGIT, SAMPLES)
  expect(unsaved?.phase).toBe('pending')
  expect(unsaved?.paymentStatus).toBe('On hold—verification needed')
  expect(unsaved?.requestVerified).toBe(false)
  expect(unsaved?.pending?.id).toBe('A-001')
  expect(unsaved?.savedAttempts).toEqual([])
  expect(unsaved?.canStart).toBe(false)

  const saved = ok(saveAttempt(legitPending, 'A-001', ctx))
  expect(checkInvariants(saved.state, SAMPLES)).toEqual([])
  assertAppendOnly(legitPending, saved.state)
  expect(saved.recordId).toBe('PC-20261025-154200-001')
  expect(saved.state.records[0]?.outcome).toBe('verified')
  expect(saved.state.records[0]?.resultingPaymentStatus).toBe('Ready to pay')
  const view = deriveRequestView(saved.state, LEGIT, SAMPLES)
  expect(view?.phase).toBe('verified')
  expect(view?.paymentStatus).toBe('Ready to pay')
  expect(view?.requestVerified).toBe(true)
  expect(view?.pending).toBeNull()
  expect(view?.reason).toBeNull()
  expect(view?.canStart).toBe(false)
  expect(view?.savedAttempts.map((a) => a.id)).toEqual(['A-001'])
  // The other flagged payment is still held.
  expect(paymentStatusOf(saved.state, MISMATCH)).toBe('On hold—verification needed')
})

test('CR-2 CR-5 lockAndCompare appends a locked attempt with the answers exactly as typed', () => {
  const typed: Answers = deepFreeze({
    payeeName: '  harbourline LUMBER ltd. ',
    institution: '952',
    transit: '60 415',
    account: '7341 4471',
    personSpokenTo: ' Sam Okafor ',
  })
  const result = ok(lockAndCompare(EMPTY, MISMATCH, typed, ctx))
  expect(checkInvariants(result.state, SAMPLES)).toEqual([])
  assertAppendOnly(EMPTY, result.state)
  expect(result.attemptId).toBe('A-001')
  expect(result.recordId).toBeNull()
  expect(result.state.records).toEqual([])
  expect(result.state.attempts).toEqual([
    {
      id: 'A-001',
      requestId: 'req-mismatch',
      status: 'compared',
      outcome: 'mismatch',
      stated: { payeeName: '  harbourline LUMBER ltd. ', institution: '952', transit: '60 415', account: '7341 4471' },
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
  const both = step(pending, (s) => lockAndCompare(s, LEGIT, legitAnswers, ctx))
  expect(both.attempts.map((a) => a.id)).toEqual(['A-001', 'A-002'])
  expect(phaseOf(both, MISMATCH)).toBe('pending')
  expect(phaseOf(both, LEGIT)).toBe('pending')
  expect(both.attempts[1]?.outcome).toBe('verified')
  // Couldn't verify on the other request still works beside it.
  const beside = step(pending, (s) => saveCouldntVerify(s, LEGIT, noAnswer, ctx))
  expect(phaseOf(beside, MISMATCH)).toBe('pending')
  expect(phaseOf(beside, LEGIT)).toBe('held_incomplete')
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
  for (const state of [EMPTY, pending, heldMismatch, heldIncomplete, verified]) {
    for (const payment of plain) expect(paymentStatusForPayment(state, payment)).toBe('Scheduled')
  }
})

test('RT-3 lockAndCompare on a verified request → verified, and it cannot start again', () => {
  expect(lockAndCompare(verified, MISMATCH, mismatchAnswers, ctx)).toEqual({ ok: false, reason: 'verified' })
  expect(canStartAttempt(verified, MISMATCH)).toBe(false)
  expect(lockAndCompare(legitVerified, LEGIT, legitAnswers, ctx)).toEqual({ ok: false, reason: 'verified' })
  // A verified request never asks for fields: "verified" outranks "missing".
  expect(lockAndCompare(legitVerified, LEGIT, blankAnswers, ctx)).toEqual({ ok: false, reason: 'verified' })
  expect(canStartAttempt(legitVerified, LEGIT)).toBe(false)
})

test('RT-1 a new attempt can start after a saved mismatch or a saved couldn\'t-verify, and never while pending or verified', () => {
  expect(canStartAttempt(heldMismatch, MISMATCH)).toBe(true)
  expect(canStartAttempt(heldIncomplete, MISMATCH)).toBe(true)
  expect(canStartAttempt(incompleteAfterMismatch, MISMATCH)).toBe(true)
  expect(canStartAttempt(pending, MISMATCH)).toBe(false)
  expect(canStartAttempt(incompleteRetryPending, MISMATCH)).toBe(false)
  expect(canStartAttempt(verified, MISMATCH)).toBe(false)

  // Each start appends the next attempt; nothing is carried over from the earlier one.
  const retry = step(heldIncomplete, (s) => lockAndCompare(s, MISMATCH, matchingAnswers, ctx))
  expect(retry.attempts.map((a) => a.id)).toEqual(['A-001', 'A-002'])
  expect(retry.attempts[1]?.stated).toEqual({ payeeName: 'Harbourline Lumber Ltd.', institution: '952', transit: '60415', account: '73419020' })
  const again = step(incompleteAfterMismatch, (s) => lockAndCompare(s, MISMATCH, mismatchAnswers, ctx))
  expect(again.attempts.map((a) => a.id)).toEqual(['A-001', 'A-002', 'A-003'])

  // The unresolved request lists its earlier attempts, each with its record and reason.
  const view = deriveRequestView(incompleteAfterMismatch, MISMATCH, SAMPLES)
  expect(view?.savedAttempts.map((a) => [a.id, a.outcome, a.recordId, a.reason])).toEqual([
    ['A-001', 'mismatch', 'PC-20261025-154200-001', ''],
    ['A-002', 'couldnt_verify', 'PC-20261025-154200-002', 'No answer'],
  ])
  expect(view?.canStart).toBe(true)
})

const personRows = [
  { id: 'CB-6', name: 'person left empty → null', personSpokenTo: '', stored: null },
  { id: 'CB-6', name: 'person not given → null', personSpokenTo: undefined, stored: null },
  { id: 'CB-6', name: 'spaces only → null', personSpokenTo: '   ', stored: null },
  { id: 'CB-6', name: 'NBSP and zero-width only → null', personSpokenTo: '\u00a0\u200b', stored: null },
  { id: 'CB-6', name: 'typed → kept exactly as typed', personSpokenTo: ' Sam Okafor ', stored: ' Sam Okafor ' },
]

test.each(personRows)('$id couldn\'t verify: $name, reason kept', ({ personSpokenTo, stored }) => {
  const input: CouldntVerifyInput = deepFreeze({ reason: ' No answer ', personSpokenTo })
  for (const from of [EMPTY, heldMismatch, heldIncomplete]) {
    const result = ok(saveCouldntVerify(from, MISMATCH, input, ctx))
    expect(checkInvariants(result.state, SAMPLES)).toEqual([])
    assertAppendOnly(from, result.state)
    const attempt = result.state.attempts.at(-1)
    const record = result.state.records.at(-1)
    expect(attempt?.personSpokenTo).toBe(stored)
    expect(record?.personSpokenTo).toBe(stored)
    expect(attempt?.reason).toBe(' No answer ')
    expect(record?.reason).toBe(' No answer ')
  }
})

test('CB-6 Couldn\'t verify is never refused as missing: everything blank still saves', () => {
  for (const from of [EMPTY, heldMismatch, heldIncomplete]) {
    const result = ok(saveCouldntVerify(from, MISMATCH, deepFreeze({ reason: '', personSpokenTo: '' }), ctx))
    expect(checkInvariants(result.state, SAMPLES)).toEqual([])
    expect(phaseOf(result.state, MISMATCH)).toBe('held_incomplete')
  }
  expect(ok(saveCouldntVerify(EMPTY, MISMATCH, {}, ctx)).state.attempts[0]?.reason).toBe('')
})

test('OS-3 a saved couldn\'t-verify → "On hold—verification incomplete" with its reason', () => {
  const result = ok(saveCouldntVerify(EMPTY, MISMATCH, noAnswer, ctx))
  expect(result.attemptId).toBe('A-001')
  expect(result.recordId).toBe('PC-20261025-154200-001')
  expect(paymentStatusOf(heldIncomplete, MISMATCH)).toBe('On hold—verification incomplete')
  const payment = SAMPLES.payments.find((p) => p.requestId === MISMATCH)
  if (!payment) throw new Error('mismatch payment missing from samples')
  expect(paymentStatusForPayment(heldIncomplete, payment)).toBe('On hold—verification incomplete')
  const view = deriveRequestView(heldIncomplete, MISMATCH, SAMPLES)
  expect(view?.paymentStatus).toBe('On hold—verification incomplete')
  expect(view?.reason).toBe('No answer')
  expect(view?.savedAttempts.map((a) => a.reason)).toEqual(['No answer'])
  expect(heldIncomplete.records[0]?.resultingPaymentStatus).toBe('On hold—verification incomplete')
  expect(heldIncomplete.records[0]?.reason).toBe('No answer')

  // A retry left unsaved changes neither the status nor the reason shown beside it.
  expect(paymentStatusOf(incompleteRetryPending, MISMATCH)).toBe('On hold—verification incomplete')
  expect(deriveRequestView(incompleteRetryPending, MISMATCH, SAMPLES)?.reason).toBe('No answer')
  // Only a couldn't-verify hold carries a reason.
  expect(deriveRequestView(heldMismatch, MISMATCH, SAMPLES)?.reason).toBeNull()
  expect(deriveRequestView(EMPTY, MISMATCH, SAMPLES)?.reason).toBeNull()
})

const reasonRows = [
  { id: 'OS-3', name: 'reason left empty', reason: '', shown: 'No reason recorded' },
  { id: 'OS-3', name: 'reason not given', reason: undefined, shown: 'No reason recorded' },
  { id: 'OS-3', name: 'spaces only', reason: '   ', shown: 'No reason recorded' },
  { id: 'OS-3', name: 'zero-width only', reason: '\u200b', shown: 'No reason recorded' },
  { id: 'OS-3', name: '"Supplier couldn\'t confirm"', reason: "Supplier couldn't confirm", shown: "Supplier couldn't confirm" },
]

test.each(reasonRows)('$id blank reason → "No reason recorded": $name', ({ reason, shown }) => {
  const state = step(heldMismatch, (s) => saveCouldntVerify(s, MISMATCH, deepFreeze({ reason }), ctx))
  expect(paymentStatusOf(state, MISMATCH)).toBe('On hold—verification incomplete')
  expect(deriveRequestView(state, MISMATCH, SAMPLES)?.reason).toBe(shown)
  // Stored as typed; only the screens swap in the words.
  expect(state.attempts[1]?.reason).toBe(reason ?? '')
  expect(state.records[1]?.reason).toBe(reason ?? '')
})

test('OS-3 the latest saved couldn\'t-verify reason is the one shown', () => {
  const second = step(heldIncomplete, (s) => saveCouldntVerify(s, MISMATCH, { reason: "Supplier couldn't confirm" }, ctx))
  expect(deriveRequestView(second, MISMATCH, SAMPLES)?.reason).toBe("Supplier couldn't confirm")
  const third = step(second, (s) => saveCouldntVerify(s, MISMATCH, { reason: '' }, ctx))
  expect(deriveRequestView(third, MISMATCH, SAMPLES)?.reason).toBe('No reason recorded')
  expect(third.attempts.map((a) => a.id)).toEqual(['A-001', 'A-002', 'A-003'])
  expect(third.records.map((r) => r.reason)).toEqual(['No answer', "Supplier couldn't confirm", ''])
})

test('VR-3 a couldn\'t-verify attempt and its record: four "not_checked", stated null, "Not checked" ×4', () => {
  expect(heldIncomplete.attempts).toEqual([
    {
      id: 'A-001',
      requestId: 'req-mismatch',
      status: 'saved',
      outcome: 'couldnt_verify',
      stated: null,
      personSpokenTo: null,
      results: NOT_CHECKED,
      reason: 'No answer',
      comparedAt: null,
      savedAt: '2026-10-25T19:42:00.000Z',
      recordId: 'PC-20261025-154200-001',
    },
  ])
  expect(heldIncomplete.records).toEqual([
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
      personSpokenTo: null,
      requested: { payeeName: 'Harbourline Lumber Ltd.', institution: '952', transit: '60415', account: '73419020' },
      stated: null,
      results: NOT_CHECKED,
      outcome: 'couldnt_verify',
      reason: 'No answer',
      resultingPaymentStatus: 'On hold—verification incomplete',
      label: 'Fictional sample data—no real call or payment',
    },
  ])
  const record = heldIncomplete.records[0]
  if (!record) throw new Error('no record')
  expect(FIELDS.map((field) => recordResultLabel(field, record))).toEqual(['Not checked', 'Not checked', 'Not checked', 'Not checked'])
})

test('VR-3 a couldn\'t-verify after a comparison copies nothing from it: still "Not checked" ×4', () => {
  // The earlier mismatch matched three fields; none of that reaches the new attempt or record.
  const attempt = incompleteAfterMismatch.attempts[1]
  const record = incompleteAfterMismatch.records[1]
  if (!attempt || !record) throw new Error('no couldn\'t-verify attempt')
  expect(attempt.stated).toBeNull()
  expect(attempt.results).toEqual(NOT_CHECKED)
  expect(attempt.personSpokenTo).toBeNull()
  expect(record.stated).toBeNull()
  expect(record.results).toEqual(NOT_CHECKED)
  expect(FIELDS.map((field) => recordResultLabel(field, record))).toEqual(['Not checked', 'Not checked', 'Not checked', 'Not checked'])
  expect(FIELDS.map((field) => recordResultLabel(field, record))).not.toContain('Matches')
})

test('OS-4 phaseOf follows array order, never timestamps', () => {
  // The retry is saved with a clock set back before the first save.
  const first = step(pending, (s) => saveAttempt(s, 'A-001', at('2026-10-25T19:42:00Z')))
  const retry = step(first, (s) => lockAndCompare(s, MISMATCH, matchingAnswers, at('2026-10-01T12:00:00Z')))
  const second = step(retry, (s) => saveAttempt(s, 'A-002', at('2026-10-01T12:00:00Z')))
  expect(phaseOf(second, MISMATCH)).toBe('verified')
  expect(paymentStatusOf(second, MISMATCH)).toBe('Ready to pay')
  // A couldn't-verify saved with the clock set back is still the latest attempt.
  const back = step(heldMismatch, (s) => saveCouldntVerify(s, MISMATCH, noAnswer, at('2026-10-01T12:00:00Z')))
  expect(phaseOf(back, MISMATCH)).toBe('held_incomplete')
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
  expect(deriveRequestView(heldIncomplete, MISMATCH, SAMPLES)?.pending).toBeNull()
})

test('CB-1 CB-4 callbackView carries only the supplier name and the on-file phone', () => {
  const view = callbackView(MISMATCH, SAMPLES)
  expect(view).toEqual({ requestId: 'req-mismatch', supplierName: 'Harbourline Lumber Ltd.', trustedNumber: '519-555-0142' })
  expect(Object.keys(view ?? {})).toEqual(['requestId', 'supplierName', 'trustedNumber'])
  expect(callbackView('req-nope', SAMPLES)).toBeNull()
})

test('VR-2 saveAttempt writes a dated record with every PRD field, snapshotted at save time', () => {
  const saved = ok(saveAttempt(pending, 'A-001', ctx))
  expect(checkInvariants(saved.state, SAMPLES)).toEqual([])
  assertAppendOnly(pending, saved.state)
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
  const later = step(retryPending, (s) => saveAttempt(s, 'A-002', ctx))
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

test('VR-1 mismatch, then couldn\'t verify, then a retry that verifies: records 1 and 2 equal their earlier copies', () => {
  const record1 = structuredClone(heldMismatch.records[0])
  const record2 = structuredClone(incompleteAfterMismatch.records[1])
  const later = at('2026-10-25T20:05:00Z')
  const retry = step(incompleteAfterMismatch, (s) => lockAndCompare(s, MISMATCH, matchingAnswers, later))
  const done = step(retry, (s) => saveAttempt(s, 'A-003', later))

  expect(done.records[0]).toEqual(record1)
  expect(done.records[1]).toEqual(record2)
  const ids = done.records.map((r) => r.id)
  expect(ids).toEqual(['PC-20261025-154200-001', 'PC-20261025-154200-002', 'PC-20261025-160500-003'])
  expect(new Set(ids).size).toBe(3)
  // Each record keeps the status that was true when it was saved.
  expect(done.records.map((r) => r.resultingPaymentStatus)).toEqual([
    'On hold—details do not match',
    'On hold—verification incomplete',
    'Ready to pay',
  ])
  const first = done.records[0]
  if (!first) throw new Error('no record 1')
  expect(recordResultLabel('account', first)).toBe('Does not match')
  expect(paymentStatusOf(done, MISMATCH)).toBe('Ready to pay')
  expect(deriveRequestView(done, MISMATCH, SAMPLES)?.savedAttempts.map((a) => a.id)).toEqual(['A-001', 'A-002', 'A-003'])
})

const labelRows: { id: string; name: string; answers: Answers; field: FieldKey; words: string }[] = [
  {
    id: 'VR-4 CR-8',
    name: 'same last four, earlier digit differs → "Does not match (differs before the last four digits)"',
    answers: { ...matchingAnswers, account: '73429020' },
    field: 'account',
    words: 'Does not match (differs before the last four digits)',
  },
  {
    id: 'VR-4 CR-8',
    name: 'same last four once spacing is ignored → "Does not match (differs before the last four digits)"',
    answers: { ...matchingAnswers, account: '7342 90 20' },
    field: 'account',
    words: 'Does not match (differs before the last four digits)',
  },
  {
    id: 'VR-4',
    name: 'last four differ (…4471 vs …9020) → "Does not match"',
    answers: mismatchAnswers,
    field: 'account',
    words: 'Does not match',
  },
  {
    id: 'VR-4',
    name: 'account matches with spacing → "Matches"',
    answers: { ...matchingAnswers, account: '7341 9020' },
    field: 'account',
    words: 'Matches',
  },
  {
    id: 'VR-4',
    name: 'a different transit is never given the last-four wording',
    answers: { ...matchingAnswers, transit: '70415' },
    field: 'transit',
    words: 'Does not match',
  },
  {
    id: 'VR-4',
    name: 'institution, unmasked, matches → "Matches"',
    answers: mismatchAnswers,
    field: 'institution',
    words: 'Matches',
  },
]

test.each(labelRows)('$id recordResultLabel: $name', ({ answers, field, words }) => {
  const compared = step(EMPTY, (s) => lockAndCompare(s, MISMATCH, deepFreeze(answers), ctx))
  const record = step(compared, (s) => saveAttempt(s, 'A-001', ctx)).records[0]
  if (!record) throw new Error('no record')
  expect(recordResultLabel(field, record)).toBe(words)
})

test('VR-4 VR-3 recordResultLabel on a couldn\'t-verify record → "Not checked" for every field, the account included', () => {
  const record = legitIncomplete.records[0]
  if (!record) throw new Error('no record')
  expect(FIELDS.map((field) => recordResultLabel(field, record))).toEqual(['Not checked', 'Not checked', 'Not checked', 'Not checked'])
})
