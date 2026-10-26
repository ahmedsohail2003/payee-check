import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { SAMPLES } from '../data/samples'
import { segmentEmailText, type Segment } from './untrusted'
import type { Contact } from './types'

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

const samples = deepFreeze(SAMPLES)
const joined = (segments: Segment[]) => segments.map((s) => s.text).join('')
const untrusted = (segments: Segment[]) => segments.filter((s) => s.kind === 'untrusted').map((s) => s.text)
const contacts = (...values: string[]): Contact[] => deepFreeze(values.map((value) => ({ kind: 'link' as const, value })))

const sampleTexts = samples.requests.flatMap((r) => [
  { id: 'RQ-2', name: `${r.id} from`, text: r.email.from, contacts: r.email.contacts },
  { id: 'RQ-2', name: `${r.id} subject`, text: r.email.subject, contacts: r.email.contacts },
  { id: 'RQ-2', name: `${r.id} body`, text: r.email.body, contacts: r.email.contacts },
])

test.each(sampleTexts)('$id segments rejoin to the input: $name', ({ text, contacts: list }) => {
  expect(joined(segmentEmailText(text, list))).toBe(text)
})

test('RQ-2 every contact in the mismatch email body is marked, in reading order', () => {
  const request = samples.requests.find((r) => r.id === 'req-mismatch')
  if (!request) throw new Error('req-mismatch missing from samples')
  const segments = segmentEmailText(request.email.body, request.email.contacts)
  expect(untrusted(segments)).toEqual([
    '519-555-0187',
    'ap@harbourline-pay.example',
    'https://harbourline-pay.example/confirm',
  ])
  // The requested account is a requested detail, not a contact.
  expect(segments.some((s) => s.kind === 'untrusted' && s.text.includes('73419020'))).toBe(false)
})

test('RQ-2 the From address is one whole untrusted segment', () => {
  const request = samples.requests.find((r) => r.id === 'req-mismatch')
  if (!request) throw new Error('req-mismatch missing from samples')
  expect(segmentEmailText(request.email.from, request.email.contacts)).toEqual([
    { kind: 'untrusted', text: 'accounts@harbourline-pay.example' },
  ])
})

test('RQ-2 longest contact first: ap@harbourline-pay.example is marked whole, not just its domain', () => {
  const text = 'Write to ap@harbourline-pay.example today.'
  // The shorter contact is listed first on purpose.
  const segments = segmentEmailText(text, contacts('harbourline-pay.example', 'ap@harbourline-pay.example'))
  expect(segments).toEqual([
    { kind: 'plain', text: 'Write to ' },
    { kind: 'untrusted', text: 'ap@harbourline-pay.example' },
    { kind: 'plain', text: ' today.' },
  ])
})

test('RQ-2 a shorter contact still marks its own separate occurrences', () => {
  const text = 'ap@harbourline-pay.example or harbourline-pay.example'
  const segments = segmentEmailText(text, contacts('harbourline-pay.example', 'ap@harbourline-pay.example'))
  expect(untrusted(segments)).toEqual(['ap@harbourline-pay.example', 'harbourline-pay.example'])
  expect(joined(segments)).toBe(text)
})

test('RQ-2 contacts match literally, never as a pattern', () => {
  const text = 'abc then a.c then https://x.example/?q=1 then https://x.example/q=1'
  const segments = segmentEmailText(text, contacts('a.c', 'https://x.example/?q=1', '(519) 555-0100'))
  expect(untrusted(segments)).toEqual(['a.c', 'https://x.example/?q=1'])
  expect(joined(segments)).toBe(text)
})

test('RQ-2 no RegExp is built from contacts', () => {
  const source = readFileSync(new URL('./untrusted.ts', import.meta.url), 'utf8')
  expect(source).toContain('indexOf(')
  expect(source).not.toMatch(/new RegExp|RegExp\(|\.match\(|\.matchAll\(|\.search\(|\.split\(|\.replace\(/)
})

test('RQ-2 a repeated contact is marked every time', () => {
  const text = 'Call 519-555-0187. Again: 519-555-0187'
  expect(untrusted(segmentEmailText(text, contacts('519-555-0187')))).toEqual(['519-555-0187', '519-555-0187'])
})

const edgeRows = [
  { id: 'RQ-2', name: 'no contacts → one plain segment', text: 'Hello', list: [] as string[], out: [{ kind: 'plain', text: 'Hello' }] },
  { id: 'RQ-2', name: 'empty text → no segments', text: '', list: ['a@b.example'], out: [] },
  { id: 'RQ-2', name: 'empty contact value is ignored', text: 'Hello', list: [''], out: [{ kind: 'plain', text: 'Hello' }] },
  { id: 'RQ-2', name: 'contact not in the text', text: 'Hello', list: ['x@y.example'], out: [{ kind: 'plain', text: 'Hello' }] },
  {
    id: 'RQ-2',
    name: 'contacts back to back',
    text: 'a@b.example519-555-0100',
    list: ['519-555-0100', 'a@b.example'],
    out: [
      { kind: 'untrusted', text: 'a@b.example' },
      { kind: 'untrusted', text: '519-555-0100' },
    ],
  },
]

test.each(edgeRows)('$id $name', ({ text, list, out }) => {
  const segments = segmentEmailText(text, contacts(...list))
  expect(segments).toEqual(out)
  expect(joined(segments)).toBe(text)
})
