import { describe, expect, test } from 'vitest'
import type { BankDetails, ChangeRequest, Supplier } from '../kernel/types'
import { SAMPLES } from './samples'

// The fiction rules from spec.md > Sample data, and the contact completeness scan from
// spec.md > Untrusted contacts in the email. Several end-to-end checks only mean something if the data
// differs in the right places, so these run before anything else trusts the samples.

const { suppliers, payments, requests } = SAMPLES

// What the Call-back step shows besides the supplier: written out literally, never imported from copy.ts.
const SCRIPT =
  'We received a request to change your payment details. Please state the account-holder name and the institution, transit and account numbers we should use.'
const FIELD_LABELS = [
  'Account-holder/payee name',
  'Institution number',
  'Transit/branch number',
  'Full account number',
  'Name of person spoken to',
]

const PHONE_SHAPE = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g
const FICTIONAL_PHONE = /^519-555-01\d\d$/
// A floor, not proof: well-known assigned institution numbers.
const ASSIGNED_INSTITUTIONS = ['001', '002', '003', '004', '006', '010', '016', '030', '039', '614', '815', '828']
const STOCK_LOCAL_WORDS = ['Grand River', 'Conestoga', 'Kitchener', 'Waterloo']
// Also a floor: banks and credit unions a Waterloo Region reader would recognise.
const REAL_BANKS = [
  'RBC', 'Royal Bank', 'TD', 'Toronto-Dominion', 'Scotiabank', 'Nova Scotia', 'BMO', 'Bank of Montreal', 'CIBC',
  'National Bank', 'Desjardins', 'HSBC', 'Tangerine', 'Simplii', 'Laurentian', 'EQ Bank', 'Libro', 'Meridian',
  'Kindred', 'Alterna', 'Vancity', 'ATB',
]

type Span = { start: number; end: number; text: string }

function byId<T extends { id: string }>(items: T[], id: string): T {
  const found = items.find((item) => item.id === id)
  if (!found) throw new Error(`no ${id} in the samples`)
  return found
}
const supplierOf = (request: ChangeRequest): Supplier => byId(suppliers, request.supplierId)
const emailFields = (request: ChangeRequest) => [request.email.from, request.email.subject, request.email.body]
const digits = (value: string) => value.replace(/\D/g, '')

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(allStrings)
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(allStrings)
  return []
}

// Every place `needle` occurs in `text`, found literally (never through a RegExp built from it).
function occurrences(text: string, needle: string): Span[] {
  const spans: Span[] = []
  if (needle === '') return spans
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    spans.push({ start: at, end: at + needle.length, text: needle })
  }
  return spans
}

// Hosts named in a string: links, email addresses and bare domain names. Sentence punctuation is trimmed first.
function hostsIn(text: string): string[] {
  return text.split(/\s+/).flatMap((word) => {
    const token = word.replace(/^[("'<[]+/, '').replace(/[)"'>\],.;:!?]+$/, '')
    if (token.includes('://')) return [new URL(token).hostname]
    if (token.includes('@')) return [token.slice(token.lastIndexOf('@') + 1).toLowerCase()]
    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(token)) return [token.toLowerCase()]
    return []
  })
}

// Step 1 of the scan: each requested value becomes spaces of the same length, so positions stay put. A value
// only counts where no digit touches it, so blanking can never cut into (and hide) a phone number.
function blankRequested(text: string, requested: BankDetails): string {
  let out = text
  const values = Object.values(requested).sort((a, b) => b.length - a.length)
  for (const value of values) {
    for (const span of occurrences(out, value)) {
      if (/\d/.test(out[span.start - 1] ?? '') || /\d/.test(out[span.end] ?? '')) continue
      out = out.slice(0, span.start) + ' '.repeat(value.length) + out.slice(span.end)
    }
  }
  return out
}

// Step 2: every token containing .example, and every phone shape.
function contactLikeSpans(text: string): Span[] {
  const spans: Span[] = []
  for (const match of text.matchAll(/\S*\.example\S*/g)) {
    const lead = (/^[("'<[]*/.exec(match[0])?.[0] ?? '').length
    const token = match[0].slice(lead).replace(/[)"'>\],.;:!?]+$/, '')
    spans.push({ start: match.index + lead, end: match.index + lead + token.length, text: token })
  }
  for (const match of text.matchAll(PHONE_SHAPE)) {
    spans.push({ start: match.index, end: match.index + match[0].length, text: match[0] })
  }
  return spans
}

// Step 3: what the scan finds that no contacts entry covers. Empty means every contact will be marked untrusted.
function scanEmail(request: ChangeRequest): { found: string[]; uncovered: string[] } {
  const found: string[] = []
  const uncovered: string[] = []
  for (const field of emailFields(request)) {
    const text = blankRequested(field, request.requested)
    const marked = request.email.contacts.flatMap((contact) => occurrences(text, contact.value))
    for (const span of contactLikeSpans(text)) {
      found.push(span.text)
      if (!marked.some((m) => m.start <= span.start && span.end <= m.end)) uncovered.push(span.text)
    }
  }
  return { found, uncovered }
}

describe('fiction rules', () => {
  test('RQ-2 OV-7 every domain, address and link ends in .example', () => {
    const hosts = allStrings(SAMPLES).flatMap(hostsIn)
    expect(hosts.length).toBeGreaterThanOrEqual(requests.length) // guard: the scan sees the From addresses
    for (const host of hosts) expect(host).toMatch(/\.example$/)
    for (const contact of requests.flatMap((r) => r.email.contacts)) {
      if (contact.kind === 'email') expect(contact.value).toMatch(/^[^\s@]+@[^\s@]+\.example$/)
      if (contact.kind === 'link') expect(new URL(contact.value).hostname).toMatch(/\.example$/)
    }
  })

  test('RQ-2 CB-1 OV-7 every phone is in the fictional 519-555-0100 to 0199 range', () => {
    const phones = [
      ...suppliers.map((s) => s.onFilePhone),
      ...requests.flatMap((r) => r.email.contacts.filter((c) => c.kind === 'phone').map((c) => c.value)),
      ...allStrings(SAMPLES).flatMap((text) => [...text.matchAll(PHONE_SHAPE)].map((m) => m[0])),
    ]
    expect(phones.length).toBeGreaterThan(suppliers.length) // guard: email phones are included
    for (const phone of phones) expect(phone).toMatch(FICTIONAL_PHONE)
  })

  test('OV-7 institution numbers avoid well-known assigned ones', () => {
    const institutions = [...suppliers.map((s) => s.onFile.institution), ...requests.map((r) => r.requested.institution)]
    // padStart also catches a short form such as "4" for "004".
    for (const institution of institutions) expect(ASSIGNED_INSTITUTIONS).not.toContain(institution.padStart(3, '0'))
  })

  test('OV-7 names avoid stock local words and real banks', () => {
    const names = [
      ...suppliers.flatMap((s) => [s.name, s.onFile.payeeName]),
      ...requests.map((r) => r.requested.payeeName),
    ]
    for (const name of names) {
      for (const word of STOCK_LOCAL_WORDS) expect(name.toLowerCase()).not.toContain(word.toLowerCase())
    }
    const everything = allStrings(SAMPLES).join('\n')
    for (const bank of REAL_BANKS) expect(everything).not.toMatch(new RegExp(`\\b${bank}\\b`, 'i'))
  })

  test('CR-4 CR-5 every requested and on-file institution, transit and account is digits only', () => {
    const details = [...suppliers.map((s) => s.onFile), ...requests.map((r) => r.requested)]
    for (const d of details) {
      for (const value of [d.institution, d.transit, d.account]) expect(value).toMatch(/^[0-9]+$/)
    }
  })

  test('CR-4 OV-5 at least one on-file transit starts with 0', () => {
    expect(suppliers.some((s) => s.onFile.transit.startsWith('0'))).toBe(true)
  })

  test('CR-3 CR-7 each request changes the account, and req-mismatch requests one ending in 9020', () => {
    for (const request of requests) expect(request.requested.account).not.toBe(supplierOf(request).onFile.account)
    expect(byId(requests, 'req-mismatch').requested.account).toMatch(/9020$/)
  })

  test('RQ-1 CB-4 each email body states the institution, transit and account it requests', () => {
    for (const request of requests) {
      const { institution, transit, account } = request.requested
      for (const value of [institution, transit, account]) expect(request.email.body).toContain(value)
    }
  })

  test('OV-1 OV-3 OV-4 5 suppliers and 5 payments, exactly 2 with a requestId, and every ID resolves', () => {
    expect(suppliers).toHaveLength(5)
    expect(payments).toHaveLength(5)
    expect(requests).toHaveLength(2)
    expect(payments.filter((p) => p.requestId !== undefined)).toHaveLength(2)
    for (const list of [suppliers, payments, requests]) {
      expect(new Set(list.map((item) => item.id)).size).toBe(list.length)
    }
    for (const payment of payments) {
      byId(suppliers, payment.supplierId)
      if (payment.requestId === undefined) continue
      const request = byId(requests, payment.requestId)
      expect(request.paymentId).toBe(payment.id)
      expect(request.supplierId).toBe(payment.supplierId)
    }
    for (const request of requests) {
      supplierOf(request)
      expect(byId(payments, request.paymentId).requestId).toBe(request.id)
    }
  })
  // The requested payee name may equal the supplier's name, so it is deliberately left out of CB-4 below.
})

describe('contacts and the call-back step', () => {
  test.each(requests)('RQ-2 $id: every .example token and phone shape in the email is a contacts entry', (request) => {
    const { found, uncovered } = scanEmail(request)
    expect(found).toContain(request.email.from) // guard: the scan really reads the email
    expect(found.some((text) => FICTIONAL_PHONE.test(text))).toBe(true)
    expect(uncovered).toEqual([])
    // Every entry is really in the email, so marking it means something.
    const text = emailFields(request).join('\n')
    for (const contact of request.email.contacts) expect(text).toContain(contact.value)
  })

  test('RQ-2 the scan catches an unmarked phone and address, and ignores a requested account', () => {
    const base = byId(requests, 'req-mismatch')
    const probe: ChangeRequest = {
      ...base,
      email: {
        ...base.email,
        body: 'New account: 519-555-0177. Call (519) 555-0199 or mail help@probe.example.',
        contacts: [{ kind: 'email', value: base.email.from }],
      },
      // Phone-shaped on purpose: blanking requested values first is what keeps it out of the findings.
      requested: { ...base.requested, account: '519-555-0177' },
    }
    expect(scanEmail(probe).uncovered).toEqual(['help@probe.example', '(519) 555-0199'])
  })

  test.each(requests)("CB-1 $id: the email's phone numbers differ from the supplier's on-file phone", (request) => {
    const onFile = digits(supplierOf(request).onFilePhone)
    const emailPhones = [
      ...request.email.contacts.filter((c) => c.kind === 'phone').map((c) => c.value),
      ...emailFields(request).flatMap((text) => [...text.matchAll(PHONE_SHAPE)].map((m) => m[0])),
    ]
    expect(emailPhones.length).toBeGreaterThan(0) // guard: there is an email phone to tell apart
    for (const phone of emailPhones) expect(digits(phone)).not.toBe(onFile)
  })

  test.each(requests)(
    'CB-4 $id: no requested institution, transit or account is inside the supplier name, on-file phone, script or labels',
    (request) => {
      const supplier = supplierOf(request)
      const shownOnCallback = [supplier.name, supplier.onFilePhone, SCRIPT, ...FIELD_LABELS]
      const { institution, transit, account } = request.requested
      for (const value of [institution, transit, account]) {
        for (const text of shownOnCallback) expect(text, `${value} inside "${text}"`).not.toContain(value)
      }
    },
  )
})
