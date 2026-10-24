/**
 * What a resize works on: the nodes of the selection, the box around them in its own axes, and the node positions for
 * a box that has changed. Pure functions of the graph: no map, no editor. The geometry is in box.ts.
 */
import { OsmNode, OsmRelation, OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import { frameAt, toLoc, toMetres, type Frame, type Loc } from '../shared/metres.ts'
import type { Pt } from '../shared/vector.ts'
import {
  axesOf,
  dominantAngle,
  extentOf,
  fromAxes,
  heightOf,
  mapPoint,
  MIN_SIDE,
  toAxes,
  widthOf,
  type Axes,
  type Extent,
} from './box.ts'

/** Why a selection cannot be resized */
export type ResizeRefusal = 'incomplete' | 'too_thin'

/** The box around a selection when the resize started, and where each of its nodes was in it */
export type ResizeBox = {
  frame: Frame
  axes: Axes
  /** The box when the resize started */
  extent: Extent
  /** Each node of the selection, along the box's axes, as it was when the resize started */
  nodes: ReadonlyMap<string, Pt>
}

/**
 * The selection a resize applies to: at least one way or relation, or at least three nodes (fewer have no box), as
 * Flip long/short.
 * @param   graph - The data
 * @param   ids   - The selected ids
 * @return  True when it applies
 */
export function resizeApplies(graph: Graph, ids: readonly string[]): boolean {
  const entities = ids.map((id) => graph.hasEntity(id))
  if (entities.length === 0 || entities.some((entity) => entity === undefined)) return false
  const nodes = entities.filter((entity) => entity instanceof OsmNode).length
  return entities.length > nodes || nodes >= 3
}

/**
 * The box around the selection, or why there is none.
 * @param   graph - The data
 * @param   ids   - The selected ids
 * @return  The box, or the refusal
 */
export function resizeBoxOf(
  graph: Graph,
  ids: readonly string[],
): ResizeBox | { refused: ResizeRefusal } {
  const collected = collect(graph, ids)
  if (!collected) return { refused: 'incomplete' }
  const { locs, segments } = collected
  const frame = frameAt([...locs.values()])
  const metres = new Map([...locs].map(([id, loc]) => [id, toMetres(frame, loc)]))
  const axes = axesOf(
    dominantAngle(segments.map(([a, b]) => [metres.get(a)!, metres.get(b)!] as const)),
  )
  const nodes = new Map([...metres].map(([id, p]) => [id, toAxes(axes, p)]))
  const extent = extentOf([...nodes.values()])
  if (Math.min(widthOf(extent), heightOf(extent)) < MIN_SIDE) return { refused: 'too_thin' }
  return { frame, axes, extent, nodes }
}

/**
 * The nodes of the selection with their positions, and the segments of its ways (as pairs of node ids). Undefined when
 * a part is missing: a way's node or a relation's member that is not in the graph.
 */
function collect(graph: Graph, ids: readonly string[]) {
  const locs = new Map<string, Loc>()
  const segments: [string, string][] = []
  const seen = new Set<string>()
  const addNode = (id: string): boolean => {
    const node = graph.hasEntity(id)
    if (!(node instanceof OsmNode) || !node.loc) return false
    locs.set(id, node.loc)
    return true
  }
  const add = (id: string): boolean => {
    if (seen.has(id)) return true
    seen.add(id)
    const entity = graph.hasEntity(id)
    if (entity instanceof OsmNode) return addNode(id)
    if (entity instanceof OsmWay) {
      if (!entity.nodes.every(addNode)) return false
      for (let i = 1; i < entity.nodes.length; i++)
        segments.push([entity.nodes[i - 1]!, entity.nodes[i]!])
      return true
    }
    if (entity instanceof OsmRelation) return entity.members.every((member) => add(member.id))
    return false
  }
  if (!ids.every(add) || locs.size === 0) return undefined
  return { locs, segments }
}

/**
 * Where each node goes when the box is now `extent`.
 * @param   box    - The box when the resize started
 * @param   extent - The box now
 * @return  The node ids with their new positions
 */
export function movesFor(box: ResizeBox, extent: Extent): [string, Loc][] {
  return [...box.nodes].map(([id, q]) => [
    id,
    toLoc(box.frame, fromAxes(box.axes, mapPoint(box.extent, extent, q))),
  ])
}

/**
 * A point along the box's axes as a position.
 * @param   box - The box
 * @param   q   - The point, along the box's axes
 * @return  The position in [lon, lat]
 */
export function locOf(box: ResizeBox, q: Pt): Loc {
  return toLoc(box.frame, fromAxes(box.axes, q))
}

/**
 * A position as a point along the box's axes.
 * @param   box - The box
 * @param   loc - The position in [lon, lat]
 * @return  The point, along the box's axes
 */
export function axesPointOf(box: ResizeBox, loc: Loc): Pt {
  return toAxes(box.axes, toMetres(box.frame, loc))
}
