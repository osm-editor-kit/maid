/**
 * The constraints of drawing and dragging (ADR 0011, hook 2). The neighbours of the node that is placed are
 * chosen here from ids and a location lookup, which needs no map, so the choice is tested alone.
 * `applyConstraints` asks the `draw.constraint` items with the screen positions, and gives the place back in lon/lat.
 */
import type { ConstraintInput, ConstraintItem, ConstraintLabel } from './extension-points'
import type { Modifiers } from './modifiers'
import type { Loc, Point } from './snap'

/** A fixed node next to the placed one, and the node beyond it along the way (the reference direction) */
export type Neighbour = { at: Loc; before?: Loc }

/** The location of a node by its id; undefined for a node that is not loaded */
export type LocOf = (id: string) => Loc | undefined

/** A neighbour from an id, with the node beyond it as `before`. Undefined if the neighbour is not loaded. */
function neighbourOf(id: string | undefined, beyond: string | undefined, locOf: LocOf) {
  const at = id === undefined ? undefined : locOf(id)
  if (!at) return undefined
  const before = beyond === undefined ? undefined : locOf(beyond)
  return before ? { at, before } : { at }
}

function present(neighbours: (Neighbour | undefined)[]): Neighbour[] {
  return neighbours.filter((n): n is Neighbour => n !== undefined)
}

/**
 * The fixed nodes next to the node being drawn (the preview node is not among them, and an area's closing node is
 * left out). A line grows at one end: one neighbour, the fixed node there, with the node next to it as `before`.
 * An area is closed around the draw node: its neighbours are the last fixed node and the first one. With one fixed
 * node there is one neighbour and no `before`.
 */
export function drawNeighbours(
  kind: 'line' | 'area',
  fixed: readonly string[],
  atStart: boolean,
  locOf: LocOf,
): Neighbour[] {
  if (fixed.length === 0) return []
  if (kind === 'line') {
    const end = atStart ? fixed[0] : fixed[fixed.length - 1]
    const beyond = fixed.length < 2 ? undefined : atStart ? fixed[1] : fixed[fixed.length - 2]
    return present([neighbourOf(end, beyond, locOf)])
  }
  if (fixed.length === 1) return present([neighbourOf(fixed[0], undefined, locOf)])
  const last = fixed.length - 1
  return present([
    neighbourOf(fixed[last], fixed[last - 1], locOf),
    neighbourOf(fixed[0], fixed[1], locOf),
  ])
}

/**
 * The neighbours of a vertex that is dragged, in its one parent way: the node before it and the node after it.
 * A closed way is a ring: the closing node that repeats the first is skipped, and the neighbours wrap around. A
 * vertex at the end of a line has one neighbour. Undefined ids (a node not in the way) give no neighbour.
 */
export function dragNeighbours(
  nodeId: string,
  nodes: readonly string[],
  closed: boolean,
  locOf: LocOf,
): Neighbour[] {
  if (closed) {
    const ring =
      nodes.length > 1 && nodes[0] === nodes[nodes.length - 1] ? nodes.slice(0, -1) : [...nodes]
    const n = ring.length
    const i = ring.indexOf(nodeId)
    // a ring of two nodes has no corner to constrain
    if (i < 0 || n < 3) return []
    const at = (k: number) => ring[((k % n) + n) % n]
    return present([
      neighbourOf(at(i - 1), at(i - 2), locOf),
      neighbourOf(at(i + 1), at(i + 2), locOf),
    ])
  }
  const i = nodes.indexOf(nodeId)
  if (i < 0) return []
  return present([
    i > 0 ? neighbourOf(nodes[i - 1], nodes[i - 2], locOf) : undefined,
    i < nodes.length - 1 ? neighbourOf(nodes[i + 1], nodes[i + 2], locOf) : undefined,
  ])
}

/** The part of the map the constraints use: screen and lon/lat, the bearing and the zoom */
export type ConstraintMap = {
  project(lnglat: [number, number]): { x: number; y: number }
  unproject(point: [number, number]): { lng: number; lat: number }
  getBearing(): number
  getZoom(): number
}

/** The equatorial circumference of the Web Mercator sphere, in metres (the map's own model) */
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6378137
/** MapLibre draws 512 pixel tiles, so zoom z has 512 * 2^z pixels across the world */
const TILE_PIXELS = 512

/**
 * Metres on the ground per screen pixel at a latitude and a zoom, on the map's Mercator projection: the length of a
 * pixel on the ground shrinks with cos(latitude). Used by a constraint that rounds lengths in metres (ADR 0011).
 */
export function metresPerPixel(latitude: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos((latitude * Math.PI) / 180)) / (TILE_PIXELS * 2 ** zoom)
}

/** The place a constraint gives, in lon/lat, and the guides and labels it draws (guides: pairs of lon/lat) */
export type Constrained = { loc: Loc; guides: [Loc, Loc][]; labels?: { at: Loc; text: string }[] }

/**
 * Asks each item in order with the pointer and the neighbours on the screen. The first result wins; its point and guides
 * are turned back into lon/lat. Undefined: no item constrains this place.
 */
export function applyConstraints(
  map: ConstraintMap,
  items: readonly ConstraintItem[],
  input: {
    kind: 'draw' | 'drag'
    point: Point
    neighbours: Neighbour[]
    modifiers: Modifiers
  },
): Constrained | undefined {
  if (items.length === 0) return undefined
  const toScreen = (loc: Loc): Point => {
    const p = map.project(loc)
    return { x: p.x, y: p.y }
  }
  const toLoc = (p: Point): Loc => {
    const at = map.unproject([p.x, p.y])
    return [at.lng, at.lat]
  }
  // the scale is taken where the node is placed: at the first neighbour, or at the pointer with none
  const anchor = input.neighbours[0]?.at ?? toLoc(input.point)
  const constraintInput: ConstraintInput = {
    kind: input.kind,
    point: input.point,
    neighbours: input.neighbours.map((n) =>
      n.before ? { at: toScreen(n.at), before: toScreen(n.before) } : { at: toScreen(n.at) },
    ),
    modifiers: input.modifiers,
    bearing: map.getBearing(),
    metresPerPixel: metresPerPixel(anchor[1], map.getZoom()),
  }
  for (const item of items) {
    const result = item.constrain(constraintInput)
    if (!result) continue
    return {
      loc: toLoc(result.point),
      guides: result.guides.map(([a, b]) => [toLoc(a), toLoc(b)] as [Loc, Loc]),
      labels: result.labels?.map((label: ConstraintLabel) => ({
        at: toLoc(label.at),
        text: label.text,
      })),
    }
  }
  return undefined
}
