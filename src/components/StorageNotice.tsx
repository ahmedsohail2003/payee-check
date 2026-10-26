import { STORAGE_UNREADABLE } from '../copy'

// Static text, not an alert: it describes the browser, not something that just happened, so it's read in
// page order and never interrupts.
export function StorageNotice() {
  return <p className="notice">{STORAGE_UNREADABLE}</p>
}
