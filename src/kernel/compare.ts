import { DETAILS_MATCH, FIELD_LABELS } from '../copy'
import { lastFour, maskAccount } from './mask'
import { normalizeName, normalizeNumber } from './normalize'
import { FIELD_KEYS, type BankDetails, type FieldKey, type FieldResult } from './types'

export type Comparison = { results: Record<FieldKey, 'match' | 'mismatch'>; outcome: 'verified' | 'mismatch' }

// The whole normalised value is compared, every digit, never a last-four shortcut.
function fieldResult(key: FieldKey, requested: BankDetails, stated: BankDetails): 'match' | 'mismatch' {
  const normalize = key === 'payeeName' ? normalizeName : normalizeNumber
  return normalize(requested[key]) === normalize(stated[key]) ? 'match' : 'mismatch'
}

export function compareDetails(requested: BankDetails, stated: BankDetails): Comparison {
  const results: Record<FieldKey, 'match' | 'mismatch'> = {
    payeeName: fieldResult('payeeName', requested, stated),
    institution: fieldResult('institution', requested, stated),
    transit: fieldResult('transit', requested, stated),
    account: fieldResult('account', requested, stated),
  }
  const outcome = FIELD_KEYS.every((key) => results[key] === 'match') ? 'verified' : 'mismatch'
  return { results, outcome }
}

// The account shows as "…NNNN" unless both values end in the same four digits; then both show in full,
// so the line never reads "…9020" against "…9020". Everything else shows as stored.
function shownValues(key: FieldKey, requested: BankDetails, stated: BankDetails): { said: string; asked: string } {
  if (key === 'account' && lastFour(requested.account) !== lastFour(stated.account)) {
    return { said: maskAccount(stated.account), asked: maskAccount(requested.account) }
  }
  return { said: stated[key], asked: requested[key] }
}

export function comparisonLine(
  requested: BankDetails,
  stated: BankDetails,
  results: Record<FieldKey, FieldResult>,
): string {
  const mismatched = FIELD_KEYS.filter((key) => results[key] === 'mismatch')
  const [only] = mismatched
  if (only === undefined) return DETAILS_MATCH
  if (mismatched.length === 1) {
    const { said, asked } = shownValues(only, requested, stated)
    // A requested name such as "Harbourline Lumber Ltd." already ends the sentence; a second stop reads as a typo.
    const stop = asked.endsWith('.') ? '' : '.'
    return `${FIELD_LABELS[only]} does not match: supplier said ${said}, email requested ${asked}${stop}`
  }
  return `${mismatched.length} details do not match: ${mismatched.map((key) => FIELD_LABELS[key]).join(', ')}.`
}
