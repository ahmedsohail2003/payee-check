import { z } from 'zod'
import type { Attempt, PersistedState, VerificationRecord } from '../kernel/types'

// The persisted parts of kernel/types.ts, checked on every load. Objects are strict everywhere, so an unknown
// key makes saved data invalid instead of being silently dropped by the next save.

const bankDetails = z.strictObject({
  payeeName: z.string(),
  institution: z.string(),
  transit: z.string(),
  account: z.string(),
})

const fieldResult = z.enum(['match', 'mismatch', 'not_checked'])
const results = z.strictObject({
  payeeName: fieldResult,
  institution: fieldResult,
  transit: fieldResult,
  account: fieldResult,
})
const outcome = z.enum(['verified', 'mismatch', 'couldnt_verify'])

// Timestamps and dates are checked for shape, not just type: a malformed one would make Intl throw while
// rendering and leave a blank page.
const timestamp = z.iso.datetime()

export const attemptSchema = z.strictObject({
  id: z.string(),
  requestId: z.string(),
  status: z.enum(['compared', 'saved']),
  outcome,
  stated: bankDetails.nullable(),
  personSpokenTo: z.string().nullable(),
  results,
  reason: z.string(),
  comparedAt: timestamp.nullable(),
  savedAt: timestamp.nullable(),
  recordId: z.string().nullable(),
})

export const verificationRecordSchema = z.strictObject({
  id: z.string(),
  attemptId: z.string(),
  requestId: z.string(),
  savedAt: timestamp,
  timeZone: z.string(),
  supplierName: z.string(),
  paymentRef: z.string(),
  amountCents: z.number(),
  dueDate: z.iso.date(),
  emailRef: z.string(),
  trustedNumber: z.string(),
  personSpokenTo: z.string().nullable(),
  requested: bankDetails,
  stated: bankDetails.nullable(),
  results,
  outcome,
  reason: z.string(),
  resultingPaymentStatus: z.enum(['Ready to pay', 'On hold—details do not match', 'On hold—verification incomplete']),
  label: z.literal('Fictional sample data—no real call or payment'),
})

export const persistedStateSchema = z.strictObject({
  version: z.literal(1),
  attempts: z.array(attemptSchema),
  records: z.array(verificationRecordSchema),
})

// tsc proves each schema and its type in kernel/types.ts agree in both directions: a field added, dropped or
// retyped on either side (a literal union member included) fails `npm run typecheck`.
type Agree<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
export const SCHEMA_AGREES_WITH_TYPES: [
  Agree<z.infer<typeof attemptSchema>, Attempt>,
  Agree<z.infer<typeof verificationRecordSchema>, VerificationRecord>,
  Agree<z.infer<typeof persistedStateSchema>, PersistedState>,
] = [true, true, true]
