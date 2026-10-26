import { useEffect, useRef, useState } from 'react'
import type { CompareResult, CouldntVerifyInput } from '../app/useAppState'
import { BackLink } from '../components/BackLink'
import { Icon } from '../components/Icon'
import {
  BUTTONS,
  CALLBACK_HONESTY,
  FIELD_LABELS,
  HEADINGS,
  MISSING,
  MISSING_HEADING,
  REASON_HINT,
  REASON_LABEL,
  SCRIPT,
  TRUSTED_TAG,
} from '../copy'
import { ANSWER_KEYS, type AnswerKey, type Answers, type CallbackView } from '../kernel/types'

// Request-blind by type: this screen only ever gets a CallbackView (supplier name and on-file number), so the
// claim being checked can't reach it even by mistake. Typing lives only in this component's state, so
// Back or a reload before Compare discards it, and every new attempt mounts a fresh, blank copy.

type Props = {
  view: CallbackView
  onCompare: (answers: Answers) => CompareResult
  onCouldntVerify: (input: CouldntVerifyInput) => void
  // Called on every change to an answer or the reason (the hook's clearError). After a failed save it clears
  // the banner and its Try again, which would otherwise save the values typed when the save failed, not
  // those on screen.
  onEdit: () => void
}

const BLANK: Answers = { payeeName: '', institution: '', transit: '', account: '', personSpokenTo: '' }
const NUMERIC: ReadonlySet<AnswerKey> = new Set<AnswerKey>(['institution', 'transit', 'account'])

const inputId = (key: AnswerKey) => `answer-${key}`
const PANEL_ID = 'couldnt-verify-panel'
const REASON_ID = 'couldnt-verify-reason'
const REASON_HINT_ID = 'couldnt-verify-reason-hint'

export function CallbackStep({ view, onCompare, onCouldntVerify, onEdit }: Props) {
  const [answers, setAnswers] = useState<Answers>(BLANK)
  const [missing, setMissing] = useState<AnswerKey[]>([])
  const [refusals, setRefusals] = useState(0)
  const [panelOpen, setPanelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const summaryRef = useRef<HTMLDivElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const inputs = useRef<Partial<Record<AnswerKey, HTMLInputElement | null>>>({})

  // A refused Compare moves focus to the summary, so the reason is heard right away.
  useEffect(() => {
    if (refusals > 0) summaryRef.current?.focus()
  }, [refusals])

  // Opening the panel moves focus to its reason field; closing leaves focus on the toggle that was pressed.
  useEffect(() => {
    if (panelOpen) reasonRef.current?.focus()
  }, [panelOpen])

  // No <form> and never disabled: only a deliberate press of Compare may lock, never a stray Enter.
  const handleCompare = () => {
    const result = onCompare(answers)
    if (!result.ok && result.missing !== undefined) {
      setMissing(result.missing)
      setRefusals((n) => n + 1)
    } else {
      setMissing([])
    }
  }

  // Never needs the person spoken to, but whatever was typed there goes on the record.
  const handleCouldntVerify = () => {
    onCouldntVerify({ reason, personSpokenTo: answers.personSpokenTo })
  }

  return (
    <>
      <h1 tabIndex={-1} aria-describedby="trusted-number">
        {HEADINGS.callback(view.supplierName)}
      </h1>
      <p id="trusted-number" data-testid="trusted-number" className="trusted-number">
        <Icon name="shield-check" />
        {TRUSTED_TAG}: <span className="mono">{view.trustedNumber}</span>
      </p>
      <p className="script">{SCRIPT}</p>
      <p className="hint">{CALLBACK_HONESTY}</p>

      {missing.length > 0 && (
        <div className="missing-summary" data-testid="missing-summary" tabIndex={-1} ref={summaryRef}>
          <h2>{MISSING_HEADING}</h2>
          <ul>
            {missing.map((key) => (
              <li key={key}>
                {/* A button, not an in-page anchor: changing the hash would change the route and lose the typing. */}
                <button type="button" className="link-button" onClick={() => inputs.current[key]?.focus()}>
                  {FIELD_LABELS[key]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The answers sit on one white sheet, like the paper form they replace. */}
      <div className="fields form-sheet">
        {ANSWER_KEYS.map((key) => {
          const id = inputId(key)
          const numeric = NUMERIC.has(key)
          const isMissing = missing.includes(key)
          return (
            <div className="field" key={key}>
              <label htmlFor={id}>{FIELD_LABELS[key]}</label>
              <input
                id={id}
                ref={(el) => {
                  inputs.current[key] = el
                }}
                // Never type="number": its value is "" for "1234 567", which would arrive blank.
                type="text"
                autoComplete="off"
                spellCheck={false}
                aria-required="true"
                aria-invalid={isMissing ? 'true' : undefined}
                aria-describedby={isMissing ? `${id}-missing` : undefined}
                inputMode={numeric ? 'numeric' : undefined}
                // Monospaced so digits and leading zeros are easy to check while the supplier reads them out.
                className={numeric ? 'mono' : undefined}
                maxLength={numeric ? 30 : 100}
                value={answers[key]}
                onChange={(event) => {
                  const value = event.target.value
                  setAnswers((current) => ({ ...current, [key]: value }))
                  onEdit()
                }}
              />
              {isMissing && (
                <span className="field-missing" id={`${id}-missing`}>
                  <Icon name="cross" />
                  {MISSING}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="actions">
        {/* While the panel is open its Save attempt is the one next action, so Compare steps down to outlined. */}
        <button type="button" className={panelOpen ? 'btn btn-secondary' : 'btn btn-primary'} onClick={handleCompare}>
          {BUTTONS.compare}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-expanded={panelOpen}
          aria-controls={PANEL_ID}
          onClick={() => setPanelOpen((open) => !open)}
        >
          {BUTTONS.couldntVerify}
        </button>
        {/* Navigation only: the typing lives in this component, so leaving discards it. */}
        <BackLink />
      </div>

      {/* Hidden, not unmounted, when closed: aria-controls always points at it and the reason survives closing. */}
      <fieldset id={PANEL_ID} className="panel" hidden={!panelOpen}>
        <legend>{BUTTONS.couldntVerify}</legend>
        <div className="field">
          <label htmlFor={REASON_ID}>{REASON_LABEL}</label>
          <textarea
            id={REASON_ID}
            ref={reasonRef}
            rows={3}
            maxLength={200}
            autoComplete="off"
            aria-describedby={REASON_HINT_ID}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              onEdit()
            }}
          />
          <p id={REASON_HINT_ID} className="hint">
            {REASON_HINT}
          </p>
        </div>
        <div className="actions">
          {/* Its own Save attempt, under the panel's legend, so it's never mistaken for the Comparison's. Filled
              only while open, so the page never holds two primaries, shown or not. */}
          <button type="button" className={panelOpen ? 'btn btn-primary' : 'btn btn-secondary'} onClick={handleCouldntVerify}>
            {BUTTONS.saveAttempt}
          </button>
        </div>
      </fieldset>
    </>
  )
}
