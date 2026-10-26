import { Fragment } from 'react'
import { EMAIL, UNTRUSTED_TAG } from '../copy'
import { formatReceived } from '../kernel/format'
import type { ChangeRequest, Contact } from '../kernel/types'
import { segmentEmailText } from '../kernel/untrusted'
import { Icon } from './Icon'

// Email content is text, never HTML: React escapes every child, and line breaks come from pre-wrap.
// Contacts stay visible so you can see what was claimed, but they are inert labelled spans, never links.

type Props = { email: ChangeRequest['email']; timeZone: string }

function Untrusted({ text }: { text: string }) {
  return (
    <span className="untrusted" data-testid="untrusted">
      <Icon name="shield-slash" />
      {text}{' '}
      <span className="untrusted-tag">{UNTRUSTED_TAG}</span>
    </span>
  )
}

function MarkedText({ text, contacts }: { text: string; contacts: Contact[] }) {
  return (
    <>
      {segmentEmailText(text, contacts).map((segment, i) =>
        segment.kind === 'untrusted' ? (
          <Untrusted key={i} text={segment.text} />
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        ),
      )}
    </>
  )
}

export function EmailView({ email, timeZone }: Props) {
  return (
    <section className="email-panel" data-testid="email-panel" aria-labelledby="email-heading">
      <h2 id="email-heading">{EMAIL.heading}</h2>
      <dl className="email-meta">
        <dt>{EMAIL.from}</dt>
        <dd>
          {/* The sender address is always one untrusted segment: it arrived with the claim, so it can't confirm it. */}
          <Untrusted text={email.from} />
        </dd>
        <dt>{EMAIL.subject}</dt>
        <dd>
          <MarkedText text={email.subject} contacts={email.contacts} />
        </dd>
        <dt>{EMAIL.received}</dt>
        <dd>{formatReceived(email.receivedAt, timeZone)}</dd>
      </dl>
      <div className="email-body">
        <MarkedText text={email.body} contacts={email.contacts} />
      </div>
    </section>
  )
}
