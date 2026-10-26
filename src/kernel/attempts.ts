import { NO_REASON, STATUS } from '../copy'
import { compareDetails } from './compare'
import { recordIdFor } from './format'
import { isBlank } from './normalize'
import { buildRecord, lookupRequest, savedStatusFor } from './record'
import {
  ANSWER_KEYS,
  type AnswerKey,
  type Answers,
  type Attempt,
  type BankDetails,
  type CallbackView,
  type ChangeRequest,
  type Ctx,
  type KernelResult,
  type Payment,
  type PaymentStatus,
  type PersistedState,
  type Phase,
  type Samples,
  type Supplier,
} from './types'

export type RequestView = {
  request: ChangeRequest
  supplier: Supplier
  payment: Payment
  phase: Phase
  paymentStatus: PaymentStatus
  requestVerified: boolean
  reason: string | null // latest saved couldn't-verify reason, NO_REASON when blank
  pending: Attempt | null
  savedAttempts: Attempt[]
  canStart: boolean
}

const attemptsFor = (state: PersistedState, requestId: string): Attempt[] =>
  state.attempts.filter((a) => a.requestId === requestId)

const latestSaved = (state: PersistedState, requestId: string): Attempt | undefined =>
  attemptsFor(state, requestId)
    .filter((a) => a.status === 'saved')
    .at(-1)

const SAVED_PHASE = { mismatch: 'held_mismatch', couldnt_verify: 'held_incomplete', verified: 'verified' } as const

// Array order, never timestamps: a laptop clock can be set back, the order attempts were appended can't.
export function phaseOf(state: PersistedState, requestId: string): Phase {
  const last = attemptsFor(state, requestId).at(-1)
  if (!last) return 'needs_verification'
  if (last.status === 'compared') return 'pending'
  return SAVED_PHASE[last.outcome]
}

// Status comes only from saved attempts, so an unsaved or abandoned comparison can never release a payment.
export function paymentStatusOf(state: PersistedState, requestId: string): PaymentStatus {
  const saved = latestSaved(state, requestId)
  return saved ? savedStatusFor(saved.outcome) : STATUS.needsVerification
}

export function paymentStatusForPayment(state: PersistedState, payment: Payment): PaymentStatus {
  return payment.requestId === undefined ? STATUS.scheduled : paymentStatusOf(state, payment.requestId)
}

// The phases whose Start column opens /call. The router's /call guard reads this too, so it can never
// open a Call-back step for a request the kernel would refuse at Compare.
export function canStartAttempt(state: PersistedState, requestId: string): boolean {
  const phase = phaseOf(state, requestId)
  return phase === 'needs_verification' || phase === 'held_mismatch' || phase === 'held_incomplete'
}

export function missingAnswers(answers: Answers): AnswerKey[] {
  return ANSWER_KEYS.filter((key) => isBlank(answers[key]))
}

const attemptId = (position: number) => 'A-' + String(position).padStart(3, '0')

export function lockAndCompare(state: PersistedState, requestId: string, answers: Answers, ctx: Ctx): KernelResult {
  // The same lookup saveAttempt and buildRecord use, so a comparison this accepts can always be saved.
  const parts = lookupRequest(ctx.samples, requestId)
  if (!parts) return { ok: false, reason: 'unknown_request' }
  // The refusal no typing can fix comes first, so a verified request never asks for fields.
  const phase = phaseOf(state, requestId)
  if (phase === 'verified') return { ok: false, reason: 'verified' }
  if (phase === 'pending') return { ok: false, reason: 'pending_comparison' }
  const missing = missingAnswers(answers)
  if (missing.length > 0) return { ok: false, reason: 'missing', missing }

  // Stored exactly as typed; the normalised forms exist only inside compareDetails.
  const stated: BankDetails = {
    payeeName: answers.payeeName,
    institution: answers.institution,
    transit: answers.transit,
    account: answers.account,
  }
  const { results, outcome } = compareDetails(parts.request.requested, stated)
  const attempt: Attempt = {
    id: attemptId(state.attempts.length + 1),
    requestId,
    status: 'compared',
    outcome,
    stated,
    personSpokenTo: answers.personSpokenTo,
    results,
    reason: '',
    comparedAt: ctx.now.toISOString(),
    savedAt: null,
    recordId: null,
  }
  return { ok: true, state: { ...state, attempts: [...state.attempts, attempt] }, attemptId: attempt.id, recordId: null }
}

export function saveAttempt(state: PersistedState, attemptIdToSave: string, ctx: Ctx): KernelResult {
  const index = state.attempts.findIndex((a) => a.id === attemptIdToSave)
  const attempt = state.attempts[index]
  if (!attempt) return { ok: false, reason: 'unknown_attempt' }
  if (!lookupRequest(ctx.samples, attempt.requestId)) return { ok: false, reason: 'unknown_request' }
  // Only the request's pending attempt saves, so Save records exactly the comparison on screen.
  if (attempt.status !== 'compared' || attemptsFor(state, attempt.requestId).at(-1) !== attempt) {
    return { ok: false, reason: 'not_compared' }
  }

  const position = state.records.length + 1
  const saved: Attempt = {
    ...attempt,
    status: 'saved',
    savedAt: ctx.now.toISOString(),
    recordId: recordIdFor(ctx.now, ctx.timeZone, position),
  }
  const record = buildRecord(saved, ctx, position)
  return {
    ok: true,
    state: {
      ...state,
      attempts: state.attempts.map((a, i) => (i === index ? saved : a)),
      records: [...state.records, record],
    },
    attemptId: saved.id,
    recordId: record.id,
  }
}

export type CouldntVerifyInput = { reason?: string; personSpokenTo?: string }

const NOT_CHECKED = { payeeName: 'not_checked', institution: 'not_checked', transit: 'not_checked', account: 'not_checked' } as const

// Saved straight away, with no comparison: nothing was collected, so every result is "Not checked" and an
// uncollected field can never read as a match. Never refused as missing; both inputs are optional.
export function saveCouldntVerify(
  state: PersistedState,
  requestId: string,
  { reason = '', personSpokenTo = '' }: CouldntVerifyInput,
  ctx: Ctx,
): KernelResult {
  if (!lookupRequest(ctx.samples, requestId)) return { ok: false, reason: 'unknown_request' }
  const phase = phaseOf(state, requestId)
  if (phase === 'verified') return { ok: false, reason: 'verified' }
  // A revealed comparison is saved or left as it is; it can't be swapped for "couldn't verify".
  if (phase === 'pending') return { ok: false, reason: 'pending_comparison' }

  const position = state.records.length + 1
  const attempt: Attempt = {
    id: attemptId(state.attempts.length + 1),
    requestId,
    status: 'saved',
    outcome: 'couldnt_verify',
    stated: null,
    personSpokenTo: isBlank(personSpokenTo) ? null : personSpokenTo,
    results: { ...NOT_CHECKED },
    reason, // as typed; the screens show "No reason recorded" when it is blank
    comparedAt: null,
    savedAt: ctx.now.toISOString(),
    recordId: recordIdFor(ctx.now, ctx.timeZone, position),
  }
  const record = buildRecord(attempt, ctx, position)
  return {
    ok: true,
    state: { ...state, attempts: [...state.attempts, attempt], records: [...state.records, record] },
    attemptId: attempt.id,
    recordId: record.id,
  }
}

export function deriveRequestView(state: PersistedState, requestId: string, samples: Samples): RequestView | null {
  const parts = lookupRequest(samples, requestId)
  if (!parts) return null
  const phase = phaseOf(state, requestId)
  const own = attemptsFor(state, requestId)
  const savedAttempts = own.filter((a) => a.status === 'saved')
  const latest = savedAttempts.at(-1)
  const last = own.at(-1)
  return {
    ...parts,
    phase,
    paymentStatus: paymentStatusOf(state, requestId),
    requestVerified: phase === 'verified',
    reason: latest?.outcome === 'couldnt_verify' ? (isBlank(latest.reason) ? NO_REASON : latest.reason) : null,
    pending: last?.status === 'compared' ? last : null,
    savedAttempts,
    canStart: canStartAttempt(state, requestId),
  }
}

// Request-blind by type: the Call-back step gets the supplier's name and on-file phone, nothing from the email.
export function callbackView(requestId: string, samples: Samples): CallbackView | null {
  const parts = lookupRequest(samples, requestId)
  if (!parts) return null
  return { requestId, supplierName: parts.supplier.name, trustedNumber: parts.supplier.onFilePhone }
}
