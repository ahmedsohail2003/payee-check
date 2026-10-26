import { TRY_AGAIN } from '../copy'

type Props = {
  error: { message: string; count: number } | null
  onRetry: (() => void) | null
}

// Always mounted and empty when there's no error: a live region added together with its message isn't
// announced. The message is keyed by count, so the same failure twice is announced twice. It never moves
// focus: after a failed save, focus stays on the button that was pressed. Try again isn't keyed, so a
// retry that fails again keeps focus on it.
export function ErrorBanner({ error, onRetry }: Props) {
  return (
    <div role="alert" className="error-banner">
      {error && <p key={error.count}>{error.message}</p>}
      {error && onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          {TRY_AGAIN}
        </button>
      )}
    </div>
  )
}
