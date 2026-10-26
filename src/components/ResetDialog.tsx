import { useEffect, useRef, useState } from 'react'
import { RESET } from '../copy'

type DialogProps = { open: boolean; onCancel: () => void; onConfirm: () => void }

const HEADING_ID = 'reset-dialog-heading'
const BODY_ID = 'reset-dialog-body'

// A native modal <dialog>: the page behind it is inert and Esc is the browser's own cancel. Focus goes to
// Cancel, never to the first button showModal() would pick, so a stray Enter can't reset. The dialog closes
// itself before telling the caller, because the page stays inert (and can't take focus) while it's open.
export function ResetDialog({ open, onCancel, onConfirm }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (open && !dialog.open) {
      dialog.showModal()
      cancelRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const close = () => {
    if (dialogRef.current?.open) dialogRef.current.close()
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={HEADING_ID}
      aria-describedby={BODY_ID}
      onCancel={(event) => {
        // Esc is Cancel: nothing changes.
        event.preventDefault()
        close()
        onCancel()
      }}
    >
      <h2 id={HEADING_ID}>{RESET.heading}</h2>
      <p id={BODY_ID}>{RESET.body}</p>
      <div className="actions">
        <button
          ref={cancelRef}
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            close()
            onCancel()
          }}
        >
          {RESET.cancel}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            close()
            onConfirm()
          }}
        >
          {RESET.confirm}
        </button>
      </div>
    </dialog>
  )
}

type ButtonProps = { onReset: () => boolean; primary?: boolean }

// "Reset demo" and its confirmation, shared by the Overview (outlined, below both tables) and the Recovery
// notice (its one primary). Cancel or Esc returns focus to this button. A successful reset leaves focus to
// the app, which moves it to the Overview heading; a failed one comes back here while the banner speaks.
export function ResetDemoButton({ onReset, primary = false }: ButtonProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const refocus = () => buttonRef.current?.focus()

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={primary ? 'btn btn-primary' : 'btn btn-secondary'}
        onClick={() => setOpen(true)}
      >
        {RESET.action}
      </button>
      <ResetDialog
        open={open}
        onCancel={() => {
          setOpen(false)
          refocus()
        }}
        onConfirm={() => {
          setOpen(false)
          if (!onReset()) refocus()
        }}
      />
    </>
  )
}
