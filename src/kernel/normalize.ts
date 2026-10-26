// Two values match only if they are the same apart from spacing, invisible characters and (for names)
// letter case. Nothing here is fuzzy: hyphens, dots, look-alike letters and full-width digits are real
// differences a person can see, so they stay in and hold the payment.

// Zero-width spaces, word joiners, soft hyphens and direction marks ride along on copy-paste and would
// make two identical-looking values "not match".
export function stripInvisible(v: string): string {
  return v.replace(/\p{Cf}/gu, '')
}

// \s already covers tabs, line breaks, NBSP (U+00A0) and narrow NBSP (U+202F). The result stays a string:
// as a number, "004" would equal "4".
export function normalizeNumber(v: string): string {
  return stripInvisible(v).replace(/\s/g, '')
}

// NFC makes a precomposed "é" equal "e" + combining accent. toLowerCase, never toUpperCase ("ß" becomes
// "SS") and never localeCompare/Intl.Collator (base sensitivity would make "Société" equal "Societe").
export function normalizeName(v: string): string {
  return stripInvisible(v).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
}

// The only definition of blank: the missing refusal, personSpokenTo -> null and "No reason recorded" all
// use it, so a field holding only spaces or a zero-width space can never reach "Verified".
export function isBlank(v: string): boolean {
  return normalizeName(v) === ''
}
