import { useEffect, useRef, type ReactNode } from 'react'
import { toHash } from './app/routes'
import { useAppState } from './app/useAppState'
import { ErrorBanner } from './components/ErrorBanner'
import { RecoveryNotice } from './components/RecoveryNotice'
import { StorageNotice } from './components/StorageNotice'
import { APP_NAME, HEADINGS, OVERVIEW_TITLE, pageTitle } from './copy'
import { SAMPLES } from './data/samples'
import { callbackView, canStartAttempt, deriveRequestView } from './kernel/attempts'
import { CallbackStep } from './screens/CallbackStep'
import { Comparison } from './screens/Comparison'
import { Overview } from './screens/Overview'
import { RecordView } from './screens/RecordView'
import { RequestDetail } from './screens/RequestDetail'

type AppState = ReturnType<typeof useAppState>
type Screen = { title: string; element: ReactNode }

function overviewScreen(app: AppState): Screen {
  return {
    title: pageTitle(OVERVIEW_TITLE),
    element: <Overview state={app.state} samples={SAMPLES} onReset={app.resetDemo} />,
  }
}

// The router has already applied every guard, so a missing request or record here means the state moved
// under the route; the Overview is the safe screen to show.
function screenFor(app: AppState): Screen {
  const { route, state } = app
  switch (route.name) {
    case 'overview':
      return overviewScreen(app)
    case 'request': {
      const view = deriveRequestView(state, route.requestId, SAMPLES)
      if (view === null) return overviewScreen(app)
      const requestId = view.request.id
      return {
        title: pageTitle(HEADINGS.request(view.supplier.name)),
        element: (
          <RequestDetail
            view={view}
            records={state.records}
            timeZone={app.timeZone}
            onStart={() => app.navigate({ name: 'call', requestId })}
          />
        ),
      }
    }
    case 'call': {
      const view = callbackView(route.requestId, SAMPLES)
      if (view === null) return overviewScreen(app)
      // Keyed by request and its attempt count, so every new attempt starts blank: typing never carries over
      // from one request's call-back to another's, or from an earlier attempt to a retry. A failed save adds
      // no attempt, so it keeps the typing. Any edit clears a failed save's Try again, which would otherwise
      // save what was typed when it failed instead of what is on screen.
      const attemptCount = state.attempts.filter((a) => a.requestId === view.requestId).length
      return {
        title: pageTitle(HEADINGS.callback(view.supplierName)),
        element: (
          <CallbackStep
            key={`${view.requestId}:${attemptCount}`}
            view={view}
            onCompare={(answers) => app.compare(view.requestId, answers)}
            onCouldntVerify={(input) => app.couldntVerify(view.requestId, input)}
            onEdit={app.clearError}
          />
        ),
      }
    }
    case 'compare': {
      const view = deriveRequestView(state, route.requestId, SAMPLES)
      const pending = view?.pending ?? null
      if (view === null || pending === null) return overviewScreen(app)
      return {
        title: pageTitle(HEADINGS.comparison(view.supplier.name)),
        element: (
          <Comparison
            supplierName={view.supplier.name}
            requested={view.request.requested}
            attempt={pending}
            onSave={() => app.saveAttempt(pending.id)}
          />
        ),
      }
    }
    case 'record': {
      const record = state.records.find((r) => r.id === route.recordId)
      if (record === undefined) return overviewScreen(app)
      return {
        title: pageTitle(HEADINGS.record(record.id)),
        element: (
          <RecordView
            record={record}
            canStart={canStartAttempt(state, record.requestId)}
            justSaved={app.savedRecordId === record.id}
            onStartNew={() => app.navigate({ name: 'call', requestId: record.requestId })}
          />
        ),
      }
    }
  }
}

// Invalid saved data: the notice replaces every screen and is given nothing from that data, which stays
// untouched until Reset demo is confirmed.
function recoveryScreen(app: AppState): Screen {
  return { title: APP_NAME, element: <RecoveryNotice onReset={app.resetDemo} /> }
}

export function App() {
  const app = useAppState()
  const { syncWithHash } = app

  // Links and the browser's Back/Forward change the hash; the hook resolves it through the guards and
  // replaces the entry when a guard redirects. popstate also covers a Back between two entries with the same
  // hash, which fires no hashchange. Both are idempotent, so a step that fires both is harmless.
  useEffect(() => {
    window.addEventListener('hashchange', syncWithHash)
    window.addEventListener('popstate', syncWithHash)
    return () => {
      window.removeEventListener('hashchange', syncWithHash)
      window.removeEventListener('popstate', syncWithHash)
    }
  }, [syncWithHash])

  const recovering = app.load.kind === 'invalid'
  const screen = recovering ? recoveryScreen(app) : screenFor(app)
  // The Recovery notice is one screen whatever the address says. A successful Reset is a screen change even
  // when the route was already the Overview, so the reset count is part of the key.
  const screenKey = recovering ? 'recovery' : `${toHash(app.route)} ${app.resetCount}`
  const shownScreen = useRef(screenKey)

  // On every screen change: title, top of the page, focus on the new heading. The button just pressed has
  // gone (or, after a Reset, the dialog has), so without this focus would fall to <body> and a screen reader
  // would hear nothing. On first load (and React's StrictMode re-run of it) the screen hasn't changed, so only
  // the title is set. A failed save or reset changes no screen, so focus stays on the button that was pressed.
  useEffect(() => {
    document.title = screen.title
    if (shownScreen.current === screenKey) return
    shownScreen.current = screenKey
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [screenKey, screen.title])

  return (
    <>
      <header className="app-header">
        <p className="app-name">{APP_NAME}</p>
      </header>
      <main>
        <ErrorBanner error={app.error} onRetry={app.error?.retry ?? null} />
        {app.load.kind === 'unavailable' && <StorageNotice />}
        {screen.element}
      </main>
    </>
  )
}
