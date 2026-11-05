/**
 * The route previews of this page: what Postpass answered for a relation (route-analysis `routePreviewSql`), kept in
 * memory and for 24 hours in the browser's IndexedDB, so that a long route shows its whole line again without a
 * request. A preview is asked for only when the person presses "Load preview" or "Reload", one at a time (the
 * `postpass` service's gate), and only where the config has a preview URL: OpenStreetMap's data, or the mock, which
 * answers from its fixtures (AGENTS.md, core rule 1).
 */
import type { RemoteFetch } from '@osm-editor-kit/maid-core'
import {
  parseRoutePreview,
  PreviewFormatError,
  routePreviewSql,
  type RoutePreview,
} from '@osm-editor-kit/maid-route-analysis'
import Dexie, { type Table } from 'dexie'

/** A stored preview is shown for a day, then asked for again on the next press */
export const PREVIEW_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Postpass sends no size: reading stops here (EuroVelo-sized superroutes are a few MB) */
export const PREVIEW_MAX_BYTES = 24 * 1024 * 1024
const PREVIEW_TIMEOUT_MS = 60_000

export type PreviewEntry = { preview: RoutePreview; loadedAt: number }

export type PreviewFailure = 'failed' | 'format' | 'missing' | 'too-big'

export type PreviewState =
  | { status: 'none' }
  | { status: 'loading'; entry?: PreviewEntry }
  | { status: 'ready'; entry: PreviewEntry }
  | { status: 'error'; reason: PreviewFailure; entry?: PreviewEntry }

const NONE: PreviewState = { status: 'none' }

/** Where previews are kept between visits. A failure is a miss, never an error. */
export type PreviewCache = {
  read(id: string): Promise<PreviewEntry | undefined>
  write(id: string, entry: PreviewEntry): Promise<void>
}

type Row = PreviewEntry & { id: string }

class PreviewDB extends Dexie {
  // `declare`: Dexie creates the table property itself
  declare previews: Table<Row, string>

  constructor(name: string) {
    // the factory is read when the database is made, not when Dexie loads (tests set it up first)
    super(name, { indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange })
    this.version(1).stores({ previews: 'id, loadedAt' })
  }
}

/** The IndexedDB cache. Rows older than a day are dropped when they are read, and once when it opens. */
export function createPreviewCache(name = 'maid-route-previews', now = Date.now): PreviewCache {
  let db: PreviewDB | undefined
  const open = () => {
    if (db) return db
    db = new PreviewDB(name)
    void db.previews
      .where('loadedAt')
      .below(now() - PREVIEW_MAX_AGE_MS)
      .delete()
      .catch(() => undefined)
    return db
  }
  return {
    async read(id) {
      try {
        const row = await open().previews.get(id)
        if (!row || now() - row.loadedAt >= PREVIEW_MAX_AGE_MS) return undefined
        return { preview: row.preview, loadedAt: row.loadedAt }
      } catch {
        return undefined
      }
    },
    async write(id, entry) {
      try {
        await open().previews.put({ id, ...entry })
      } catch {
        // blocked storage, as in a private window: the preview lives for this visit only
      }
    },
  }
}

export type PreviewStore = {
  /** Whether this page can ask for previews at all (a preview URL in the config) */
  readonly enabled: boolean
  state: (id: string) => PreviewState
  subscribe: (listener: () => void) => () => void
  /** Shows a stored preview of the last 24 hours, if there is one. Sends nothing; once per relation. */
  restore: (id: string) => void
  /** Asks Postpass (or the mock) and stores the answer. `refresh` skips the stored one. */
  load: (id: string, options?: { refresh?: boolean }) => Promise<void>
  /** The relation whose overview is on screen, so the map draws its preview (preview-map.tsx) */
  shown: () => string | null
  setShown: (id: string | null) => void
}

async function readLimited(response: Response, limit: number) {
  if (!response.body) return response.text()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > limit) {
      await reader.cancel()
      throw new PreviewTooBigError()
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(await new Blob(chunks as BlobPart[]).arrayBuffer())
}

class PreviewTooBigError extends Error {}

export function createPreviewStore(deps: {
  fetch: RemoteFetch
  url: string | undefined
  cache?: PreviewCache
  now?: () => number
}): PreviewStore {
  const { fetch: remoteFetch, url } = deps
  const cache = deps.cache ?? createPreviewCache()
  const now = deps.now ?? Date.now
  const states = new Map<string, PreviewState>()
  const restored = new Set<string>()
  let shownId: string | null = null
  const listeners = new Set<() => void>()
  const set = (id: string, state: PreviewState) => {
    states.set(id, state)
    for (const listener of listeners) listener()
  }
  const entryOf = (id: string) => {
    const state = states.get(id)
    return state && 'entry' in state ? state.entry : undefined
  }
  return {
    enabled: url !== undefined,
    state: (id) => states.get(id) ?? NONE,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    shown: () => shownId,
    setShown(id) {
      if (id === shownId) return
      shownId = id
      for (const listener of listeners) listener()
    },
    restore(id) {
      if (!url || restored.has(id)) return
      restored.add(id)
      void cache.read(id).then((entry) => {
        if (entry && (states.get(id) ?? NONE).status === 'none') set(id, { status: 'ready', entry })
      })
    },
    async load(id, options = {}) {
      if (!url || states.get(id)?.status === 'loading') return
      const previous = entryOf(id)
      if (!options.refresh) {
        const stored = previous ?? (await cache.read(id))
        if (stored && now() - stored.loadedAt < PREVIEW_MAX_AGE_MS) {
          set(id, { status: 'ready', entry: stored })
          return
        }
      }
      set(id, { status: 'loading', ...(previous ? { entry: previous } : {}) })
      try {
        const target = new URL(url)
        target.searchParams.set('data', routePreviewSql(id))
        target.searchParams.set('options[geojson]', 'false')
        const response = await remoteFetch(target, {
          credentials: 'omit',
          service: 'postpass',
          timeoutMs: PREVIEW_TIMEOUT_MS,
        })
        const entry = {
          preview: parseRoutePreview(id, await readLimited(response, PREVIEW_MAX_BYTES)),
          loadedAt: now(),
        }
        await cache.write(id, entry)
        set(id, { status: 'ready', entry })
      } catch (error) {
        const reason: PreviewFailure =
          error instanceof PreviewFormatError
            ? error.missing
              ? 'missing'
              : 'format'
            : error instanceof PreviewTooBigError
              ? 'too-big'
              : 'failed'
        set(id, { status: 'error', reason, ...(previous ? { entry: previous } : {}) })
      }
    },
  }
}

const stores = new WeakMap<object, PreviewStore>()

/** The preview store of a page (one per editor) */
export function previewStoreOf(shell: {
  editor: { fetch: RemoteFetch }
  config: { previewUrl: string | undefined }
}): PreviewStore {
  let store = stores.get(shell.editor)
  if (!store) {
    store = createPreviewStore({ fetch: shell.editor.fetch, url: shell.config.previewUrl })
    stores.set(shell.editor, store)
  }
  return store
}
