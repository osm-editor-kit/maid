/**
 * Snapping a dragged node, or a new point, to what is under the pointer. These are the pure
 * helpers: no map, no engine. The engine finds the candidates and calls them, and drawing (`draw.ts`)
 * uses the same distance rule, so a drag and a drawn click snap alike.
 */
import type { OsmWay } from '@osm-editor-kit/maid-model'

/** Pixels around the pointer in which a node or a way is snapped to (drawing and dragging) */
export const SNAP_PX = 8

export type Point = { x: number; y: number }
export type Loc = [lon: number, lat: number]

/** What a snap lands on: a node (a vertex or a standalone point), or the line of a way at `loc` */
export type SnapTarget =
  /** `distance`: screen pixels from the pointer to the node, when known; the nearest node wins */
  | { type: 'node'; id: string; loc: Loc; distance?: number }
  | { type: 'way'; wayId: string; loc: Loc; edge: [string, string]; distance: number }

/** A node of a way, projected to the screen */
export type Projected = { id: string; x: number; y: number }

/**
 * The closest place on a polyline of projected nodes to a screen point, with the two nodes it lies
 * between. Undefined if that place is farther than `tolerance` pixels. The point is clamped to the
 * ends of each segment, so a point beyond an end snaps to that end.
 */
export function nearestOnPolyline(nodes: readonly Projected[], point: Point, tolerance = SNAP_PX) {
  let best: { x: number; y: number; distance: number; edge: [string, string] } | undefined
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i]!
    const b = nodes[i + 1]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length2 = dx * dx + dy * dy
    const t =
      length2 === 0
        ? 0
        : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2))
    const x = a.x + t * dx
    const y = a.y + t * dy
    const distance = Math.hypot(x - point.x, y - point.y)
    if (!best || distance < best.distance) best = { x, y, distance, edge: [a.id, b.id] }
  }
  return best && best.distance <= tolerance ? best : undefined
}

/**
 * The target under the pointer: a node first (a vertex or a point, the nearest one; one without a
 * distance counts as farthest), else the nearest way. Equally near candidates go to the first one.
 */
export function chooseTarget(candidates: readonly SnapTarget[]) {
  let node: Extract<SnapTarget, { type: 'node' }> | undefined
  let way: Extract<SnapTarget, { type: 'way' }> | undefined
  for (const candidate of candidates) {
    if (candidate.type === 'node') {
      if (!node || (candidate.distance ?? Infinity) < (node.distance ?? Infinity)) node = candidate
    } else if (!way || candidate.distance < way.distance) way = candidate
  }
  return node ?? way
}

/**
 * Why joining node `dragged` to node `target` of the same way would be refused, or undefined. The join is the one
 * the connect makes (`replaceNode`: the dragged node replaced, a repeated neighbour dropped); a way it leaves with
 * too few nodes would be deleted by the connect. Two neighbours merge and a line may close or loop on itself, as in
 * iD; an area that would touch itself at one node is refused, as iD refuses a self-intersection.
 */
export function ownWayRefusal(way: OsmWay, dragged: string, target: string) {
  if (!way.contains(dragged) || !way.contains(target)) return undefined
  if (way.replaceNode(dragged, target).isDegenerate())
    return 'The way would be left with too few nodes'
  if (way.isClosed() && !way.isAdjacent(dragged, target))
    return 'The area would touch itself at one node'
  return undefined
}
