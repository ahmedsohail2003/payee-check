import { expect, test } from 'vitest'
import { SAMPLES } from '../data/samples'
import { compareDetails } from './compare'
import { buildRecord, recordResultLabel } from './record'
import type { Attempt, BankDetails, Ctx, FieldKey, VerificationRecord } from './types'

// record.ts on its own (spec.md > Records and masking): buildRecord is the save-time snapshot that the record
// view and the printout read from, and recordResultLabel is the words each detail row shows. Attempts are built
// here by hand, already marked saved, with their results from compareDetails, so no fixture can claim a result
// the comparison wouldn't give. attempts.test.ts covers the same records reached through saveAttempt.

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

const samples = deepFreeze(structuredClone(SAMPLES))
const ctx: Ctx = deepFreeze({ samples, now: new Date('2026-10-25T19:42:00Z'), timeZone: 'America/Toronto' })
const FIELDS: FieldKey[] = ['payeeName', 'institution', 'transit', 'account']
const NOT_CHECKED = { payeeName: 'not_checked', institution: 'not_checked', transit: 'not_checked', account: 'not_checked' } as const

// The supplier's demo lines: the account ends 4471, the email asked for …9020.
const HARBOURLINE_REQUESTED: BankDetails = { payeeName: 'Harbourline Lumber Ltd.', institution: '952', transit: '60415', account: '73419020' }
const mismatchStated: BankDetails = { ...HARBOURLINE_REQUESTED, account: '73414471' }

function requestedFor(requestId: string): BankDetails {
  const request = samples.requests.find((r) => r.id === requestId)
  if (!request) throw new Error(`${requestId} missing from samples`)
  return request.requested
}

// A compared-then-saved attempt, shaped as saveAttempt leaves it.
function savedComparison(stated: BankDetails, requestId = 'req-mismatch', personSpokenTo = 'Sam Okafor'): Attempt {
  const { results, outcome } = compareDetails(requestedFor(requestId), stated)
  return deepFreeze({
    id: 'A-001',
    requestId,
    status: 'saved',
    outcome,
    stated: { ...stated },
    personSpokenTo,
    results,
    reason: '',
    comparedAt: '2026-10-25T19:40:00.000Z',
    savedAt: '2026-10-25T19:42:00.000Z',
    recordId: 'PC-20261025-154200-001',
  })
}

// A couldn't-verify attempt, shaped as saveCouldntVerify writes it: nothing collected, nothing compared.
function savedCouldntVerify(reason: string, personSpokenTo: string | null): Attempt {
  return deepFreeze({
    id: 'A-001',
    requestId: 'req-mismatch',
    status: 'saved',
    outcome: 'couldnt_verify',
    stated: null,
    personSpokenTo,
    results: { ...NOT_CHECKED },
    reason,
    comparedAt: null,
    savedAt: '2026-10-25T19:42:00.000Z',
    recordId: 'PC-20261025-154200-001',
  })
}

test('VR-2 buildRecord snapshots every PRD field from the attempt, the samples and the save-time clock', () => {
  const record = buildRecord(savedComparison(mismatchStated), ctx, 1)
  expect(record).toEqual({
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
  })
})

// prd.md > Verification records, "Each record shows:", one row per item, with the record keys that carry it.
const prdItems: { id: string; name: string; keys: (keyof VerificationRecord)[] }[] = [
  { id: 'VR-2', name: 'a unique record ID', keys: ['id'] },
  { id: 'VR-2', name: 'the date and time with timezone', keys: ['savedAt', 'timeZone'] },
  { id: 'VR-2', name: 'the supplier name, plus the payment reference, amount and due date', keys: ['supplierName', 'paymentRef', 'amountCents', 'dueDate'] },
  { id: 'VR-2', name: 'which sample email was checked', keys: ['emailRef'] },
  { id: 'VR-2', name: 'the trusted number used', keys: ['trustedNumber'] },
  { id: 'VR-2', name: 'the person spoken to, as the user entered it', keys: ['personSpokenTo'] },
  { id: 'VR-2', name: 'the requested and stated details with a result for each field', keys: ['requested', 'stated', 'results'] },
  { id: 'VR-2', name: 'the overall outcome', keys: ['outcome'] },
  { id: 'VR-2', name: 'the resulting simulated payment status', keys: ['resultingPaymentStatus'] },
  { id: 'VR-2', name: 'the fictional-data label', keys: ['label'] },
]

test.each(prdItems)('$id buildRecord carries $name', ({ keys }) => {
  const record = buildRecord(savedComparison(mismatchStated, 'req-mismatch', '  Sam  Okafor '), ctx, 1)
  for (const key of keys) {
    const value = record[key]
    expect(value, key).toBeDefined()
    expect(value, key).not.toBeNull()
    expect(value, key).not.toBe('')
  }
  expect(record.personSpokenTo).toBe('  Sam  Okafor ')
  for (const details of [record.requested, record.stated]) {
    expect(Object.keys(details ?? {}), 'every detail field').toEqual(FIELDS)
  }
  expect(Object.keys(record.results)).toEqual(FIELDS)
})

test('VR-2 a reason or note is carried as typed, and a blank one stays blank for the screens to word', () => {
  expect(buildRecord(savedCouldntVerify('No answer', null), ctx, 1).reason).toBe('No answer')
  expect(buildRecord(savedCouldntVerify('', null), ctx, 1).reason).toBe('')
})

test('VR-2 the record ID and saved time come from the save-time clock in the zone passed in, and the position sets NNN', () => {
  const vancouver: Ctx = deepFreeze({ ...ctx, timeZone: 'America/Vancouver' })
  const later: Ctx = deepFreeze({ ...ctx, now: new Date('2026-10-26T03:05:09Z') })
  const attempt = savedComparison(mismatchStated)
  expect(buildRecord(attempt, ctx, 7).id).toBe('PC-20261025-154200-007')
  expect(buildRecord(attempt, vancouver, 1).id).toBe('PC-20261025-124200-001')
  expect(buildRecord(attempt, vancouver, 1).timeZone).toBe('America/Vancouver')
  // 03:05:09 UTC on Oct 26 is still Oct 25 in Toronto.
  expect(buildRecord(attempt, later, 12).id).toBe('PC-20261025-230509-012')
  expect(buildRecord(attempt, later, 12).savedAt).toBe('2026-10-26T03:05:09.000Z')
})

test('VR-1 VR-2 the record is a snapshot: its details are copies, never the attempt\'s or the samples\' own objects', () => {
  const attempt = savedComparison(mismatchStated)
  const record = buildRecord(attempt, ctx, 1)
  expect(record.requested).toEqual(requestedFor('req-mismatch'))
  expect(record.requested).not.toBe(requestedFor('req-mismatch'))
  expect(record.stated).toEqual(attempt.stated)
  expect(record.stated).not.toBe(attempt.stated)
  expect(record.results).toEqual(attempt.results)
  expect(record.results).not.toBe(attempt.results)
  // The inputs are deep-frozen, and the record is not: it is a new object.
  expect(Object.isFrozen(record)).toBe(false)
})

const outcomeRows: { id: string; name: string; attempt: Attempt; outcome: string; status: string }[] = [
  { id: 'VR-2 OS-1', name: 'a full match → "Ready to pay"', attempt: savedComparison(HARBOURLINE_REQUESTED), outcome: 'verified', status: 'Ready to pay' },
  { id: 'VR-2 OS-2', name: 'a mismatch → "On hold—details do not match"', attempt: savedComparison(mismatchStated), outcome: 'mismatch', status: 'On hold—details do not match' },
  { id: 'VR-2 OS-3', name: 'couldn\'t verify → "On hold—verification incomplete"', attempt: savedCouldntVerify('No answer', null), outcome: 'couldnt_verify', status: 'On hold—verification incomplete' },
]

test.each(outcomeRows)('$id resulting payment status: $name', ({ attempt, outcome, status }) => {
  const record = buildRecord(attempt, ctx, 1)
  expect(record.outcome).toBe(outcome)
  expect(record.resultingPaymentStatus).toBe(status)
})

test('VR-2 VR-3 a couldn\'t-verify record: stated null, four "not_checked", the person blank stays null', () => {
  const record = buildRecord(savedCouldntVerify('Supplier couldn\'t confirm', null), ctx, 1)
  expect(record.stated).toBeNull()
  expect(record.results).toEqual(NOT_CHECKED)
  expect(record.personSpokenTo).toBeNull()
  expect(record.requested).toEqual(HARBOURLINE_REQUESTED)
  expect(record.reason).toBe('Supplier couldn\'t confirm')
})

test('VR-2 the Cedarline record names its own supplier, payment, email and on-file number', () => {
  const stated: BankDetails = { payeeName: 'Cedarline Electrical Supply Inc.', institution: '958', transit: '40388', account: '3307126' }
  const record = buildRecord(savedComparison(stated, 'req-legit', 'Priya Natarajan'), ctx, 2)
  expect(record).toMatchObject({
    id: 'PC-20261025-154200-002',
    requestId: 'req-legit',
    supplierName: 'Cedarline Electrical Supply Inc.',
    paymentRef: 'PR-2026-1043',
    amountCents: 527340,
    dueDate: '2026-10-30',
    emailRef: 'New bank account for Cedarline Electrical Supply Inc. (received Oct 22, 2026)',
    trustedNumber: '519-555-0163',
    personSpokenTo: 'Priya Natarajan',
    outcome: 'verified',
    resultingPaymentStatus: 'Ready to pay',
  })
})

test('VR-2 buildRecord refuses an attempt whose request is not in the samples', () => {
  const stray = deepFreeze({ ...savedComparison(mismatchStated), requestId: 'req-nope' })
  expect(() => buildRecord(stray, ctx, 1)).toThrow('req-nope')
})

const labelRows: { id: string; name: string; stated: BankDetails; field: FieldKey; words: string }[] = [
  {
    id: 'VR-4 CR-8',
    name: 'same last four, earlier digit differs → "Does not match (differs before the last four digits)"',
    stated: { ...HARBOURLINE_REQUESTED, account: '73429020' },
    field: 'account',
    words: 'Does not match (differs before the last four digits)',
  },
  {
    id: 'VR-4 CR-8',
    name: 'same last four once spacing and invisible characters are ignored → the same wording',
    stated: { ...HARBOURLINE_REQUESTED, account: '7342 90​20' },
    field: 'account',
    words: 'Does not match (differs before the last four digits)',
  },
  {
    id: 'VR-4',
    name: 'last four differ (…4471 vs …9020) → "Does not match"',
    stated: mismatchStated,
    field: 'account',
    words: 'Does not match',
  },
  {
    id: 'VR-4',
    name: 'a shorter account with the same last four → the last-four wording',
    stated: { ...HARBOURLINE_REQUESTED, account: '9020' },
    field: 'account',
    words: 'Does not match (differs before the last four digits)',
  },
  {
    id: 'VR-4',
    name: 'account matches once spacing is ignored → "Matches"',
    stated: { ...HARBOURLINE_REQUESTED, account: '7341 9020' },
    field: 'account',
    words: 'Matches',
  },
  {
    id: 'VR-4',
    name: 'a transit that differs is never given the last-four wording',
    stated: { ...HARBOURLINE_REQUESTED, transit: '70415' },
    field: 'transit',
    words: 'Does not match',
  },
  {
    id: 'VR-4',
    name: 'an institution that differs only before its last digits still reads "Does not match"',
    stated: { ...HARBOURLINE_REQUESTED, institution: '1952' },
    field: 'institution',
    words: 'Does not match',
  },
  {
    id: 'VR-4',
    name: 'the institution, shown in full, matches → "Matches"',
    stated: mismatchStated,
    field: 'institution',
    words: 'Matches',
  },
]

test.each(labelRows)('$id recordResultLabel on a built record: $name', ({ stated, field, words }) => {
  const record = buildRecord(savedComparison(stated), ctx, 1)
  expect(recordResultLabel(field, record)).toBe(words)
})

test('VR-4 VR-3 recordResultLabel on a built couldn\'t-verify record → "Not checked" for every field, the account included', () => {
  const record = buildRecord(savedCouldntVerify('No answer', null), ctx, 1)
  expect(FIELDS.map((field) => recordResultLabel(field, record))).toEqual(['Not checked', 'Not checked', 'Not checked', 'Not checked'])
})

test('VR-4 the last-four wording appears only for an account row the comparison marked as a mismatch', () => {
  const record = buildRecord(savedComparison({ ...HARBOURLINE_REQUESTED, account: '73429020' }), ctx, 1)
  expect(FIELDS.map((field) => recordResultLabel(field, record))).toEqual([
    'Matches',
    'Matches',
    'Matches',
    'Does not match (differs before the last four digits)',
  ])
  const matched = buildRecord(savedComparison(HARBOURLINE_REQUESTED), ctx, 1)
  expect(FIELDS.map((field) => recordResultLabel(field, matched))).toEqual(['Matches', 'Matches', 'Matches', 'Matches'])
})
