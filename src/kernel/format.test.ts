import { expect, test } from 'vitest'
import { formatCAD, formatDateOnly, formatReceived, formatSavedTime, localYmd, recordIdFor } from './format'

const ZONE = 'America/Toronto'
// ICU may put a narrow no-break space before AM/PM, so formatted strings are compared with plain spaces.
const plain = (s: string) => s.replace(/\s+/g, ' ')

test('VR-2 one instant gives ID PC-20261025-154200-001 and "Oct 25, 2026, 3:42 PM EDT"', () => {
  const now = new Date('2026-10-25T19:42:00Z')
  expect(recordIdFor(now, ZONE, 1)).toBe('PC-20261025-154200-001')
  expect(plain(formatSavedTime(now.toISOString(), ZONE))).toBe('Oct 25, 2026, 3:42 PM EDT')
})

const idRows = [
  { id: 'VR-2', name: 'local midnight is 000000, never 24', iso: '2026-10-26T04:00:00Z', prefix: 'PC-20261026-000000-' },
  { id: 'VR-2', name: 'local day, not the UTC day', iso: '2026-10-27T02:30:00Z', prefix: 'PC-20261026-223000-' },
  { id: 'VR-2', name: 'one second before local midnight', iso: '2026-10-26T03:59:59Z', prefix: 'PC-20261025-235959-' },
  { id: 'VR-2', name: 'January uses EST offset', iso: '2027-01-15T05:00:00Z', prefix: 'PC-20270115-000000-' },
]

test.each(idRows)('$id record ID: $name', ({ iso, prefix }) => {
  expect(recordIdFor(new Date(iso), ZONE, 1).startsWith(prefix)).toBe(true)
})

test('VR-2 record ID position is zero-padded to three digits', () => {
  const now = new Date('2026-10-25T19:42:00Z')
  expect(recordIdFor(now, ZONE, 2)).toBe('PC-20261025-154200-002')
  expect(recordIdFor(now, ZONE, 12)).toBe('PC-20261025-154200-012')
  expect(recordIdFor(now, ZONE, 123)).toBe('PC-20261025-154200-123')
})

const timeRows = [
  { id: 'VR-2', name: 'January → EST', iso: '2027-01-15T17:05:00Z', zone: ZONE, text: 'Jan 15, 2027, 12:05 PM EST' },
  { id: 'VR-2', name: 'midnight prints 12 AM', iso: '2026-10-26T04:00:00Z', zone: ZONE, text: 'Oct 26, 2026, 12:00 AM EDT' },
  { id: 'VR-2', name: 'the zone passed in, not the machine', iso: '2026-10-25T19:42:00Z', zone: 'America/Vancouver', text: 'Oct 25, 2026, 12:42 PM PDT' },
]

test.each(timeRows)('$id saved time: $name', ({ iso, zone, text }) => {
  expect(plain(formatSavedTime(iso, zone))).toBe(text)
})

test('VR-2 an Oct 25 record still prints EDT, whatever day it is viewed', () => {
  // The record's own zone and instant decide the abbreviation; after Nov 1 the same call is unchanged.
  expect(plain(formatSavedTime('2026-10-25T19:42:00.000Z', ZONE))).toBe('Oct 25, 2026, 3:42 PM EDT')
})

test('VR-2 received time is shown in the zone passed in', () => {
  expect(plain(formatReceived('2026-10-23T09:14:00-04:00', ZONE))).toBe('Oct 23, 2026, 9:14 AM EDT')
  expect(localYmd(new Date('2026-10-23T09:14:00-04:00'), ZONE)).toBe('2026-10-23')
})

const dateRows = [
  { id: 'OV-2', name: '"2026-10-30" → "Oct 30, 2026"', ymd: '2026-10-30', text: 'Oct 30, 2026' },
  { id: 'OV-2', name: 'first of the year', ymd: '2026-01-01', text: 'Jan 1, 2026' },
  { id: 'OV-2', name: 'last of the year', ymd: '2026-12-31', text: 'Dec 31, 2026' },
  { id: 'OV-2', name: 'September', ymd: '2026-09-05', text: 'Sep 5, 2026' },
  { id: 'OV-2', name: 'sample due date Oct 28', ymd: '2026-10-28', text: 'Oct 28, 2026' },
]

test.each(dateRows)('$id date-only: $name', ({ ymd, text }) => {
  expect(formatDateOnly(ymd)).toBe(text)
})

const cadRows = [
  { id: 'OV-2', name: '1248000 cents → "$12,480.00"', cents: 1248000, text: '$12,480.00' },
  { id: 'OV-2', name: '386215 cents → "$3,862.15"', cents: 386215, text: '$3,862.15' },
  { id: 'OV-2', name: '91875 cents → "$918.75"', cents: 91875, text: '$918.75' },
  { id: 'OV-2', name: '43260 cents keeps the trailing zero', cents: 43260, text: '$432.60' },
  { id: 'OV-2', name: '5 cents', cents: 5, text: '$0.05' },
]

test.each(cadRows)('$id CAD: $name', ({ cents, text }) => {
  expect(plain(formatCAD(cents))).toBe(text)
})
