import { toHash } from '../app/routes'
import { Icon, type IconName } from '../components/Icon'
import { MaskedAccount } from '../components/MaskedAccount'
import { PaymentStatusLine, StatusBadge } from '../components/StatusBadge'
import {
  BUTTONS,
  CAPTIONS,
  COLUMNS,
  DETAIL_LABELS,
  HEADINGS,
  NOT_RECORDED,
  NO_REASON,
  RECORD_HONESTY,
  RECORD_LABELS,
  SAVED,
} from '../copy'
import { formatCAD, formatDateOnly, formatSavedTime } from '../kernel/format'
import { isBlank } from '../kernel/normalize'
import { recordResultLabel } from '../kernel/record'
import { FIELD_KEYS, type FieldKey, type FieldResult, type VerificationRecord } from '../kernel/types'

// Prints only from the record's own snapshot, so a later attempt or an edited sample can't change it.
// The account is masked in both columns; institution and transit stay in full.

type Props = { record: VerificationRecord; canStart: boolean; justSaved: boolean; onStartNew: () => void }

const RESULT_ICON: Record<FieldResult, IconName> = { match: 'check', mismatch: 'cross', not_checked: 'dash' }
const RESULT_CLASS: Record<FieldResult, string> = {
  match: 'result result-match',
  mismatch: 'result result-mismatch',
  not_checked: 'result result-not-checked',
}

function DetailValue({ field, value }: { field: FieldKey; value: string | undefined }) {
  if (value === undefined) return <>{NOT_RECORDED}</>
  if (field === 'account') return <MaskedAccount value={value} />
  return <span className="mono">{value}</span>
}

export function RecordView({ record, canStart, justSaved, onStartNew }: Props) {
  const person = record.personSpokenTo
  return (
    <>
      <h1 tabIndex={-1} aria-describedby="record-outcome record-status">
        {HEADINGS.record(record.id)}
      </h1>
      <p className="fictional-label">{record.label}</p>
      {justSaved && (
        <p className="saved-note" data-testid="saved-note">
          <Icon name="check" />
          {SAVED}
        </p>
      )}

      <dl className="pairs record-fields" data-testid="record-fields">
        <dt>{RECORD_LABELS.recordId}</dt>
        <dd className="mono">{record.id}</dd>
        <dt>{RECORD_LABELS.savedAt}</dt>
        <dd>{formatSavedTime(record.savedAt, record.timeZone)}</dd>
        <dt>{RECORD_LABELS.outcome}</dt>
        <dd id="record-outcome">
          <StatusBadge outcome={record.outcome} />
        </dd>
        <dd className="honesty">{RECORD_HONESTY}</dd>
        <dt>{RECORD_LABELS.paymentStatus}</dt>
        <dd id="record-status">
          <PaymentStatusLine status={record.resultingPaymentStatus} />
        </dd>
        <dt>{RECORD_LABELS.supplier}</dt>
        <dd>{record.supplierName}</dd>
        <dt>{RECORD_LABELS.paymentRef}</dt>
        <dd className="mono">{record.paymentRef}</dd>
        <dt>{RECORD_LABELS.amount}</dt>
        <dd className="num">{formatCAD(record.amountCents)}</dd>
        <dt>{RECORD_LABELS.dueDate}</dt>
        <dd>{formatDateOnly(record.dueDate)}</dd>
        <dt>{RECORD_LABELS.emailChecked}</dt>
        <dd>{record.emailRef}</dd>
        <dt>{RECORD_LABELS.trustedNumber}</dt>
        <dd className="mono">{record.trustedNumber}</dd>
        <dt>{RECORD_LABELS.personSpokenTo}</dt>
        <dd>{person === null || isBlank(person) ? NOT_RECORDED : person}</dd>
      </dl>

      <div className="table-wrap">
        <table>
          <caption>{CAPTIONS.recordDetails}</caption>
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
              const result = record.results[key]
              return (
                <tr key={key} className={result === 'mismatch' ? 'row-mismatch' : undefined}>
                  <th scope="row">{DETAIL_LABELS[key]}</th>
                  <td>
                    <DetailValue field={key} value={record.requested[key]} />
                  </td>
                  <td>
                    <DetailValue field={key} value={record.stated?.[key]} />
                  </td>
                  <td className={RESULT_CLASS[result]}>
                    <Icon name={RESULT_ICON[result]} />
                    {recordResultLabel(key, record)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* The reason closes the form, after the details, in the PRD's record order. */}
      <dl className="pairs record-reason">
        <dt>{RECORD_LABELS.reason}</dt>
        <dd>{isBlank(record.reason) ? NO_REASON : record.reason}</dd>
      </dl>

      {/* Print is the primary for every outcome: a filled "new attempt" after a mismatch would invite calling
          until it matches. */}
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          {BUTTONS.print}
        </button>
        {canStart && (
          <button type="button" className="btn btn-secondary" onClick={onStartNew}>
            {BUTTONS.newAttempt}
          </button>
        )}
        <a className="btn btn-secondary" href={toHash({ name: 'request', requestId: record.requestId })}>
          {BUTTONS.backToRequest}
        </a>
        <a className="btn btn-secondary" href={toHash({ name: 'overview' })}>
          {BUTTONS.backToOverview}
        </a>
      </div>
    </>
  )
}
