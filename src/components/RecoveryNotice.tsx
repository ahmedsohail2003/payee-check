import { APP_NAME, RECOVERY } from '../copy'
import { ResetDemoButton } from './ResetDialog'

const MESSAGE_ID = 'recovery-message'

// Replaces the app when the saved data is invalid. It takes nothing from that data, so no status, record or
// name from it can be shown, and the data stays untouched until Reset demo is confirmed.
export function RecoveryNotice({ onReset }: { onReset: () => boolean }) {
  return (
    <>
      <h1 tabIndex={-1} aria-describedby={MESSAGE_ID}>
        {APP_NAME}
      </h1>
      <p id={MESSAGE_ID}>{RECOVERY}</p>
      <div className="actions">
        <ResetDemoButton onReset={onReset} primary />
      </div>
    </>
  )
}
