import { normalizeNumber } from './normalize'

// Taken from the normalised value, so "12 3490 20" gives "9020", never "0 20".
export function lastFour(v: string): string {
  return normalizeNumber(v).slice(-4)
}

// Display only: masking limits what a screen or printout shows. It is not encryption.
export function maskAccount(v: string): string {
  return '…' + lastFour(v)
}
