import { useEffect, useMemo, useRef, useState } from 'react'
import { SAVE_FAILED } from '../copy'
import { SAMPLES } from '../data/samples'
import { lockAndCompare, saveAttempt as saveAttemptKernel } from '../kernel/attempts'
import type { AnswerKey, Answers, Ctx, KernelResult, PersistedState } from '../kernel/types'
import { createStore, EMPTY_STATE } from '../storage/store'
import { pushHash, replaceHash, resolveRoute, toHash, type Route } from './routes'

// The one place that enforces "save first, show second": compute with the kernel, write and read back,
// and only then put the new state on screen. Everything here is synchronous, so the next screen is drawn
// before a second click can land.

export type AppError = { message: string; count: number; retry: (() => void) | null }
export type CompareResult = { ok: true } | { ok: false; missing?: AnswerKey[] }

type Refusal = Exclude<Extract<KernelResult, { ok: false }>['reason'], 'missing'>

const OVERVIEW: Route = { name: 'overview' }

// Playwright pins this to America/Toronto; the kernel never reads the zone itself.
function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function useAppState() {
  const [store] = useState(() => createStore())
  const [start] = useState(() => {
    const load = store.load()
    // Empty, unreadable and invalid all start from no attempts; invalid data is never shown.
    const state = load.kind === 'ok' ? load.state : EMPTY_STATE
    return { load, state, route: resolveRoute(window.location.hash, state, SAMPLES).route }
  })
  const [load] = useState(start.load) // Reset demo (slice 4) replaces this with an empty load
  const [state, setState] = useState(start.state)
  const [route, setRoute] = useState(start.route)
  const [error, setError] = useState<AppError | null>(null)
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null)
  const [timeZone] = useState(viewerTimeZone)

  // Actions read these, not render-time values, so a double click sees the state the first click saved.
  const stateRef = useRef(state)
  const routeRef = useRef(route)
  const errorCount = useRef(0)

  const actions = useMemo(() => {
    const showRoute = (next: Route) => {
      if (toHash(next) === toHash(routeRef.current)) return
      routeRef.current = next
      setRoute(next)
      setError(null) // an error belongs to the screen it happened on
      setSavedRecordId((id) => (next.name === 'record' && next.recordId === id ? id : null))
    }

    const redirect = (next: Route) => {
      replaceHash(toHash(next))
      showRoute(next)
    }

    const reresolve = () => redirect(resolveRoute(toHash(routeRef.current), stateRef.current, SAMPLES).route)

    const navigate = (target: Route) => {
      const next = resolveRoute(toHash(target), stateRef.current, SAMPLES).route
      showRoute(next)
      pushHash(toHash(next))
    }

    const syncWithHash = () => redirect(resolveRoute(window.location.hash, stateRef.current, SAMPLES).route)

    // An out-of-date screen (a double click, a second tab): nothing is saved and no error shows.
    const refuse = (reason: Refusal) => {
      if (reason === 'unknown_request' || reason === 'unknown_attempt') redirect(OVERVIEW)
      else reresolve()
    }

    const commit = (next: PersistedState) => {
      stateRef.current = next
      setState(next)
      setError(null)
    }

    // Try again re-runs the kernel action on the current state with a fresh clock reading; it never
    // re-sends a state computed earlier.
    const failed = (retry: () => void) => {
      errorCount.current += 1
      setError({ message: SAVE_FAILED, count: errorCount.current, retry })
    }

    const ctxAt = (now: Date): Ctx => ({ samples: SAMPLES, now, timeZone: viewerTimeZone() })

    const compare = (requestId: string, answers: Answers): CompareResult => {
      const run = (): CompareResult => {
        const result = lockAndCompare(stateRef.current, requestId, answers, ctxAt(new Date()))
        if (!result.ok) {
          if (result.reason === 'missing') return { ok: false, missing: result.missing }
          refuse(result.reason)
          return { ok: false }
        }
        if (!store.save(result.state).ok) {
          failed(() => {
            run()
          })
          return { ok: false }
        }
        commit(result.state)
        navigate({ name: 'compare', requestId })
        return { ok: true }
      }
      return run()
    }

    const saveAttempt = (attemptId: string): void => {
      const run = (): void => {
        const result = saveAttemptKernel(stateRef.current, attemptId, ctxAt(new Date()))
        if (!result.ok) {
          if (result.reason !== 'missing') refuse(result.reason)
          return
        }
        if (!store.save(result.state).ok) {
          failed(run)
          return
        }
        commit(result.state)
        if (result.recordId === null) {
          reresolve()
          return
        }
        setSavedRecordId(result.recordId)
        navigate({ name: 'record', recordId: result.recordId })
      }
      run()
    }

    return { navigate, syncWithHash, compare, saveAttempt }
  }, [store])

  // A redirected or empty starting address is replaced, never pushed.
  useEffect(() => {
    replaceHash(toHash(routeRef.current))
  }, [])

  return { load, state, route, error, timeZone, savedRecordId, ...actions }
}
