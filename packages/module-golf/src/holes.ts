/**
 * The scorecard of the loaded data: every golf=hole way with its number, par, handicap and length, sorted by number,
 * and what each one lacks. Pure: it reads a graph-like object, so the tests build one by hand.
 */

type Tags = Readonly<Record<string, string | undefined>>

/** What the scorecard reads of an entity: the model's entities have this shape */
export type GraphEntity = {
  readonly id: string
  readonly tags: Tags
  readonly nodes?: readonly string[]
  readonly loc?: readonly number[]
}

type Entities = ReadonlyMap<string, GraphEntity | undefined>

/** The part of the model's Graph the scorecard reads (`editor.history.staging.graph`) */
export type GraphLike = {
  readonly base: { readonly entities: Entities }
  readonly local: { readonly entities: Entities }
  hasEntity(id: string): GraphEntity | undefined
}

export type Missing = 'ref' | 'par' | 'handicap' | 'duplicate'

export type HoleRow = {
  id: string
  ref?: string
  par?: number
  handicap?: number
  /** Metres along the line, rounded */
  length: number
  /** The course name if the hole says so (`golf:course:name`), else undefined */
  course?: string
  missing: Missing[]
}

export type Scorecard = {
  rows: HoleRow[]
  /** Sum of the pars that are there */
  par: number
  /** Sum of the lengths */
  length: number
}

const EARTH_RADIUS = 6_371_008.8

/** Metres between two [lon, lat] points on a sphere */
export function distance(a: readonly number[], b: readonly number[]): number {
  const [lon1 = 0, lat1 = 0] = a
  const [lon2 = 0, lat2 = 0] = b
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)))
}

function wholeNumber(value: string | undefined): number | undefined {
  return value !== undefined && /^\d+$/.test(value.trim()) ? Number(value) : undefined
}

/** Every way of the graph tagged golf=hole: the loaded ones as the edits left them, and the new ones */
function* holesOf(graph: GraphLike): Generator<GraphEntity> {
  const seen = new Set<string>()
  for (const [id, entity] of graph.local.entities) {
    seen.add(id)
    if (entity?.nodes && entity.tags.golf === 'hole') yield entity
  }
  for (const [id, entity] of graph.base.entities) {
    if (!seen.has(id) && entity?.nodes && entity.tags.golf === 'hole') yield entity
  }
}

function lengthOf(graph: GraphLike, way: GraphEntity): number {
  let total = 0
  let previous: readonly number[] | undefined
  for (const id of way.nodes ?? []) {
    const loc = graph.hasEntity(id)?.loc
    if (!loc) continue
    if (previous) total += distance(previous, loc)
    previous = loc
  }
  return Math.round(total)
}

/** Numbers first in their order ("2" before "10"), then the rest, then the holes without a number */
function compareRefs(a: HoleRow, b: HoleRow) {
  if (a.ref === undefined || b.ref === undefined)
    return a.ref === undefined ? (b.ref === undefined ? 0 : 1) : -1
  const na = Number.parseInt(a.ref, 10)
  const nb = Number.parseInt(b.ref, 10)
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
  return a.ref.localeCompare(b.ref)
}

/** The lines of the holes that have a number, as [lon, lat] pairs, for the labels on the map */
export function holeLines(graph: GraphLike): { ref: string; coordinates: [number, number][] }[] {
  const lines: { ref: string; coordinates: [number, number][] }[] = []
  for (const way of holesOf(graph)) {
    const ref = way.tags.ref?.trim()
    if (!ref) continue
    const coordinates: [number, number][] = []
    for (const id of way.nodes ?? []) {
      const loc = graph.hasEntity(id)?.loc
      if (loc && loc.length >= 2) coordinates.push([loc[0]!, loc[1]!])
    }
    if (coordinates.length >= 2) lines.push({ ref, coordinates })
  }
  return lines
}

export function scorecard(graph: GraphLike): Scorecard {
  const rows: HoleRow[] = []
  for (const way of holesOf(graph)) {
    const ref = way.tags.ref?.trim() || undefined
    const par = wholeNumber(way.tags.par)
    const handicap = wholeNumber(way.tags.handicap)
    const missing: Missing[] = []
    if (!ref) missing.push('ref')
    if (par === undefined) missing.push('par')
    if (handicap === undefined) missing.push('handicap')
    rows.push({
      id: way.id,
      ref,
      par,
      handicap,
      length: lengthOf(graph, way),
      course: way.tags['golf:course:name'] || undefined,
      missing,
    })
  }
  // a number used twice on the same course (a 27-hole club has three courses that each start at 1)
  const byRef = new Map<string, HoleRow[]>()
  for (const row of rows) {
    if (!row.ref) continue
    const key = `${row.course ?? ''}\u0000${row.ref}`
    byRef.set(key, [...(byRef.get(key) ?? []), row])
  }
  for (const same of byRef.values())
    if (same.length > 1) for (const row of same) row.missing.push('duplicate')
  rows.sort((a, b) => (a.course ?? '').localeCompare(b.course ?? '') || compareRefs(a, b))
  return {
    rows,
    par: rows.reduce((sum, row) => sum + (row.par ?? 0), 0),
    length: rows.reduce((sum, row) => sum + row.length, 0),
  }
}
