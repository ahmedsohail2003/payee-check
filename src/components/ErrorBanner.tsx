import type { AppError } from '../app/useAppState'
import { TRY_AGAIN } from '../copy'

// Always mounted and empty when there's no error: a live region added together with its message isn't
// announced. The message is keyed by count, so the same failure twice is announced twice.
export function ErrorBanner({ error }: { error: AppError | null }) {
  return (
    <div role="alert" className="error-banner">
      {error && <p key={error.count}>{error.message}</p>}
      {error?.retry && (
        <button type="button" className="btn btn-secondary" onClick={error.retry}>
          {TRY_AGAIN}
        </button>
      )}
    </div>
  )
}
