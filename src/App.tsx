import { useEffect, type ReactNode } from 'react'
import { useAppState } from './app/useAppState'
import { ErrorBanner } from './components/ErrorBanner'
import { APP_NAME, HEADINGS, OVERVIEW_TITLE, RECOVERY, STORAGE_UNREADABLE, pageTitle } from './copy'
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
  return { title: pageTitle(OVERVIEW_TITLE), element: <Overview state={app.state} samples={SAMPLES} /> }
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
      return {
        title: pageTitle(HEADINGS.callback(view.supplierName)),
        // Keyed by request, so typing never carries over from one request's call-back to another's.
        element: (
          <CallbackStep
            key={view.requestId}
            view={view}
            onCompare={(answers) => app.compare(view.requestId, answers)}
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

// Slice 4 replaces this with RecoveryNotice (with Reset demo). Nothing from the invalid data is shown.
function recoveryScreen(): Screen {
  return {
    title: APP_NAME,
    element: (
      <>
        <h1 tabIndex={-1} aria-describedby="recovery-message">
          {APP_NAME}
        </h1>
        <p id="recovery-message">{RECOVERY}</p>
      </>
    ),
  }
}

export function App() {
  const app = useAppState()
  const { syncWithHash } = app

  // Links and the browser's Back/Forward change the hash; the hook resolves it through the guards.
  useEffect(() => {
    window.addEventListener('hashchange', syncWithHash)
    return () => window.removeEventListener('hashchange', syncWithHash)
  }, [syncWithHash])

  const screen = app.load.kind === 'invalid' ? recoveryScreen() : screenFor(app)

  // Slice 2 adds scroll-to-top and heading focus to this effect.
  useEffect(() => {
    document.title = screen.title
  }, [screen.title])

  return (
    <>
      <header className="app-header">
        <p className="app-name">{APP_NAME}</p>
      </header>
      <main>
        <ErrorBanner error={app.error} />
        {/* Slice 4 turns this into the full "can't save" notice. */}
        {app.load.kind === 'unavailable' && <p className="notice">{STORAGE_UNREADABLE}</p>}
        {screen.element}
      </main>
    </>
  )
}
