import { ACCOUNT_ENDING } from '../copy'
import { lastFour, maskAccount } from '../kernel/mask'

// Receives the full value but puts only the last four digits into the DOM. ARIA doesn't allow aria-label on
// a plain span, so the spoken form is visually hidden text instead.
export function MaskedAccount({ value }: { value: string }) {
  return (
    <>
      <span className="mono" aria-hidden="true">
        {maskAccount(value)}
      </span>
      <span className="visually-hidden">
        {ACCOUNT_ENDING} {lastFour(value)}
      </span>
    </>
  )
}
