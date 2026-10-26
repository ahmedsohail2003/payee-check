import type { ReactNode } from 'react'
import { toHash } from '../app/routes'
import { Icon, type IconName } from '../components/Icon'
import { MaskedAccount } from '../components/MaskedAccount'
import { PaymentStatusLine, StatusBadge } from '../components/StatusBadge'
import {
  APP_NAME,
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
// The account is masked in both columns; institution and transit stay in full. The layout follows the PRD's
// record order, which is also the printed form's order (spec.md > Print).

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
  return <span className={field === 'payeeName' ? 'mono wrap' : 'mono'}>{value}</span>
}

// One labelled row of the form. `groupStart` opens a new section of it (record, payment, call).
function Pair({ term, groupStart = false, children }: { term: string; groupStart?: boolean; children: ReactNode }) {
  return (
    <div className={groupStart ? 'pair group-start' : 'pair'}>
      <dt>{term}</dt>
      {children}
    </div>
  )
}

export function RecordView({ record, canStart, justSaved, onStartNew }: Props) {
  const person = record.personSpokenTo
  return (
    <>
      {/* On paper the app's header is hidden, so the form names its issuer itself. */}
      <p className="print-only print-app-name">{APP_NAME}</p>
      <h1 tabIndex={-1} aria-describedby="record-outcome record-status">
        {HEADINGS.record(record.id)}
      </h1>
      {/* One wrapping row, so a Saved note that drops below the label lines up with it. */}
      <div className="record-meta">
        <p className="fictional-label">{record.label}</p>
        {justSaved && (
          <p className="saved-note no-print" data-testid="saved-note">
            <Icon name="check" />
            {SAVED}
          </p>
        )}
      </div>

      <div className="sheet record-sheet">
        <dl className="pairs record-fields" data-testid="record-fields">
          <Pair term={RECORD_LABELS.recordId}>
            <dd className="mono">{record.id}</dd>
          </Pair>
          <Pair term={RECORD_LABELS.savedAt}>
            <dd>{formatSavedTime(record.savedAt, record.timeZone)}</dd>
          </Pair>
          <Pair term={RECORD_LABELS.outcome}>
            <dd id="record-outcome">
              <StatusBadge outcome={record.outcome} />
            </dd>
            <dd className="honesty">{RECORD_HONESTY}</dd>
          </Pair>
          <Pair term={RECORD_LABELS.paymentStatus}>
            <dd id="record-status" className="record-status">
              <PaymentStatusLine status={record.resultingPaymentStatus} />
            </dd>
          </Pair>

          <Pair term={RECORD_LABELS.supplier} groupStart>
            <dd>{record.supplierName}</dd>
          </Pair>
          <Pair term={RECORD_LABELS.paymentRef}>
            <dd className="mono">{record.paymentRef}</dd>
          </Pair>
          <Pair term={RECORD_LABELS.amount}>
            <dd className="nowrap">{formatCAD(record.amountCents)}</dd>
          </Pair>
          <Pair term={RECORD_LABELS.dueDate}>
            <dd>{formatDateOnly(record.dueDate)}</dd>
          </Pair>

          <Pair term={RECORD_LABELS.emailChecked} groupStart>
            <dd>{record.emailRef}</dd>
          </Pair>
          <Pair term={RECORD_LABELS.trustedNumber}>
            <dd className="mono">{record.trustedNumber}</dd>
          </Pair>
          <Pair term={RECORD_LABELS.personSpokenTo}>
            <dd>{person === null || isBlank(person) ? NOT_RECORDED : person}</dd>
          </Pair>
        </dl>

        <div className="table-wrap">
          <table className="record-details">
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
          <Pair term={RECORD_LABELS.reason}>
            <dd>{isBlank(record.reason) ? NO_REASON : record.reason}</dd>
          </Pair>
        </dl>
      </div>

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
