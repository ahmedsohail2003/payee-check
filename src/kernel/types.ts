// Every type the app shares. Bank identifiers are strings end to end, so leading zeros survive.

export type BankDetails = { payeeName: string; institution: string; transit: string; account: string }
export type Supplier = { id: string; name: string; onFilePhone: string; onFile: BankDetails }
export type Payment = {
  id: string
  ref: string
  supplierId: string
  amountCents: number
  dueDate: string // YYYY-MM-DD, never turned into a Date
  requestId?: string
}
export type Contact = { kind: 'phone' | 'email' | 'link'; value: string }
export type ChangeRequest = {
  id: string
  supplierId: string
  paymentId: string
  email: { from: string; subject: string; receivedAt: string /* ISO with offset */; body: string; contacts: Contact[] }
  requested: BankDetails
}
export type Samples = { suppliers: Supplier[]; payments: Payment[]; requests: ChangeRequest[] }

export type FieldKey = 'payeeName' | 'institution' | 'transit' | 'account' // the four compared details
export type AnswerKey = FieldKey | 'personSpokenTo' // everything Compare requires
export type FieldResult = 'match' | 'mismatch' | 'not_checked'
export type Outcome = 'verified' | 'mismatch' | 'couldnt_verify'
export type Answers = BankDetails & { personSpokenTo: string } // what the Call-back form collects

export const FIELD_KEYS: readonly FieldKey[] = ['payeeName', 'institution', 'transit', 'account']
export const ANSWER_KEYS: readonly AnswerKey[] = ['payeeName', 'institution', 'transit', 'account', 'personSpokenTo'] // form order

export type Attempt = {
  id: string // A-001
  requestId: string
  status: 'compared' | 'saved'
  outcome: Outcome
  stated: BankDetails | null // exactly as typed; never normalised; null for couldnt_verify
  personSpokenTo: string | null
  results: Record<FieldKey, FieldResult>
  reason: string
  comparedAt: string | null
  savedAt: string | null
  recordId: string | null // null while compared
}

export type SavedPaymentStatus = 'Ready to pay' | 'On hold—details do not match' | 'On hold—verification incomplete'
export type PaymentStatus = SavedPaymentStatus | 'On hold—verification needed' | 'Scheduled'
export type FictionalLabel = 'Fictional sample data—no real call or payment'

export type VerificationRecord = {
  id: string // PC-YYYYMMDD-HHMMSS-NNN
  attemptId: string
  requestId: string
  savedAt: string // ISO UTC
  timeZone: string
  supplierName: string
  paymentRef: string
  amountCents: number
  dueDate: string
  emailRef: string // subject + received date
  trustedNumber: string
  personSpokenTo: string | null
  requested: BankDetails
  stated: BankDetails | null
  results: Record<FieldKey, FieldResult>
  outcome: Outcome
  reason: string
  resultingPaymentStatus: SavedPaymentStatus
  label: FictionalLabel
}

export type PersistedState = { version: 1; attempts: Attempt[]; records: VerificationRecord[] }

// The kernel never reads the clock or the machine's zone itself; callers pass them in.
export type Ctx = { samples: Samples; now: Date; timeZone: string }

export type Phase = 'needs_verification' | 'pending' | 'held_mismatch' | 'held_incomplete' | 'verified'

export type KernelResult =
  | { ok: true; state: PersistedState; attemptId: string; recordId: string | null }
  | { ok: false; reason: 'missing'; missing: AnswerKey[] }
  | { ok: false; reason: 'verified' | 'pending_comparison' | 'not_compared' | 'unknown_request' | 'unknown_attempt' }

// What the Call-back step is allowed to know: no email, no requested values (request-blind by type).
export type CallbackView = { requestId: string; supplierName: string; trustedNumber: string }
