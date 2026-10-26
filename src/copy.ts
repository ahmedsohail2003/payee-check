import type { AnswerKey, FieldKey, FictionalLabel, PaymentStatus } from './kernel/types'

// Every user-visible string. Em dash (U+2014) unspaced in sentences and statuses, ellipsis (U+2026) in masks,
// straight apostrophes. Tests write these strings out literally and never import this file.

export const APP_NAME = 'Payee Check'
export const TITLE_SEPARATOR = ' — '

export const WHO_FOR =
  'Payee Check helps owners and bookkeepers at small trades and construction firms in Waterloo Region verify a supplier\'s "our bank details changed" email.'
export const FICTIONAL_LABEL: FictionalLabel = 'Fictional sample data—no real call or payment'
export const NO_AI_NOTE = 'No AI model runs in this app—sample requests are preloaded and the rules run in code.'

export const STATUS = {
  needsVerification: 'On hold—verification needed',
  mismatch: 'On hold—details do not match',
  incomplete: 'On hold—verification incomplete',
  readyToPay: 'Ready to pay',
  scheduled: 'Scheduled',
} as const satisfies Record<string, PaymentStatus>
export const REQUEST_VERIFIED = 'Verified'
export const SIMULATED = 'Simulated—no money moves.'

export const FIELD_LABELS: Record<AnswerKey, string> = {
  payeeName: 'Account-holder/payee name',
  institution: 'Institution number',
  transit: 'Transit/branch number',
  account: 'Full account number',
  personSpokenTo: 'Name of person spoken to',
}
// Short row headings for the Detail column of the details tables.
export const DETAIL_LABELS: Record<FieldKey, string> = {
  payeeName: 'Payee name',
  institution: 'Institution',
  transit: 'Transit',
  account: 'Account',
}

export const UNTRUSTED_TAG = 'untrusted—not used'
export const TRUSTED_TAG = 'Trusted number on file'

export const SCRIPT =
  'We received a request to change your payment details. Please state the account-holder name and the institution, transit and account numbers we should use.'
export const CALLBACK_HONESTY = "Hiding the email doesn't prove the call was independent."
export const RECORD_HONESTY = "This record shows what was entered and when. It doesn't prove a call took place."

export const RESULT_WORDS = {
  match: 'Matches',
  mismatch: 'Does not match',
  not_checked: 'Not checked',
  sameLastFour: 'Does not match (differs before the last four digits)',
} as const
export const OUTCOME_WORDS = {
  verified: 'Verified',
  mismatch: 'Details do not match',
  couldnt_verify: "Couldn't verify",
} as const

export const DETAILS_MATCH = 'Details match.'
export const HOLD_LINE = 'Payment still on hold—save this attempt to record the result.'
export const MISSING_HEADING = 'Compare needs every answer'
export const MISSING = 'Missing'
export const REASON_LABEL = 'Reason (optional)'
export const REASON_HINT = "For example: No answer, or Supplier couldn't confirm."
export const NOT_RECORDED = 'Not recorded'
export const NO_REASON = 'No reason recorded'
export const SAVED = 'Saved'

export const RESET = {
  action: 'Reset demo',
  heading: 'Reset demo?',
  body: 'This clears your saved attempts, records and any unsaved comparison, and restores the starting sample data.',
  cancel: 'Cancel',
  confirm: 'Yes, reset',
} as const
export const SAVE_FAILED = "Couldn't save—nothing was changed."
export const RESET_FAILED = "Couldn't reset—nothing was changed."
export const TRY_AGAIN = 'Try again'
export const STORAGE_UNREADABLE =
  "This browser isn't letting Payee Check save. You can look around, but attempts can't be saved."
export const RECOVERY = "Your saved demo data couldn't be read. Nothing has been shown from it."

export const BUTTONS = {
  reviewRequest: 'Review request',
  startCallback: 'Start call-back',
  tryAgainVerification: 'Try verification again',
  back: 'Back',
  compare: 'Compare',
  couldntVerify: "Couldn't verify",
  saveAttempt: 'Save attempt',
  print: 'Print',
  newAttempt: 'Start a new call-back attempt',
  viewRecord: 'View/Print record',
  backToRequest: 'Back to request',
  backToOverview: 'Back to overview',
} as const

export const HEADINGS = {
  overview: APP_NAME,
  request: (supplier: string) => `Bank-change request: ${supplier}`,
  callback: (supplier: string) => `Call-back: ${supplier}`,
  comparison: (supplier: string) => `Comparison: ${supplier}`,
  record: (recordId: string) => `Verification record ${recordId}`,
} as const
export const OVERVIEW_TITLE = 'Overview'
export const pageTitle = (heading: string) => `${heading}${TITLE_SEPARATOR}${APP_NAME}`

export const CAPTIONS = {
  supplierBook: 'Supplier book',
  paymentRun: "This week's payment run",
  existingVsRequested: 'Details on file and details requested by the email',
  comparison: 'Requested and stated details',
  recordDetails: 'Requested and stated details',
  attempts: 'Previous attempts',
} as const

export const COLUMNS = {
  supplier: 'Supplier',
  trustedPhone: 'Trusted phone (on file)',
  institution: 'Institution',
  transit: 'Transit',
  account: 'Account',
  reference: 'Reference',
  amount: 'Amount (CAD)',
  dueDate: 'Due date',
  status: 'Status',
  request: 'Request',
  detail: 'Detail',
  onFile: 'On file',
  requested: 'Requested (email)',
  stated: 'Stated (supplier)',
  result: 'Result',
  attempt: 'Attempt',
  outcome: 'Outcome',
  saved: 'Saved',
  record: 'Record',
} as const
export const NONE = 'None'

export const EMAIL = {
  heading: 'Email',
  from: 'From',
  subject: 'Subject',
  received: 'Received',
} as const

export const RECORD_LABELS = {
  recordId: 'Record ID',
  savedAt: 'Saved',
  outcome: 'Outcome',
  paymentStatus: 'Resulting payment status',
  supplier: 'Supplier',
  paymentRef: 'Payment reference',
  amount: 'Amount (CAD)',
  dueDate: 'Due date',
  emailChecked: 'Email checked',
  trustedNumber: 'Trusted number used',
  personSpokenTo: 'Person spoken to',
  reason: 'Reason or note',
} as const

// What a screen reader says for a masked account, before its last four digits.
export const ACCOUNT_ENDING = 'account ending'
