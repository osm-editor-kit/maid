/**
 * The file's new elements against what the server has around them (Tobias, 2026-10-23):
 *
 * - **Already on the server**: a new node with the same tags at the same place (`SAME_METRES`), or a new way with the same tags over
 *   the same nodes, is the file's element uploaded before (the file read again after its upload). It is not created
 *   again, and every reference of the file to it goes to the existing one, so that the changes around it compare equal.
 * - **Possible duplicate**: a new tagged node on its own (a point of interest, not a node or member of the file's ways and
 *   relations)
 *   near an existing node with the same main tag (`amenity=bicycle_parking`) that was added after the file's element
 *   was made (its `timestamp`; without one, the last 24 hours): someone else mapped it meanwhile. That is a decision:
 *   create it anyway, or use the existing one.
 *
 * Pure: the nearby elements come from the server (load.ts asks `map?bbox` around the new elements).
 */
import { metresBetween } from './merge.ts'
import { keyOf, type OsmChangeFile, type OsmElement } from './types.ts'

/**
 * Closer than this, with the same tags, a new node is the same as an existing one. An upload keeps a position to 1e-7°
 * (1 cm), so the file read again finds its nodes at the same place; a larger distance would join a new way to an
 * unrelated existing vertex that happens to be close.
 */
export const SAME_METRES = 0.05
/** Closer than this, with the same main tag, an existing node added since is a possible duplicate */
export const DUPLICATE_METRES = 15
/** Without a timestamp in the file: an existing node added in this time before loading counts as added since */
export const RECENT_MS = 24 * 60 * 60 * 1000

/** The keys whose value says what a feature is, in this order, as the review's labels read them */
export const MAIN_KEYS = [
  'amenity',
  'shop',
  'highway',
  'building',
  'leisure',
  'tourism',
  'railway',
  'natural',
  'landuse',
  'historic',
  'barrier',
  'emergency',
  'man_made',
  'office',
  'craft',
  'traffic_calming',
]

export type Duplicate = {
  readonly key: string
  readonly metres: number
  readonly timestamp?: string
  readonly user?: string
}

export type Matches = {
  /** The file's new element (`n-1`) to the existing one it is (`n123`) */
  readonly same: ReadonlyMap<string, string>
  /** The file's new element to the existing ones it may duplicate, nearest first */
  readonly duplicates: ReadonlyMap<string, readonly Duplicate[]>
}

/** An element of the server, as the map call answers it: with when and by whom it was last changed */
export type NearbyElement = OsmElement & { readonly timestamp?: string; readonly user?: string }

function mainTag(tags: OsmElement['tags']) {
  const key = MAIN_KEYS.find((k) => tags[k] !== undefined)
  return key === undefined ? undefined : `${key}=${tags[key]}`
}

function sameTags(a: OsmElement['tags'], b: OsmElement['tags']) {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

/**
 * Matches the file's new elements against the nearby server elements. `touched` are the elements the file changes
 * or deletes itself: they are never taken as a match. `now` is the time of loading (for files without timestamps).
 */
export function matchCreates(
  file: OsmChangeFile,
  nearby: readonly NearbyElement[],
  now: number,
  fileTimestamps: ReadonlyMap<string, string> = new Map(),
): Matches {
  const touched = new Set(
    file.changes
      .filter((change) => change.action !== 'create')
      .map((change) => keyOf(change.element.type, change.element.id)),
  )
  const candidates = nearby.filter((element) => !touched.has(keyOf(element.type, element.id)))
  const nodes = candidates.filter((element) => element.type === 'node')
  const ways = candidates.filter((element) => element.type === 'way')
  const same = new Map<string, string>()
  const duplicates = new Map<string, Duplicate[]>()
  const taken = new Set<string>()

  const creates = file.changes
    .filter((change) => change.action === 'create')
    .map((change) => change.element)
  // a node of one of the file's ways or relations is part of them: never left out for a duplicate
  const inWays = new Set(
    file.changes.flatMap((change) => [
      ...(change.element.nodes ?? []),
      ...(change.element.members ?? [])
        .filter((member) => member.type === 'node')
        .map((member) => member.ref),
    ]),
  )
  for (const element of creates) {
    if (element.type !== 'node') continue
    const key = keyOf('node', element.id)
    const match = nodes.find(
      (node) =>
        !taken.has(keyOf('node', node.id)) &&
        sameTags(node.tags, element.tags) &&
        metresBetween(node, element) < SAME_METRES,
    )
    if (match) {
      same.set(key, keyOf('node', match.id))
      taken.add(keyOf('node', match.id))
      continue
    }
    const main = mainTag(element.tags)
    if (!main || inWays.has(element.id)) continue
    const since = fileTimestamps.get(key)
    const after = since !== undefined ? Date.parse(since) : now - RECENT_MS
    const near = nodes
      .filter((node) => mainTag(node.tags) === main)
      .map((node) => ({ node, metres: metresBetween(node, element) }))
      .filter(({ node, metres }) => {
        if (metres >= DUPLICATE_METRES) return false
        const changed = node.timestamp !== undefined ? Date.parse(node.timestamp) : Number.NaN
        return Number.isFinite(changed) && changed > after
      })
      .sort((a, b) => a.metres - b.metres)
      .map(({ node, metres }) => ({
        key: keyOf('node', node.id),
        metres: Math.round(metres * 10) / 10,
        ...(node.timestamp ? { timestamp: node.timestamp } : {}),
        ...(node.user ? { user: node.user } : {}),
      }))
    if (near.length > 0) duplicates.set(key, near)
  }

  // a new way is the same as an existing one with the same tags over the same nodes (new ones through `same`)
  const refOf = (ref: number) => (ref < 0 ? same.get(keyOf('node', ref)) : keyOf('node', ref))
  for (const element of creates) {
    if (element.type !== 'way') continue
    const refs = (element.nodes ?? []).map(refOf)
    if (refs.some((ref) => ref === undefined)) continue
    const match = ways.find(
      (way) =>
        !taken.has(keyOf('way', way.id)) &&
        sameTags(way.tags, element.tags) &&
        (way.nodes ?? []).length === refs.length &&
        (way.nodes ?? []).every((ref, index) => keyOf('node', ref) === refs[index]),
    )
    if (match) {
      same.set(keyOf('way', element.id), keyOf('way', match.id))
      taken.add(keyOf('way', match.id))
    }
  }
  return { same, duplicates }
}

/**
 * The file with the matched new elements resolved: references to a new element that is already on the server (or that
 * the person chose to replace by an existing one, `use`) go to the existing element. The matched creates stay in the
 * file; the plan skips them.
 */
export function resolveFile(file: OsmChangeFile, use: ReadonlyMap<string, string>): OsmChangeFile {
  if (use.size === 0) return file
  const id = (type: OsmElement['type'], ref: number) => {
    const existing = ref < 0 ? use.get(keyOf(type, ref)) : undefined
    return existing ? Number(existing.slice(1)) : ref
  }
  return {
    ...file,
    changes: file.changes.map((change) => {
      const { element } = change
      if (!element.nodes && !element.members) return change
      return {
        ...change,
        element: {
          ...element,
          ...(element.nodes ? { nodes: element.nodes.map((ref) => id('node', ref)) } : {}),
          ...(element.members
            ? {
                members: element.members.map((member) => ({
                  ...member,
                  ref: id(member.type, member.ref),
                })),
              }
            : {}),
        },
      }
    }),
  }
}
