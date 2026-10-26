import { canStartAttempt, phaseOf } from '../kernel/attempts'
import { lookupRequest } from '../kernel/record'
import type { PersistedState, Samples } from '../kernel/types'

// A tiny hash router. Every guard lives in resolveRoute and reads phaseOf, so the router can never open a
// screen the kernel would refuse at Compare or Save.

export type Route =
  | { name: 'overview' }
  | { name: 'request'; requestId: string }
  | { name: 'call'; requestId: string }
  | { name: 'compare'; requestId: string }
  | { name: 'record'; recordId: string }

export type ResolvedRoute = { route: Route; hash: string; redirected: boolean }

const OVERVIEW: Route = { name: 'overview' }

function decodeSegment(segment: string): string | null {
  try {
    const value = decodeURIComponent(segment)
    return value === '' ? null : value
  } catch {
    return null // a malformed % escape is an unknown route, not a crash
  }
}

export function parseHash(hash: string): Route | null {
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  if (path === '' || path === '/') return { name: 'overview' }
  if (!path.startsWith('/')) return null
  const segments: string[] = []
  for (const raw of path.slice(1).split('/')) {
    const value = decodeSegment(raw)
    if (value === null) return null
    segments.push(value)
  }
  if (segments.length > 3) return null
  const [kind, id, action] = segments
  if (id === undefined) return null
  if (kind === 'request') {
    if (action === undefined) return { name: 'request', requestId: id }
    if (action === 'call') return { name: 'call', requestId: id }
    if (action === 'compare') return { name: 'compare', requestId: id }
    return null
  }
  if (kind === 'record' && action === undefined) return { name: 'record', recordId: id }
  return null
}

export function toHash(route: Route): string {
  switch (route.name) {
    case 'overview':
      return '#/'
    case 'request':
      return `#/request/${encodeURIComponent(route.requestId)}`
    case 'call':
      return `#/request/${encodeURIComponent(route.requestId)}/call`
    case 'compare':
      return `#/request/${encodeURIComponent(route.requestId)}/compare`
    case 'record':
      return `#/record/${encodeURIComponent(route.recordId)}`
  }
}

function guard(route: Route, state: PersistedState, samples: Samples): Route {
  if (route.name === 'overview') return route
  // A stale record link (after Reset, or from another browser) has nothing to show.
  if (route.name === 'record') return state.records.some((r) => r.id === route.recordId) ? route : OVERVIEW
  const { requestId } = route
  if (!lookupRequest(samples, requestId)) return OVERVIEW
  const phase = phaseOf(state, requestId)
  switch (route.name) {
    case 'request':
      // A revealed comparison is locked: the request reopens on it until it is saved.
      return phase === 'pending' ? { name: 'compare', requestId } : route
    case 'call':
      if (canStartAttempt(state, requestId)) return route
      return phase === 'pending' ? { name: 'compare', requestId } : { name: 'request', requestId }
    case 'compare':
      return phase === 'pending' ? route : { name: 'request', requestId }
  }
}

// `redirected` is true exactly when the address shown must differ from the one asked for (a guard fired,
// the shape is unknown, or the address was empty or not in canonical form), so the caller replaces the
// history entry instead of pushing one.
export function resolveRoute(hash: string, state: PersistedState, samples: Samples): ResolvedRoute {
  const parsed = parseHash(hash)
  const route = parsed === null ? OVERVIEW : guard(parsed, state, samples)
  const target = toHash(route)
  return { route, hash: target, redirected: target !== hash }
}

// Redirects replace the history entry, so browser Back can't bounce between /call and /compare.
// replaceState fires no hashchange, so callers set the route themselves.
export function replaceHash(hash: string): void {
  if (window.location.hash !== hash) window.history.replaceState(window.history.state, '', hash)
}

// Ordinary navigation pushes one entry. The hashchange it fires finds the route already set.
export function pushHash(hash: string): void {
  if (window.location.hash !== hash) window.location.hash = hash
}
