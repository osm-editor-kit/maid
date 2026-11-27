/**
 * taginfo's answers kept in the browser for a week (Tobias, 2026-11-27: the values of a key barely change, and the
 * same question should not go out again on every visit). One entry per request URL under `maid:taginfo:<url>`, and
 * an index of when each was stored; past `maxEntries` the oldest go. Under automation `moduleStorage` keeps nothing,
 * so a check never reads an answer from an earlier visit.
 */
import type { ModuleStorage } from '../storage.ts'

const PREFIX = 'maid:taginfo:'
const INDEX = 'maid:taginfo-index'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type TaginfoStore = {
  /** The answer stored for this URL, or undefined when there is none or it is older than the limit */
  get(url: string): unknown
  set(url: string, body: unknown): void
}

export type TaginfoStoreOptions = {
  /** Milliseconds an answer is used. Default a week. */
  maxAge?: number
  /** Answers kept at most; the oldest go first. Default 400 (a few hundred kilobytes). */
  maxEntries?: number
  now?: () => number
}

export function createTaginfoStore(
  storage: ModuleStorage,
  options: TaginfoStoreOptions = {},
): TaginfoStore {
  const maxAge = options.maxAge ?? WEEK_MS
  const maxEntries = options.maxEntries ?? 400
  const now = options.now ?? Date.now

  function readIndex(): Record<string, number> {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(INDEX) ?? '{}')
      if (parsed === null || typeof parsed !== 'object') return {}
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number',
        ),
      )
    } catch {
      return {}
    }
  }

  function writeIndex(index: Record<string, number>): void {
    storage.setItem(INDEX, JSON.stringify(index))
  }

  return {
    get(url) {
      const index = readIndex()
      const stored = index[url]
      if (stored === undefined) return undefined
      if (now() - stored > maxAge) {
        storage.removeItem(PREFIX + url)
        delete index[url]
        writeIndex(index)
        return undefined
      }
      try {
        const text = storage.getItem(PREFIX + url)
        return text === null ? undefined : (JSON.parse(text) as unknown)
      } catch {
        return undefined
      }
    },
    set(url, body) {
      const index = readIndex()
      index[url] = now()
      const urls = Object.keys(index).sort((a, b) => (index[a] ?? 0) - (index[b] ?? 0))
      for (const old of urls.slice(0, Math.max(0, urls.length - maxEntries))) {
        storage.removeItem(PREFIX + old)
        delete index[old]
      }
      storage.setItem(PREFIX + url, JSON.stringify(body))
      writeIndex(index)
    },
  }
}
