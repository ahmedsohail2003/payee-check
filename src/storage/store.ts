import { z } from 'zod'
import type { PersistedState } from '../kernel/types'
import { persistedStateSchema } from './schema'

// The only code that touches localStorage: one key, one write of the whole state per action, read back before
// success is claimed. Nothing here throws; every failure comes back as a value.

export const STORAGE_KEY = 'payee-check:v1'
export const EMPTY_STATE: PersistedState = { version: 1, attempts: [], records: [] }

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; state: PersistedState }
  | { kind: 'invalid'; problem: string }
  | { kind: 'unavailable' }
export type SaveResult = { ok: true } | { ok: false; error: 'unavailable' | 'quota' | 'readback' }
export type ClearResult = { ok: true } | { ok: false }
export type Store = { load(): LoadResult; save(state: PersistedState): SaveResult; clear(): ClearResult }

// The getter is called inside each try because in Chrome even reading window.localStorage throws when site
// data is blocked.
export function createStore(getStorage: () => Storage = () => window.localStorage): Store {
  return {
    load() {
      let raw: string | null
      try {
        raw = getStorage().getItem(STORAGE_KEY)
      } catch {
        return { kind: 'unavailable' }
      }
      if (raw === null) return { kind: 'empty' }
      const result = parse(raw)
      // The problem is for developers and tests only; the Recovery notice the user sees never changes.
      if (result.kind === 'invalid') console.warn(`Payee Check: saved data in ${STORAGE_KEY} is invalid.\n${result.problem}`)
      return result
    },

    save(state) {
      try {
        const raw = JSON.stringify(state)
        const storage = getStorage()
        storage.setItem(STORAGE_KEY, raw)
        return storage.getItem(STORAGE_KEY) === raw ? { ok: true } : { ok: false, error: 'readback' }
      } catch (error) {
        return { ok: false, error: isQuotaError(error) ? 'quota' : 'unavailable' }
      }
    },

    // Only this app's key: other data on the same origin is never touched.
    clear() {
      try {
        getStorage().removeItem(STORAGE_KEY)
        return { ok: true }
      } catch {
        return { ok: false }
      }
    },
  }
}

function parse(raw: string): LoadResult {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    return { kind: 'invalid', problem: `not JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
  // There is no migration: a breaking change would use a new key. A value from another version gets one clear
  // problem instead of a list of shape errors.
  if (typeof data === 'object' && data !== null && 'version' in data && data.version !== 1) {
    return { kind: 'invalid', problem: `unsupported version ${JSON.stringify(data.version)}` }
  }
  const parsed = persistedStateSchema.safeParse(data)
  if (!parsed.success) return { kind: 'invalid', problem: z.prettifyError(parsed.error) }

  // ── Slice 3 adds the invariant check here ──
  // const problems = checkInvariants(parsed.data, SAMPLES)
  // if (problems.length > 0) return { kind: 'invalid', problem: problems.join(', ') }

  return { kind: 'ok', state: parsed.data }
}

// Chrome reports a full origin as a QuotaExceededError (legacy DOMException code 22).
function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name, code } = error as { name?: unknown; code?: unknown }
  return name === 'QuotaExceededError' || code === 22
}
