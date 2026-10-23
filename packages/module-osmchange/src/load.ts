/**
 * Reading what the server has for the elements of a file, through the editor's fetch (in development and tests the
 * mock API, core rule 1):
 *
 * 1. Refused when the person changed one of the file's elements in the editor and has not saved it (Tobias,
 *    2026-10-23): the file would be merged with a state nobody uploaded.
 * 2. The current state of every element the file modifies or deletes: `node/<id>`, `way/<id>/full`,
 *    `relation/<id>`. 404 and 410 mean deleted. The answers go into the editor's data, as a loaded tile would.
 * 3. Refused when the editor shows an older version than the server: the map was loaded before someone else saved.
 * 4. Every existing node a way of the file refers to, when the editor has not loaded it.
 * 5. The base: the element at the file's version from the history (`<type>/<id>/<version>`), when the server's is
 *    newer. Without an answer the merge has no base, and every difference is a decision.
 * 6. What the server has around the file's new nodes (`map?bbox`, small boxes): to find new elements that are on the
 *    server already (the file read again after its upload) and possible duplicates (match.ts). A box the server
 *    refuses is left out: the matching is a help, not a condition.
 */
import type { OsmJsonElement } from '@osm-editor-kit/maid-model'
import { matchCreates, type Matches, type NearbyElement } from './match.ts'
import {
  type FileChange,
  keyOf,
  type Message,
  type OsmChangeFile,
  type OsmElement,
  type ServerState,
} from './types.ts'

export type LoadDeps = {
  /** The API root, as the shell's config has it (the mock in development) */
  readonly apiUrl: string
  /** The editor's fetch: rejects with an error that has `status` on an HTTP error */
  readonly fetch: (url: string) => Promise<Response>
  /** The version of an element the editor has loaded, or undefined when it has not loaded it */
  readonly loadedVersion: (key: string) => number | undefined | 'missing'
  /** The ids of the elements the person changed in the editor and did not save */
  readonly edited: () => ReadonlySet<string>
  /** Adds the elements to the editor's data, as loading does (not an edit) */
  readonly merge: (elements: OsmJsonElement[]) => void
  /** The ways and relations in the editor's data that use an element, after the merge */
  readonly parents: (key: string) => string[]
  /** The time now, for files without timestamps (match.ts); `Date.now` when absent */
  readonly now?: () => number
}

export type Loaded =
  | {
      readonly ok: true
      readonly states: ReadonlyMap<string, ServerState>
      readonly parents: ReadonlyMap<string, readonly string[]>
      readonly matches: Matches
      /** How many requests were sent, for the summary */
      readonly requests: number
    }
  | { readonly ok: false; readonly error: Message }

/** At most this many requests at once; the editor's fetch gate limits the OSM service further */
const PARALLEL = 6

/** The new nodes are asked for in boxes of at most this many degrees (about 200 m), padded by `PAD` (about 30 m) */
const CELL = 0.002
const PAD = 0.0003

/** Small boxes `w,s,e,n` around the positions, one per cell they fall in */
export function boxesAround(positions: readonly { lat: number; lon: number }[]) {
  const cells = new Map<string, [number, number, number, number]>()
  for (const { lat, lon } of positions) {
    const cell = `${Math.floor(lon / CELL)}/${Math.floor(lat / CELL)}`
    const box = cells.get(cell)
    cells.set(
      cell,
      box
        ? [
            Math.min(box[0], lon),
            Math.min(box[1], lat),
            Math.max(box[2], lon),
            Math.max(box[3], lat),
          ]
        : [lon, lat, lon, lat],
    )
  }
  return [...cells.values()].map(([w, s, e, n]) =>
    [w - PAD, s - PAD, e + PAD, n + PAD].map((value) => value.toFixed(6)).join(','),
  )
}

type Answer = { elements: OsmJsonElement[] } | 'gone'

function statusOf(error: unknown) {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : undefined
}

async function inParallel<T>(items: readonly T[], run: (item: T) => Promise<void>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await run(items[next++]!)
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker))
}

function nearbyOf(json: OsmJsonElement): NearbyElement {
  return {
    ...fromJson(json),
    ...(json.timestamp ? { timestamp: json.timestamp } : {}),
    ...(json.user ? { user: json.user } : {}),
  }
}

function fromJson(json: OsmJsonElement): OsmElement {
  return {
    type: json.type,
    id: json.id,
    ...(json.version !== undefined ? { version: json.version } : {}),
    tags: json.tags ?? {},
    ...(json.type === 'node' ? { lat: json.lat, lon: json.lon } : {}),
    ...(json.type === 'way' ? { nodes: json.nodes ?? [] } : {}),
    ...(json.type === 'relation' ? { members: json.members ?? [] } : {}),
  }
}

function list(keys: Iterable<string>) {
  const all = [...keys]
  return all.length > 5 ? `${all.slice(0, 5).join(', ')} …` : all.join(', ')
}

/** The existing elements a change refers to: a way's nodes (a relation's members need not be loaded) */
function referencedNodes(change: FileChange) {
  return (change.element.nodes ?? []).filter((ref) => ref > 0).map((ref) => keyOf('node', ref))
}

export async function loadServerState(file: OsmChangeFile, deps: LoadDeps): Promise<Loaded> {
  const root = deps.apiUrl.replace(/\/+$/, '')
  let requests = 0
  const get = async (path: string): Promise<Answer> => {
    requests++
    try {
      const response = await deps.fetch(`${root}/api/0.6/${path}`)
      if (response.status === 404 || response.status === 410) return 'gone'
      if (!response.ok)
        throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
      return (await response.json()) as { elements: OsmJsonElement[] }
    } catch (error) {
      const status = statusOf(error)
      if (status === 404 || status === 410) return 'gone'
      throw error
    }
  }

  const existing = file.changes.filter((change) => change.action !== 'create')
  const keys = new Set(existing.map((change) => keyOf(change.element.type, change.element.id)))
  const referenced = new Set(file.changes.flatMap(referencedNodes))

  const edited = deps.edited()
  const touched = [...keys, ...referenced].filter((key) => edited.has(key))
  if (touched.length > 0)
    return {
      ok: false,
      error: { id: 'osmchange_error_local_edits', values: { ids: list(new Set(touched)) } },
    }

  const states = new Map<string, ServerState>()
  const fetched: OsmJsonElement[] = []
  const nearby: OsmJsonElement[] = []
  const current = new Map<string, OsmElement>()
  try {
    // 2. the current state
    await inParallel(existing, async ({ element }) => {
      const key = keyOf(element.type, element.id)
      const path =
        element.type === 'node'
          ? `node/${element.id}.json`
          : element.type === 'way'
            ? `way/${element.id}/full.json`
            : `relation/${element.id}.json`
      const answer = await get(path)
      if (answer === 'gone') {
        states.set(key, { current: 'deleted' })
        return
      }
      fetched.push(...answer.elements)
      const own = answer.elements.find(
        (json) => json.type === element.type && json.id === element.id,
      )
      if (!own) throw Object.assign(new Error(`no ${key} in the answer`), { key })
      current.set(key, fromJson(own))
    })

    // 3. the map must not show an older state than the server
    const stale = [...keys].filter((key) => {
      const loaded = deps.loadedVersion(key)
      if (loaded === 'missing') return false
      const server = current.get(key)
      return server === undefined ? true : loaded !== server.version
    })
    if (stale.length > 0)
      return { ok: false, error: { id: 'osmchange_error_stale', values: { ids: list(stale) } } }
    deps.merge(fetched)

    // 4. the existing nodes the file's ways use
    const missingNodes = [...referenced].filter(
      (key) => !current.has(key) && !keys.has(key) && deps.loadedVersion(key) === 'missing',
    )
    const gone: string[] = []
    const nodes: OsmJsonElement[] = []
    await inParallel(missingNodes, async (key) => {
      const answer = await get(`node/${key.slice(1)}.json`)
      if (answer === 'gone') gone.push(key)
      else nodes.push(...answer.elements)
    })
    const deletedRefs = [...referenced].filter((key) => states.get(key)?.current === 'deleted')
    if (gone.length > 0 || deletedRefs.length > 0)
      return {
        ok: false,
        error: { id: 'osmchange_error_missing', values: { ids: list([...gone, ...deletedRefs]) } },
      }
    deps.merge(nodes)

    // 5. the base, when the server changed the element since the file's version
    await inParallel(existing, async ({ element }) => {
      const key = keyOf(element.type, element.id)
      const now = current.get(key)
      if (!now) return
      if (
        element.version === undefined ||
        now.version === undefined ||
        element.version >= now.version
      ) {
        states.set(key, { current: now })
        return
      }
      const answer = await get(`${element.type}/${element.id}/${element.version}.json`)
      const base =
        answer === 'gone'
          ? undefined
          : answer.elements.find((json) => json.type === element.type && json.id === element.id)
      states.set(key, { current: now, ...(base ? { base: fromJson(base) } : {}) })
    })

    // 6. around the new nodes
    const positions = file.changes.flatMap(({ action, element }) =>
      action === 'create' && element.lat !== undefined && element.lon !== undefined
        ? [{ lat: element.lat, lon: element.lon }]
        : [],
    )
    await inParallel(boxesAround(positions), async (box) => {
      try {
        const answer = await get(`map.json?bbox=${box}`)
        if (answer === 'gone') return
        nearby.push(...answer.elements)
      } catch {
        // a box the server refuses (too much data) is not matched
      }
    })
    deps.merge(nearby)
  } catch (error) {
    const status = statusOf(error)
    return {
      ok: false,
      error: {
        id: 'osmchange_error_fetch',
        values: {
          reason:
            status !== undefined
              ? `HTTP ${status}`
              : error instanceof Error
                ? error.message
                : String(error),
        },
      },
    }
  }

  const parents = new Map<string, readonly string[]>()
  for (const change of existing) {
    if (change.action !== 'delete') continue
    const key = keyOf(change.element.type, change.element.id)
    parents.set(key, deps.parents(key))
  }
  const timestamps = new Map(
    file.changes.flatMap((change) =>
      change.action === 'create' && change.timestamp
        ? [[keyOf(change.element.type, change.element.id), change.timestamp] as const]
        : [],
    ),
  )
  const unique = new Map(nearby.map((json) => [`${json.type}/${json.id}`, json]))
  const matches = matchCreates(
    file,
    [...unique.values()].map(nearbyOf),
    (deps.now ?? Date.now)(),
    timestamps,
  )
  return { ok: true, states, parents, matches, requests }
}
