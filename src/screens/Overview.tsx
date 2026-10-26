import { toHash } from '../app/routes'
import { MaskedAccount } from '../components/MaskedAccount'
import { ResetDemoButton } from '../components/ResetDialog'
import { PaymentStatusLine } from '../components/StatusBadge'
import {
  BUTTONS,
  CAPTIONS,
  COLUMNS,
  FICTIONAL_LABEL,
  HEADINGS,
  NONE,
  NO_AI_NOTE,
  RECORD_LABELS,
  STATUS,
  WHO_FOR,
} from '../copy'
import { deriveRequestView, paymentStatusForPayment } from '../kernel/attempts'
import { formatCAD, formatDateOnly } from '../kernel/format'
import type { Payment, PaymentStatus, PersistedState, Samples } from '../kernel/types'

// onReset reports whether the saved data was really cleared; on success the app focuses this screen's heading.
type Props = { state: PersistedState; samples: Samples; onReset: () => boolean }

// A row still waiting on a check gets a rule in its status colour at the start of the row. The badge in the
// same row says why in words, with its icon, so the rule never carries meaning alone.
const ATTENTION: Partial<Record<PaymentStatus, string>> = {
  [STATUS.needsVerification]: 'row-hold',
  [STATUS.incomplete]: 'row-hold',
  [STATUS.mismatch]: 'row-bad',
}

function rowClass(payment: Payment, status: PaymentStatus): string | undefined {
  const classes = [payment.requestId === undefined ? null : 'row-flagged', ATTENTION[status] ?? null]
  const joined = classes.filter((c) => c !== null).join(' ')
  return joined === '' ? undefined : joined
}

export function Overview({ state, samples, onReset }: Props) {
  const supplierName = (id: string) => samples.suppliers.find((s) => s.id === id)?.name ?? ''

  return (
    <>
      <h1 tabIndex={-1} aria-describedby="overview-who overview-fictional">
        {HEADINGS.overview}
      </h1>
      <p id="overview-who" className="lead">
        {WHO_FOR}
      </p>
      <div className="intro-meta">
        <p id="overview-fictional" className="fictional-label">
          {FICTIONAL_LABEL}
        </p>
        <p className="hint">{NO_AI_NOTE}</p>
      </div>

      {/* The payment run comes first: it's where the work waiting today is. */}
      <div className="table-wrap">
        <table className="payment-run">
          <caption>{CAPTIONS.paymentRun}</caption>
          <thead>
            <tr>
              <th scope="col">{COLUMNS.supplier}</th>
              <th scope="col">{COLUMNS.reference}</th>
              <th scope="col" className="num">
                {COLUMNS.amount}
              </th>
              <th scope="col">{COLUMNS.dueDate}</th>
              <th scope="col">{COLUMNS.status}</th>
              <th scope="col">{COLUMNS.request}</th>
            </tr>
          </thead>
          <tbody>
            {samples.payments.map((payment) => {
              const name = supplierName(payment.supplierId)
              const status = paymentStatusForPayment(state, payment)
              // The PRD's couldn't-verify state: the payment shows "On hold—verification incomplete" with the
              // reason. The reason is only ever set while that is the payment's status.
              const view = payment.requestId === undefined ? null : deriveRequestView(state, payment.requestId, samples)
              const reason = view?.reason ?? null
              return (
                <tr key={payment.id} className={rowClass(payment, status)}>
                  <th scope="row">{name}</th>
                  <td className="mono">{payment.ref}</td>
                  <td className="num">{formatCAD(payment.amountCents)}</td>
                  <td className="nowrap">{formatDateOnly(payment.dueDate)}</td>
                  <td>
                    <span className="status-stack">
                      <PaymentStatusLine status={status} />
                    </span>
                    {reason !== null && (
                      <span className="status-reason" data-testid="hold-reason">
                        {RECORD_LABELS.reason}: {reason}
                      </span>
                    )}
                  </td>
                  <td>
                    {payment.requestId === undefined ? (
                      <span className="none">{NONE}</span>
                    ) : (
                      // One real link, stretched over the row by CSS; never an onClick on the <tr>. The
                      // aria-label pins the name: the hidden span is absolutely positioned, so it counts as a
                      // block and the computed name would gain a space before the colon.
                      <a
                        className="row-link"
                        href={toHash({ name: 'request', requestId: payment.requestId })}
                        aria-label={`${BUTTONS.reviewRequest}: ${name}`}
                      >
                        {BUTTONS.reviewRequest}
                        <span className="visually-hidden">: {name}</span>
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="table-wrap">
        <table className="supplier-book">
          <caption>{CAPTIONS.supplierBook}</caption>
          <thead>
            <tr>
              <th scope="col">{COLUMNS.supplier}</th>
              <th scope="col">{COLUMNS.trustedPhone}</th>
              <th scope="col">{COLUMNS.institution}</th>
              <th scope="col">{COLUMNS.transit}</th>
              <th scope="col">{COLUMNS.account}</th>
            </tr>
          </thead>
          <tbody>
            {samples.suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <th scope="row">{supplier.name}</th>
                <td className="mono">{supplier.onFilePhone}</td>
                <td className="mono">{supplier.onFile.institution}</td>
                <td className="mono">{supplier.onFile.transit}</td>
                <td>
                  <MaskedAccount value={supplier.onFile.account} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Outlined, never filled: the one destructive action must not be the loudest thing on the page. */}
      <div className="actions">
        <ResetDemoButton onReset={onReset} />
      </div>
    </>
  )
}
