import { useEffect, useRef, useState } from 'react'
import type { CompareResult } from '../app/useAppState'
import { BackLink } from '../components/BackLink'
import { Icon } from '../components/Icon'
import {
  BUTTONS,
  CALLBACK_HONESTY,
  FIELD_LABELS,
  HEADINGS,
  MISSING,
  MISSING_HEADING,
  SCRIPT,
  TRUSTED_TAG,
} from '../copy'
import { ANSWER_KEYS, type AnswerKey, type Answers, type CallbackView } from '../kernel/types'

// Request-blind by type: this screen only ever gets a CallbackView (supplier name and on-file number), so the
// claim being checked can't reach it even by mistake. Typing lives only in this component's state, so
// Back or a reload before Compare discards it.

type Props = { view: CallbackView; onCompare: (answers: Answers) => CompareResult }

const BLANK: Answers = { payeeName: '', institution: '', transit: '', account: '', personSpokenTo: '' }
const NUMERIC: ReadonlySet<AnswerKey> = new Set<AnswerKey>(['institution', 'transit', 'account'])

const inputId = (key: AnswerKey) => `answer-${key}`

export function CallbackStep({ view, onCompare }: Props) {
  const [answers, setAnswers] = useState<Answers>(BLANK)
  const [missing, setMissing] = useState<AnswerKey[]>([])
  const [refusals, setRefusals] = useState(0)
  const summaryRef = useRef<HTMLDivElement>(null)
  const inputs = useRef<Partial<Record<AnswerKey, HTMLInputElement | null>>>({})

  // A refused Compare moves focus to the summary, so the reason is heard right away.
  useEffect(() => {
    if (refusals > 0) summaryRef.current?.focus()
  }, [refusals])

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

      <div className="fields">
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
                className={numeric ? 'mono' : undefined}
                maxLength={numeric ? 30 : 100}
                value={answers[key]}
                onChange={(event) => {
                  const value = event.target.value
                  setAnswers((current) => ({ ...current, [key]: value }))
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
        <button type="button" className="btn btn-primary" onClick={handleCompare}>
          {BUTTONS.compare}
        </button>
        {/* TODO(slice 3): this disclosure opens the Couldn't verify panel. */}
        <button type="button" className="btn btn-secondary" aria-expanded={false}>
          {BUTTONS.couldntVerify}
        </button>
        {/* Navigation only: the typing lives in this component, so leaving discards it. */}
        <BackLink />
      </div>
    </>
  )
}
