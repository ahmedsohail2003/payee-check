import { toHash } from '../app/routes'
import { BackLink } from '../components/BackLink'
import { EmailView } from '../components/EmailView'
import { PaymentStatusLine, StatusBadge } from '../components/StatusBadge'
import { BUTTONS, CAPTIONS, COLUMNS, DETAIL_LABELS, HEADINGS, NONE, RECORD_LABELS, REQUEST_VERIFIED } from '../copy'
import type { RequestView } from '../kernel/attempts'
import { formatSavedTime } from '../kernel/format'
import { FIELD_KEYS, type VerificationRecord } from '../kernel/types'

// Unresolved: the email's claim beside what's on file, and the one action that starts the check.
// Verified: the same facts read-only, with the record to print and no way back into a call-back.
// A pending comparison never reaches this screen: the router sends it to /compare.

type Props = { view: RequestView; records: VerificationRecord[]; timeZone: string; onStart: () => void }

function DetailsTable({ view }: { view: RequestView }) {
  const { request, supplier } = view
  return (
    <div className="table-wrap">
      <table>
        <caption>{CAPTIONS.existingVsRequested}</caption>
        <thead>
          <tr>
            <th scope="col">{COLUMNS.detail}</th>
            <th scope="col">{COLUMNS.onFile}</th>
            <th scope="col">{COLUMNS.requested}</th>
          </tr>
        </thead>
        <tbody>
          {FIELD_KEYS.map((key) => (
            <tr key={key}>
              <th scope="row">{DETAIL_LABELS[key]}</th>
              <td className="mono">{supplier.onFile[key]}</td>
              <td className="mono">{request.requested[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AttemptsTable({ view, records, timeZone }: Omit<Props, 'onStart'>) {
  if (view.savedAttempts.length === 0) return null
  return (
    <div className="table-wrap">
      <table>
        <caption>{CAPTIONS.attempts}</caption>
        <thead>
          <tr>
            <th scope="col">{COLUMNS.attempt}</th>
            <th scope="col">{COLUMNS.outcome}</th>
            <th scope="col">{COLUMNS.saved}</th>
            <th scope="col">{COLUMNS.record}</th>
          </tr>
        </thead>
        <tbody>
          {view.savedAttempts.map((attempt) => {
            const record = records.find((r) => r.id === attempt.recordId)
            return (
              <tr key={attempt.id}>
                <th scope="row" className="mono">
                  {attempt.id}
                </th>
                <td>
                  <StatusBadge outcome={attempt.outcome} />
                </td>
                <td>
                  {/* A saved time prints in its record's own zone, never the viewer's. */}
                  {attempt.savedAt === null ? NONE : formatSavedTime(attempt.savedAt, record?.timeZone ?? timeZone)}
                </td>
                <td>
                  {record === undefined ? (
                    NONE
                  ) : (
                    <a className="mono" href={toHash({ name: 'record', recordId: record.id })}>
                      {record.id}
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function RequestDetail({ view, records, timeZone, onStart }: Props) {
  const verified = view.phase === 'verified'
  // Verified is always the last saved attempt: nothing can be added after it.
  const verifiedRecordId = verified ? (view.savedAttempts.at(-1)?.recordId ?? null) : null

  return (
    <>
      <h1 tabIndex={-1} aria-describedby="request-status">
        {HEADINGS.request(view.supplier.name)}
      </h1>
      <p id="request-status" className="status-line">
        {view.requestVerified && <StatusBadge status={REQUEST_VERIFIED} />}
        <PaymentStatusLine status={view.paymentStatus} />
        {view.phase === 'held_incomplete' && view.reason !== null && (
          <span className="reason">
            {RECORD_LABELS.reason}: {view.reason}
          </span>
        )}
      </p>

      <EmailView email={view.request.email} timeZone={timeZone} />
      <DetailsTable view={view} />
      <AttemptsTable view={view} records={records} timeZone={timeZone} />

      {/* Verified reopens read-only: no call-back, no retry, no fields, only the record and Back. */}
      <div className="actions">
        {verified
          ? verifiedRecordId !== null && (
              <a className="btn btn-primary" href={toHash({ name: 'record', recordId: verifiedRecordId })}>
                {BUTTONS.viewRecord}
              </a>
            )
          : view.canStart && (
              <button type="button" className="btn btn-primary" onClick={onStart}>
                {view.savedAttempts.length === 0 ? BUTTONS.startCallback : BUTTONS.tryAgainVerification}
              </button>
            )}
        <BackLink />
      </div>
    </>
  )
}
