import { useEffect, useMemo, useRef, useState } from 'react'
import { RESET_FAILED, SAVE_FAILED } from '../copy'
import { SAMPLES } from '../data/samples'
import {
  lockAndCompare,
  saveAttempt as saveAttemptKernel,
  saveCouldntVerify,
  type CouldntVerifyInput,
} from '../kernel/attempts'
import type { AnswerKey, Answers, Ctx, KernelResult, PersistedState } from '../kernel/types'
import { createStore, EMPTY_STATE, type LoadResult } from '../storage/store'
import { pushHash, replaceHash, resolveRoute, toHash, type Route } from './routes'

// The one place that enforces "save first, show second": compute with the kernel, write and read back,
// and only then put the new state on screen. Everything here is synchronous, so the next screen is drawn
// before a second click can land.

export type AppError = { message: string; count: number; retry: (() => void) | null }
export type CompareResult = { ok: true } | { ok: false; missing?: AnswerKey[] }
// The reason and the person spoken to, exactly as typed; the kernel stores a blank person as null.
export type { CouldntVerifyInput }

type Refusal = Exclude<Extract<KernelResult, { ok: false }>['reason'], 'missing'>

const OVERVIEW: Route = { name: 'overview' }
const EMPTY_LOAD: LoadResult = { kind: 'empty' }

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
  const [load, setLoad] = useState<LoadResult>(start.load)
  const [state, setState] = useState(start.state)
  const [route, setRoute] = useState(start.route)
  const [error, setError] = useState<AppError | null>(null)
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null)
  // A successful Reset is a new screen even when the route was already the Overview, so App keys its
  // focus-and-title effect on this as well as on the route.
  const [resetCount, setResetCount] = useState(0)
  const [timeZone] = useState(viewerTimeZone)

  // Actions read these, not render-time values, so a double click sees the state the first click saved.
  const stateRef = useRef(state)
  const routeRef = useRef(route)
  const loadRef = useRef(load)
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

    // Ordinary navigation pushes one entry. A target the guards turn away (an out-of-date screen) is a
    // redirect like any other, so it replaces: Back must never land on an entry that bounces forward again.
    const navigate = (target: Route) => {
      const resolved = resolveRoute(toHash(target), stateRef.current, SAMPLES)
      if (resolved.redirected) {
        redirect(resolved.route)
        return
      }
      showRoute(resolved.route)
      pushHash(resolved.hash)
    }

    const syncWithHash = () => redirect(resolveRoute(window.location.hash, stateRef.current, SAMPLES).route)

    const showError = (message: string, retry: (() => void) | null) => {
      errorCount.current += 1
      setError({ message, count: errorCount.current, retry })
    }

    const clearError = () => setError(null)

    // An out-of-date screen (a double click, a second tab): nothing is saved and no error shows, not even
    // one left from an earlier failed try.
    const refuse = (reason: Refusal) => {
      setError(null)
      if (reason === 'unknown_request' || reason === 'unknown_attempt') redirect(OVERVIEW)
      else reresolve()
    }

    // Invalid saved data stays exactly as it was found until Reset is confirmed, so no action may write
    // over it. App shows only the Recovery notice then, so this is a backstop.
    const writable = () => loadRef.current.kind !== 'invalid'

    const commit = (next: PersistedState) => {
      stateRef.current = next
      setState(next)
      setError(null)
    }

    // Try again re-runs the kernel action on the current state with a fresh clock reading; it never
    // re-sends a state computed earlier, so the saved time is when the save actually succeeded.
    const failed = (retry: () => void) => showError(SAVE_FAILED, retry)

    const ctxAt = (now: Date): Ctx => ({ samples: SAMPLES, now, timeZone: viewerTimeZone() })

    const compare = (requestId: string, answers: Answers): CompareResult => {
      const run = (): CompareResult => {
        if (!writable()) return { ok: false }
        const result = lockAndCompare(stateRef.current, requestId, answers, ctxAt(new Date()))
        if (!result.ok) {
          if (result.reason === 'missing') {
            // A Try again left from an earlier failure would lock answers that are no longer on screen.
            setError(null)
            return { ok: false, missing: result.missing }
          }
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
        if (!writable()) return
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

    const couldntVerify = (requestId: string, input: CouldntVerifyInput): void => {
      const run = (): void => {
        if (!writable()) return
        // The kernel accepts a second couldn't-verify on a held request (it's a new attempt), so a double
        // click is caught here instead: the first click already left this Call-back step.
        const here = routeRef.current
        if (here.name !== 'call' || here.requestId !== requestId) return
        const result = saveCouldntVerify(stateRef.current, requestId, input, ctxAt(new Date()))
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

    // Removes only Payee Check's key (never the whole origin's storage, never a save), so it works on invalid
    // data and leaves other sites' data alone. Nothing changes on screen unless the key is really gone. No Try
    // again on failure: pressing "Reset demo" asks for confirmation again, as a reset always should.
    const resetDemo = (): boolean => {
      if (!store.clear().ok) {
        showError(RESET_FAILED, null)
        return false
      }
      stateRef.current = EMPTY_STATE
      setState(EMPTY_STATE)
      loadRef.current = EMPTY_LOAD // ends the Recovery notice
      setLoad(EMPTY_LOAD)
      setError(null)
      setSavedRecordId(null)
      setResetCount((n) => n + 1)
      redirect(OVERVIEW)
      return true
    }

    return { navigate, syncWithHash, compare, saveAttempt, couldntVerify, resetDemo, clearError }
  }, [store])

  // A redirected or empty starting address is replaced, never pushed.
  useEffect(() => {
    replaceHash(toHash(routeRef.current))
  }, [])

  return { load, state, route, error, timeZone, savedRecordId, resetCount, ...actions }
}
