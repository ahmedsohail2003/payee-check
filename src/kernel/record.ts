import { FICTIONAL_LABEL, RESULT_WORDS, STATUS } from '../copy'
import { formatDateOnly, localYmd, recordIdFor } from './format'
import { lastFour } from './mask'
import type {
  Attempt,
  ChangeRequest,
  Ctx,
  FieldKey,
  Outcome,
  Payment,
  Samples,
  SavedPaymentStatus,
  Supplier,
  VerificationRecord,
} from './types'

export type RequestParts = { request: ChangeRequest; supplier: Supplier; payment: Payment }

export function lookupRequest(samples: Samples, requestId: string): RequestParts | null {
  const request = samples.requests.find((r) => r.id === requestId)
  if (!request) return null
  const supplier = samples.suppliers.find((s) => s.id === request.supplierId)
  const payment = samples.payments.find((p) => p.id === request.paymentId)
  return supplier && payment ? { request, supplier, payment } : null
}

const SAVED_STATUS: Record<Outcome, SavedPaymentStatus> = {
  verified: STATUS.readyToPay,
  mismatch: STATUS.mismatch,
  couldnt_verify: STATUS.incomplete,
}

export function savedStatusFor(outcome: Outcome): SavedPaymentStatus {
  return SAVED_STATUS[outcome]
}

// A snapshot of exactly what was true at save time; the record view prints only from it. Its status
// stays as saved: after a retry verifies, an earlier mismatch record still says "details do not match".
export function buildRecord(attempt: Attempt, ctx: Ctx, position: number): VerificationRecord {
  const parts = lookupRequest(ctx.samples, attempt.requestId)
  if (!parts) throw new Error(`No sample request ${attempt.requestId}`)
  const { request, supplier, payment } = parts
  const received = formatDateOnly(localYmd(new Date(request.email.receivedAt), ctx.timeZone))
  return {
    id: recordIdFor(ctx.now, ctx.timeZone, position),
    attemptId: attempt.id,
    requestId: attempt.requestId,
    savedAt: ctx.now.toISOString(),
    timeZone: ctx.timeZone,
    supplierName: supplier.name,
    paymentRef: payment.ref,
    amountCents: payment.amountCents,
    dueDate: payment.dueDate,
    emailRef: `${request.email.subject} (received ${received})`,
    trustedNumber: supplier.onFilePhone,
    personSpokenTo: attempt.personSpokenTo,
    requested: { ...request.requested },
    stated: attempt.stated ? { ...attempt.stated } : null,
    results: { ...attempt.results },
    outcome: attempt.outcome,
    reason: attempt.reason,
    resultingPaymentStatus: savedStatusFor(attempt.outcome),
    label: FICTIONAL_LABEL,
  }
}

// Records are masked, so without the special wording a printout would show "…9020" against "…9020"
// marked "Does not match", which reads like a bug.
export function recordResultLabel(field: FieldKey, record: VerificationRecord): string {
  const result = record.results[field]
  const { stated } = record
  if (field === 'account' && result === 'mismatch' && stated && lastFour(record.requested.account) === lastFour(stated.account)) {
    return RESULT_WORDS.sameLastFour
  }
  return RESULT_WORDS[result]
}
