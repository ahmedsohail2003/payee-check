import { OUTCOME_WORDS, REQUEST_VERIFIED, SIMULATED, STATUS } from '../copy'
import type { Outcome, PaymentStatus } from '../kernel/types'
import { Icon, type IconName } from './Icon'

// Status = colour + icon + words, always. Colour alone would vanish for colour-blind readers and in print.

type Kind = 'ok' | 'hold' | 'bad' | 'neutral'
type BadgeStatus = PaymentStatus | typeof REQUEST_VERIFIED

const KIND_ICON: Record<Kind, IconName> = { ok: 'check', hold: 'clock', bad: 'cross', neutral: 'dash' }

const STATUS_KIND: Record<BadgeStatus, Kind> = {
  [STATUS.readyToPay]: 'ok',
  [REQUEST_VERIFIED]: 'ok',
  [STATUS.mismatch]: 'bad',
  [STATUS.incomplete]: 'hold',
  [STATUS.needsVerification]: 'hold',
  [STATUS.scheduled]: 'neutral', // neutral dash: a payment without a request never borrows a held or verified look
}

const OUTCOME_KIND: Record<Outcome, Kind> = { verified: 'ok', mismatch: 'bad', couldnt_verify: 'hold' }

function Badge({ kind, words }: { kind: Kind; words: string }) {
  return (
    <span className={`badge badge-${kind}`} data-testid="status">
      <Icon name={KIND_ICON[kind]} />
      {words}
    </span>
  )
}

// "Ready to pay" is left out on purpose: it only ever renders through PaymentStatusLine, which puts the
// simulated-money note beside it, so no screen can show it alone.
type Props = { status: Exclude<BadgeStatus, typeof STATUS.readyToPay> } | { outcome: Outcome }

export function StatusBadge(props: Props) {
  return 'status' in props ? (
    <Badge kind={STATUS_KIND[props.status]} words={props.status} />
  ) : (
    <Badge kind={OUTCOME_KIND[props.outcome]} words={OUTCOME_WORDS[props.outcome]} />
  )
}

// A payment status, with the simulated-money note beside every "Ready to pay".
export function PaymentStatusLine({ status }: { status: PaymentStatus }) {
  return (
    <>
      <Badge kind={STATUS_KIND[status]} words={status} />
      {status === STATUS.readyToPay && <span className="simulated">{SIMULATED}</span>}
    </>
  )
}
