import { BackLink } from '../components/BackLink'
import { Icon, type IconName } from '../components/Icon'
import { BUTTONS, CAPTIONS, COLUMNS, DETAIL_LABELS, HEADINGS, HOLD_LINE, RECORD_LABELS, RESULT_WORDS } from '../copy'
import { comparisonLine } from '../kernel/compare'
import { FIELD_KEYS, type Attempt, type BankDetails, type FieldResult } from '../kernel/types'

// Reads the locked attempt from saved state, never from the form, so Back and a reload show the same result.
// Values are shown in full here: masking is for the Overview and records only.

type Props = { supplierName: string; requested: BankDetails; attempt: Attempt; onSave: () => void }

const RESULT_ICON: Record<FieldResult, IconName> = { match: 'check', mismatch: 'cross', not_checked: 'dash' }
const RESULT_CLASS: Record<FieldResult, string> = {
  match: 'result result-match',
  mismatch: 'result result-mismatch',
  not_checked: 'result result-not-checked',
}

export function Comparison({ supplierName, requested, attempt, onSave }: Props) {
  const stated = attempt.stated
  const mismatch = attempt.outcome !== 'verified'
  const overall = stated === null ? '' : comparisonLine(requested, stated, attempt.results)

  return (
    <>
      <h1 tabIndex={-1} aria-describedby="comparison-summary comparison-hold">
        {HEADINGS.comparison(supplierName)}
      </h1>
      <p id="comparison-summary" data-testid="overall" className={mismatch ? 'overall overall-bad' : 'overall overall-ok'}>
        <Icon name={mismatch ? 'cross' : 'check'} />
        {overall}
      </p>
      <p id="comparison-hold" className="hold-line">
        <Icon name="clock" />
        {HOLD_LINE}
      </p>

      <div className="table-wrap">
        <table className="comparison">
          <caption>{CAPTIONS.comparison}</caption>
          <thead>
            <tr>
              <th scope="col">{COLUMNS.detail}</th>
              <th scope="col">{COLUMNS.requested}</th>
              <th scope="col">{COLUMNS.stated}</th>
              <th scope="col">{COLUMNS.result}</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_KEYS.map((key) => {
              const result = attempt.results[key]
              return (
                <tr key={key} className={result === 'mismatch' ? 'row-mismatch' : undefined}>
                  <th scope="row">{DETAIL_LABELS[key]}</th>
                  {/* In full and monospaced; numbers never wrap, a payee name may. */}
                  <td className={key === 'payeeName' ? 'mono wrap' : 'mono'}>{requested[key]}</td>
                  <td className={key === 'payeeName' ? 'mono wrap' : 'mono'}>{stated?.[key] ?? ''}</td>
                  <td className={RESULT_CLASS[result]}>
                    <Icon name={RESULT_ICON[result]} />
                    {RESULT_WORDS[result]}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <dl className="pairs comparison-person">
        <div className="pair">
          <dt>{RECORD_LABELS.personSpokenTo}</dt>
          <dd>{attempt.personSpokenTo ?? ''}</dd>
        </div>
      </dl>

      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={onSave}>
          {BUTTONS.saveAttempt}
        </button>
        {/* Navigation only: the locked result stays saved and reopens from the Overview. */}
        <BackLink />
      </div>
    </>
  )
}
