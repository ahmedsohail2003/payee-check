// Pure formatters. The zone is always passed in and the locale pinned, so the laptop's settings can't
// change a printed record.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

// hourCycle 'h23', not hour12: false, which Chrome can print as "24" at midnight.
function zonedParts(date: Date, timeZone: string): Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  }
}

// The calendar day an instant falls on in that zone, as YYYY-MM-DD.
export function localYmd(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone)
  return `${year}-${month}-${day}`
}

// NNN is the record's position, so two saves in the same second still get different IDs.
export function recordIdFor(now: Date, timeZone: string, position: number): string {
  const p = zonedParts(now, timeZone)
  return `PC-${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}-${String(position).padStart(3, '0')}`
}

// Never dateStyle/timeStyle: they throw when combined with timeZoneName.
function formatInstant(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso))
}

// Always the record's own zone, so an Oct 25 record still prints "EDT" after the clocks change.
export function formatSavedTime(iso: string, timeZone: string): string {
  return formatInstant(iso, timeZone)
}

export function formatReceived(iso: string, timeZone: string): string {
  return formatInstant(iso, timeZone)
}

// Built from the string's parts: new Date('2026-10-30') is UTC midnight, which shows as Oct 29 in
// Waterloo Region, so every due date would slip a day.
export function formatDateOnly(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  const month = MONTHS[Number(match?.[2]) - 1]
  if (!match || month === undefined) return ymd
  return `${month} ${Number(match[3])}, ${match[1]}`
}

// en-CA, because en-US would print "CA$12,480.00".
export function formatCAD(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
}
