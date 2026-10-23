/**
 * The import on the map, as OSMCha shows a changeset (the osmcha2 sister project): what is new in teal, what changes
 * in yellow, what goes in red, the state before a change dashed below it, and what needs nothing in violet. Colours are
 * OSMCha's (osmcha2 `actionColors.ts`, Tailwind 400).
 */
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { Plan, PlanItem } from './plan.ts'
import { keyOf, type OsmElement } from './types.ts'

export const ACTION_COLOUR = {
  create: '#2dd4bf',
  modify: '#facc15',
  delete: '#f87171',
  skip: '#a78bfa',
} as const

export type Tone = keyof typeof ACTION_COLOUR

export function toneOf(item: PlanItem): Tone {
  return item.status === 'skip' ? 'skip' : item.change.action
}

type Position = [number, number]

/**
 * `before`: the server's state (dashed), `after`: what applying writes. A node's position comes from the plan when
 * the file has the node, else from `loc` (the editor's data).
 */
export function planFeatures(
  plan: Plan,
  loc: (key: string) => Position | undefined,
): FeatureCollection {
  const before = new Map<string, Position>()
  const after = new Map<string, Position>()
  for (const item of plan.items) {
    if (item.change.element.type !== 'node') continue
    const current = item.server?.current
    if (current && current !== 'deleted' && current.lat !== undefined && current.lon !== undefined)
      before.set(item.key, [current.lon, current.lat])
    const written =
      item.result !== undefined && item.result !== 'delete' ? item.result : item.change.element
    if (item.change.action !== 'delete' && written.lat !== undefined && written.lon !== undefined)
      after.set(item.key, [written.lon, written.lat])
  }
  const position = (positions: Map<string, Position>) => (ref: number) =>
    positions.get(keyOf('node', ref)) ?? loc(keyOf('node', ref))

  const features: Feature[] = []
  const add = (
    item: PlanItem,
    element: OsmElement,
    side: 'before' | 'after',
    at: (ref: number) => Position | undefined,
  ) => {
    const geometry = geometryOf(element, at)
    if (!geometry) return
    features.push({
      type: 'Feature',
      geometry,
      properties: { key: item.key, side, tone: toneOf(item), decide: item.status === 'decide' },
    })
  }
  for (const item of plan.items) {
    const current = item.server?.current
    if (current && current !== 'deleted') add(item, current, 'before', position(before))
    if (item.change.action === 'delete') continue
    const written =
      item.result !== undefined && item.result !== 'delete' ? item.result : item.change.element
    add(item, written, 'after', position(after))
  }
  return { type: 'FeatureCollection', features }
}

function geometryOf(
  element: OsmElement,
  at: (ref: number) => Position | undefined,
): Geometry | undefined {
  if (element.type === 'node') {
    if (element.lat === undefined || element.lon === undefined) return undefined
    return { type: 'Point', coordinates: [element.lon, element.lat] }
  }
  if (element.type === 'way') {
    const coordinates = (element.nodes ?? []).map(at).filter((p): p is Position => p !== undefined)
    if (coordinates.length < 2) return undefined
    return { type: 'LineString', coordinates }
  }
  // a relation is shown by its members, which are on the map already
  return undefined
}

/** A box `[west, south, east, north]` in degrees */
export type Bounds = [number, number, number, number]

/** The largest box the map flies to after loading, as its diagonal in metres; a larger one shows its first element */
export const MAX_FOCUS_METRES = 2000

const PRIORITY: PlanItem['status'][] = ['decide', 'auto', 'clean', 'skip']

function boundsOfFeatures(features: readonly Feature[]): Bounds | undefined {
  let bounds: Bounds | undefined
  const add = ([lon, lat]: number[]) => {
    if (lon === undefined || lat === undefined) return
    bounds = bounds
      ? [
          Math.min(bounds[0], lon),
          Math.min(bounds[1], lat),
          Math.max(bounds[2], lon),
          Math.max(bounds[3], lat),
        ]
      : [lon, lat, lon, lat]
  }
  for (const { geometry } of features) {
    if (geometry.type === 'Point') add(geometry.coordinates)
    else if (geometry.type === 'LineString') geometry.coordinates.forEach(add)
  }
  return bounds
}

function diagonalMetres([west, south, east, north]: Bounds) {
  const rad = Math.PI / 180
  const x = (east - west) * Math.cos(((south + north) / 2) * rad)
  return Math.hypot(x, north - south) * rad * 6_371_008.8
}

/**
 * Where the map goes after a file is loaded: the elements that need a decision, else those merged with changes on the
 * server, else the rest, each by what applying writes (a delete by what it removes). When their box is larger than
 * `maxMetres` across, only the first of them, so that a file spread over a town does not show the town from above.
 */
export function focusOf(
  plan: Plan,
  loc: (key: string) => Position | undefined,
  maxMetres = MAX_FOCUS_METRES,
): Bounds | undefined {
  const features = planFeatures(plan, loc).features.filter((feature) => {
    const { side, key } = feature.properties as { side: string; key: string }
    const item = plan.items.find((candidate) => candidate.key === key)
    return item?.change.action === 'delete' ? side === 'before' : side === 'after'
  })
  for (const status of PRIORITY) {
    const keys = plan.items.filter((item) => item.status === status).map((item) => item.key)
    const group = features.filter((feature) =>
      keys.includes((feature.properties as { key: string }).key),
    )
    const bounds = boundsOfFeatures(group)
    if (!bounds) continue
    if (diagonalMetres(bounds) <= maxMetres) return bounds
    const first = keys.find((key) =>
      group.some((feature) => (feature.properties as { key: string }).key === key),
    )
    return boundsOfFeatures(
      group.filter((feature) => (feature.properties as { key: string }).key === first),
    )
  }
  return undefined
}
