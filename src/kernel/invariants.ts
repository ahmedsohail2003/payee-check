import { missingAnswers } from './attempts'
import { compareDetails } from './compare'
import { isBlank } from './normalize'
import { lookupRequest, savedStatusFor } from './record'
import { FIELD_KEYS, type Attempt, type PersistedState, type Samples, type VerificationRecord } from './types'

// What valid saved data means, in one place. The Store rejects a load with any problem, and every kernel unit
// test runs this on every result. It re-derives each outcome from what is stored, so "Ready to pay" can only
// mean a saved attempt whose stated details match the request in full, even if samples.ts changed since.
// It guards consistency, not tampering: whoever uses this browser can edit localStorage.

// Problem codes are `<rule>:<attempt or record ID>`, so a failing load names exactly what broke.
export function checkInvariants(state: PersistedState, samples: Samples): string[] {
  const problems: string[] = []
  const flag = (code: string, subject: string) => problems.push(`${code}:${subject}`)

  // Rule 1: positional IDs, so "count + 1" can never reissue one.
  state.attempts.forEach((attempt, i) => {
    if (attempt.id !== positionalAttemptId(i + 1)) flag('attempt_id_not_positional', attempt.id)
  })
  state.records.forEach((record, i) => {
    if (recordPosition(record.id) !== i + 1) flag('record_id_not_positional', record.id)
  })

  // Rule 2: per request, at most one compared attempt and it's the last; nothing follows a saved verified.
  const byRequest = new Map<string, Attempt[]>()
  for (const attempt of state.attempts) byRequest.set(attempt.requestId, [...(byRequest.get(attempt.requestId) ?? []), attempt])
  for (const own of byRequest.values()) {
    own.forEach((attempt, i) => {
      if (attempt.status === 'compared' && i !== own.length - 1) flag('compared_not_last', attempt.id)
      if (own.slice(0, i).some((earlier) => earlier.status === 'saved' && earlier.outcome === 'verified')) {
        flag('attempt_after_verified', attempt.id)
      }
    })
  }

  for (const attempt of state.attempts) checkAttempt(attempt, state, samples, flag)
  for (const record of state.records) checkRecord(record, state, samples, flag)
  return problems
}

type Flag = (code: string, subject: string) => void

function checkAttempt(attempt: Attempt, state: PersistedState, samples: Samples, flag: Flag): void {
  const { id } = attempt
  const parts = lookupRequest(samples, attempt.requestId)
  if (!parts) flag('unknown_request', id)

  // Rule 3: a compared attempt has no save time, no record ID and no record; a saved one has exactly one
  // record, linked both ways.
  const linked = state.records.filter((r) => r.attemptId === id)
  if (attempt.status === 'compared') {
    if (attempt.savedAt !== null || attempt.recordId !== null || linked.length > 0) flag('compared_has_record', id)
  } else {
    const [record, ...extra] = linked
    if (attempt.savedAt === null || !record || extra.length > 0 || record.id !== attempt.recordId) flag('record_link', id)
  }

  // Rule 4: results are re-derived from the stored answers, never trusted.
  if (attempt.outcome === 'couldnt_verify') {
    // Nothing was collected or compared, and it is saved the moment it is made.
    const allNotChecked = FIELD_KEYS.every((key) => attempt.results[key] === 'not_checked')
    if (attempt.stated !== null || !allNotChecked || attempt.status !== 'saved' || attempt.comparedAt !== null) {
      flag('couldnt_verify_shape', id)
    }
    // Stored as null when blank, so a record never prints an empty "Person spoken to".
    if (attempt.personSpokenTo !== null && isBlank(attempt.personSpokenTo)) flag('blank_person', id)
  } else if (attempt.stated === null) {
    // A verified or mismatch outcome with no stated details would release or hold a payment on nothing.
    flag('stated_missing', id)
  } else {
    if (attempt.comparedAt === null) flag('compared_at_missing', id)
    const missing = missingAnswers({ ...attempt.stated, personSpokenTo: attempt.personSpokenTo ?? '' })
    if (missing.length > 0) flag('missing_answers', id)
    if (parts) {
      const derived = compareDetails(parts.request.requested, attempt.stated)
      if (derived.outcome !== attempt.outcome || !same(derived.results, attempt.results)) flag('results_rederive', id)
    }
  }
}

function checkRecord(record: VerificationRecord, state: PersistedState, samples: Samples, flag: Flag): void {
  const { id } = record
  const parts = lookupRequest(samples, record.requestId)
  if (!parts) flag('unknown_request', id)

  // Rule 3, from the record's side: it belongs to exactly one saved attempt that points back at it.
  const owners = state.attempts.filter((a) => a.id === record.attemptId)
  const [attempt] = owners
  if (!attempt || owners.length > 1 || attempt.status !== 'saved' || attempt.recordId !== id) {
    flag('record_link', id)
  } else if (
    // Rule 5: the record repeats its attempt.
    record.requestId !== attempt.requestId ||
    record.savedAt !== attempt.savedAt ||
    record.outcome !== attempt.outcome ||
    record.personSpokenTo !== attempt.personSpokenTo ||
    record.reason !== attempt.reason ||
    !same(record.results, attempt.results) ||
    !same(record.stated, attempt.stated)
  ) {
    flag('record_differs_from_attempt', id)
  }

  // Rule 5: its requested details and trusted number are the samples', and its status is its outcome's.
  if (parts && (!same(record.requested, parts.request.requested) || record.trustedNumber !== parts.supplier.onFilePhone)) {
    flag('record_differs_from_samples', id)
  }
  if (record.resultingPaymentStatus !== savedStatusFor(record.outcome)) flag('record_status', id)

  // Rule 6: a zone Intl rejects would throw while rendering and leave a blank page.
  if (!isValidTimeZone(record.timeZone)) flag('time_zone', id)
}

// Append-only, checked after every action: earlier records unchanged and in place; earlier attempts unchanged,
// except a single compared → saved step that changes only status, savedAt and recordId.
export function appendOnlyProblems(prev: PersistedState, next: PersistedState): string[] {
  const problems: string[] = []
  prev.records.forEach((record, i) => {
    if (!same(record, next.records[i])) problems.push(`record_changed:${record.id}`)
  })
  let savedSteps = 0
  prev.attempts.forEach((attempt, i) => {
    const after = next.attempts[i]
    if (same(attempt, after)) return
    if (after && attempt.status === 'compared' && after.status === 'saved' && same(withoutSaveFields(attempt), withoutSaveFields(after))) {
      savedSteps += 1
      return
    }
    problems.push(`attempt_changed:${attempt.id}`)
  })
  if (savedSteps > 1) problems.push(`more_than_one_save:${savedSteps}`)
  return problems
}

export function assertAppendOnly(prev: PersistedState, next: PersistedState): void {
  const problems = appendOnlyProblems(prev, next)
  if (problems.length > 0) throw new Error(`Not append-only: ${problems.join(', ')}`)
}

const positionalAttemptId = (position: number) => 'A-' + String(position).padStart(3, '0')

// NNN of PC-YYYYMMDD-HHMMSS-NNN, or NaN when the ID has another shape.
function recordPosition(recordId: string): number {
  const match = /^PC-\d{8}-\d{6}-(\d{3,})$/.exec(recordId)
  return match?.[1] === undefined ? Number.NaN : Number(match[1])
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function withoutSaveFields({ status: _status, savedAt: _savedAt, recordId: _recordId, ...rest }: Attempt) {
  return rest
}

// Structural equality for the plain JSON data the state holds; key order doesn't matter.
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((k) => Object.hasOwn(right, k) && same(left[k], right[k]))
}
