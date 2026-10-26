import type { Contact } from './types'

export type Segment = { kind: 'plain' | 'untrusted'; text: string }

type Span = { start: number; end: number }

// Every way the email offers to reach the supplier is marked, because in this fraud those contacts lead
// to the fraudster. Matching is literal (indexOf), never a RegExp built from a contact, whose "." or "?"
// would match other text. Longest first with no overlaps, so ap@harbourline-pay.example is marked whole
// rather than only its domain. Only slices of the input are emitted, so the segments rejoin exactly.
export function segmentEmailText(text: string, contacts: Contact[]): Segment[] {
  const values = contacts
    .map((contact) => contact.value)
    .filter((value) => value !== '')
    .sort((a, b) => b.length - a.length)

  const claimed: Span[] = []
  for (const value of values) {
    let at = text.indexOf(value)
    while (at !== -1) {
      const span = { start: at, end: at + value.length }
      const overlaps = claimed.some((c) => span.start < c.end && c.start < span.end)
      if (!overlaps) claimed.push(span)
      at = text.indexOf(value, overlaps ? at + 1 : span.end)
    }
  }
  claimed.sort((a, b) => a.start - b.start)

  const segments: Segment[] = []
  let cursor = 0
  for (const { start, end } of claimed) {
    if (start > cursor) segments.push({ kind: 'plain', text: text.slice(cursor, start) })
    segments.push({ kind: 'untrusted', text: text.slice(start, end) })
    cursor = end
  }
  if (cursor < text.length) segments.push({ kind: 'plain', text: text.slice(cursor) })
  return segments
}
