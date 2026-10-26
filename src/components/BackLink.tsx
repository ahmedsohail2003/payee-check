import { toHash } from '../app/routes'
import { BUTTONS } from '../copy'

// The PRD's visible word is "Back"; the hidden rest makes "Back to overview", so a links list never shows
// several identical "Back"s. aria-label pins that name, as the hidden span alone could gain a stray space.
const BACK_DESTINATION = BUTTONS.backToOverview.slice(BUTTONS.back.length)

export function BackLink() {
  return (
    <a className="btn btn-secondary" href={toHash({ name: 'overview' })} aria-label={BUTTONS.backToOverview}>
      {BUTTONS.back}
      <span className="visually-hidden">{BACK_DESTINATION}</span>
    </a>
  )
}
