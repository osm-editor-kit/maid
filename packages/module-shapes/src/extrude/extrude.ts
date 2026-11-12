/**
 * What an extrude works on and what it makes: the sides of one way in local metres, and for one side pulled a distance
 * out or in, where its nodes go and which corners are new. Pure functions of the graph: no map, no editor. Plan:
 * docs/research/drawing-tools/9-extrude.md.
 *
 * Two ways to pull a side, as JOSM's Extrude:
 * - `corners` (JOSM's default drag): the side's corners stay and two new corners join them to the moved side, a bump
 *   (or a notch, inwards). A corner whose neighbouring side already runs along the pull moves along it instead, so a
 *   rectangle's side makes the rectangle longer and no node is left on a straight line.
 * - `move` (JOSM's Ctrl with dual align): no new corner; each end slides along its neighbouring side, so the neighbours
 *   keep their direction. An end without a neighbour, or with one nearly parallel to the side, moves straight out.
 */
import { OsmNode, OsmWay, type Action, type Graph } from '@osm-editor-kit/maid-model'
import { frameAt, toLoc, toMetres, type Frame, type Loc } from '../shared/metres.ts'
import { add, cross, dot, sub, type Pt } from '../shared/vector.ts'

/** Why a selection cannot be extruded */
export type ExtrudeRefusal = 'incomplete'

/** How a pulled side changes the way (see the file's comment) */
export type ExtrudeHow = 'corners' | 'move'

/** A side shorter than this has no handle: two nodes on the same spot (m) */
const MIN_SIDE = 0.05

/**
 * A neighbouring side within this angle of the pull counts as running along it (`corners`), and within this angle of
 * the side as parallel to it (`move`): 10 degrees, as the angle snap's tolerance for a right angle
 */
const ALONG = Math.cos((10 * Math.PI) / 180)

/** A pull shorter than this changes nothing (m): a press on a handle without a drag */
export const MIN_DISTANCE = 0.01

/** One way as the extrude sees it: its nodes in local metres, and whether it is a closed ring */
export type ExtrudeWay = {
  wayId: string
  frame: Frame
  closed: boolean
  /** The way's node ids, the closing node of a ring included */
  nodes: readonly string[]
  /** Each node's place in metres */
  points: ReadonlyMap<string, Pt>
}

/** One side of the way: nodes `a` and `b` at `nodes[index]` and `nodes[index + 1]` */
export type Side = {
  index: number
  a: string
  b: string
  /** Unit vector from a to b */
  dir: Pt
  /** Unit vector at a right angle to the side: out of a ring, to the left of a line */
  normal: Pt
  /** The middle of the side, in metres */
  middle: Pt
  length: number
  /** The node before a and the node after b along the way, if any */
  before?: string
  after?: string
}

/**
 * The way a selection extrudes: exactly one way with at least two nodes.
 * @param   graph - The data
 * @param   ids   - The selected ids
 * @return  True when it applies
 */
export function extrudeApplies(graph: Graph, ids: readonly string[]): boolean {
  if (ids.length !== 1) return false
  const entity = graph.hasEntity(ids[0]!)
  return entity instanceof OsmWay && entity.nodes.length >= 2
}

/**
 * The way in metres, or why it cannot be extruded.
 * @param   graph - The data
 * @param   id    - The way's id
 * @return  The way, or the refusal
 */
export function extrudeWayOf(graph: Graph, id: string): ExtrudeWay | { refused: ExtrudeRefusal } {
  const way = graph.hasEntity(id)
  if (!(way instanceof OsmWay)) return { refused: 'incomplete' }
  const locs = new Map<string, Loc>()
  for (const nodeId of way.nodes) {
    const node = graph.hasEntity(nodeId)
    if (!(node instanceof OsmNode) || !node.loc) return { refused: 'incomplete' }
    locs.set(nodeId, node.loc)
  }
  const frame = frameAt([...locs.values()])
  const points = new Map([...locs].map(([nodeId, loc]) => [nodeId, toMetres(frame, loc)]))
  return { wayId: id, frame, closed: way.isClosed(), nodes: way.nodes, points }
}

/** Twice the signed area of a ring of points: positive when it runs anticlockwise (x east, y north) */
function signedArea(points: readonly Pt[]): number {
  let sum = 0
  for (let i = 0; i + 1 < points.length; i++) sum += cross(points[i]!, points[i + 1]!)
  return sum
}

function unit(v: Pt): Pt {
  const length = Math.hypot(v.x, v.y)
  return length === 0 ? { x: 0, y: 0 } : { x: v.x / length, y: v.y / length }
}

/**
 * The sides of the way that can be pulled: every segment longer than a few centimetres.
 * @param   way - The way in metres
 * @return  The sides, in the way's order
 */
export function sidesOf(way: ExtrudeWay): Side[] {
  const { nodes, points, closed } = way
  const at = (id: string) => points.get(id)!
  // a ring that runs anticlockwise has its outside on the right of each side
  const outsideRight = closed && signedArea(nodes.map(at)) > 0
  const last = nodes.length - 1
  const sides: Side[] = []
  for (let i = 0; i < last; i++) {
    const a = nodes[i]!
    const b = nodes[i + 1]!
    const ab = sub(at(b), at(a))
    const length = Math.hypot(ab.x, ab.y)
    if (length < MIN_SIDE) continue
    const dir = unit(ab)
    const left = { x: -dir.y, y: dir.x }
    // the node before a: the one before it on the way, or on a ring the one before the closing node
    const before = i > 0 ? nodes[i - 1] : closed && last >= 3 ? nodes[last - 1] : undefined
    const after = i + 2 <= last ? nodes[i + 2] : closed && last >= 3 ? nodes[1] : undefined
    sides.push({
      index: i,
      a,
      b,
      dir,
      normal: outsideRight ? { x: -left.x, y: -left.y } : left,
      middle: { x: (at(a).x + at(b).x) / 2, y: (at(a).y + at(b).y) / 2 },
      length,
      before: before !== b ? before : undefined,
      after: after !== a ? after : undefined,
    })
  }
  return sides
}

/** What a pull makes: the way's node list (ids, and the new corners as places) and the places of the moved nodes */
export type ExtrudeResult = {
  /** The way's nodes after the pull: an id, or a new corner's place in metres */
  nodes: (string | Pt)[]
  /** The nodes of the way that move, with their new places in metres */
  moved: ReadonlyMap<string, Pt>
  /** The ends of the side after the pull, in metres: where the distance label goes */
  side: [Pt, Pt]
}

/**
 * Where one end of the side goes: along its neighbouring side when that is allowed, otherwise not at all (a new
 * corner is made, `corners`) or straight out (`move`).
 * @return  The new place, and whether the node itself moves there (false: a new corner goes there)
 */
function endOf(
  way: ExtrudeWay,
  side: Side,
  end: string,
  neighbour: string | undefined,
  distance: number,
  how: ExtrudeHow,
): { place: Pt; moves: boolean } {
  const p = way.points.get(end)!
  const out = { x: side.normal.x * distance, y: side.normal.y * distance }
  if (neighbour !== undefined) {
    const along = unit(sub(way.points.get(neighbour)!, p))
    const towardsPull = dot(along, side.normal)
    const slides =
      how === 'corners'
        ? Math.abs(towardsPull) >= ALONG
        : Math.abs(cross(along, side.dir)) > Math.sqrt(1 - ALONG * ALONG)
    // the place on the neighbour's line that is `distance` out from the side
    if (slides)
      return {
        place: add(p, {
          x: (along.x * distance) / towardsPull,
          y: (along.y * distance) / towardsPull,
        }),
        moves: true,
      }
  }
  return how === 'move' ? { place: add(p, out), moves: true } : { place: add(p, out), moves: false }
}

/**
 * The way after one side is pulled `distance` metres along its normal (negative: inwards).
 * @param   way      - The way in metres
 * @param   side     - The side (from `sidesOf` of the same way)
 * @param   distance - How far, in metres, positive out of a ring (or to the left of a line)
 * @param   how      - New corners or a moved side
 * @return  The nodes and moves
 */
export function extrude(
  way: ExtrudeWay,
  side: Side,
  distance: number,
  how: ExtrudeHow,
): ExtrudeResult {
  const start = endOf(way, side, side.a, side.before, distance, how)
  const end = endOf(way, side, side.b, side.after, distance, how)
  const moved = new Map<string, Pt>()
  const inserted: Pt[] = []
  if (start.moves) moved.set(side.a, start.place)
  else inserted.push(start.place)
  if (end.moves) moved.set(side.b, end.place)
  else inserted.push(end.place)
  const nodes: (string | Pt)[] = [
    ...way.nodes.slice(0, side.index + 1),
    ...inserted,
    ...way.nodes.slice(side.index + 1),
  ]
  return { nodes, moved, side: [start.place, end.place] }
}

/**
 * The places of a result as positions, for the map's preview.
 * @param   way    - The way in metres
 * @param   result - The pull
 * @return  The way's positions in [lon, lat], in order
 */
export function previewLocs(way: ExtrudeWay, result: ExtrudeResult): Loc[] {
  return result.nodes.map((node) =>
    toLoc(
      way.frame,
      typeof node === 'string' ? (result.moved.get(node) ?? way.points.get(node)!) : node,
    ),
  )
}

/**
 * The edit that makes a pull: new corners as new nodes of this way only, moved nodes moved (with every way they are
 * on, as a drag of the node would).
 * @param   way    - The way in metres, made from the graph the action runs on
 * @param   result - The pull
 * @return  The action
 */
export function extrudeAction(way: ExtrudeWay, result: ExtrudeResult): Action {
  return (graph: Graph) => {
    const ids: string[] = []
    for (const node of result.nodes) {
      if (typeof node === 'string') {
        ids.push(node)
        continue
      }
      const corner = new OsmNode(graph.context, { loc: toLoc(way.frame, node) })
      graph.replace(corner)
      ids.push(corner.id)
    }
    for (const [id, place] of result.moved) {
      graph.replace((graph.entity(id) as OsmNode).move(toLoc(way.frame, place)))
    }
    graph.replace((graph.entity(way.wayId) as OsmWay).update({ nodes: ids }))
    return graph.commit()
  }
}

/** How far around the pulled side corners count for snapping (m): a building or a parking lot, not the whole map */
const SNAP_RADIUS = 80

/**
 * The places the pulled side can line up with: the corners of the way and of everything nearby, within SNAP_RADIUS of
 * the side's middle, without the side's own two ends. Asked once when a pull starts.
 * @param   graph - The data
 * @param   way   - The way in metres
 * @param   side  - The side being pulled
 * @return  The places in the way's metres
 */
export function snapTargets(graph: Graph, way: ExtrudeWay, side: Side): Pt[] {
  const targets: Pt[] = []
  const seen = new Set<string>([side.a, side.b])
  const take = (id: string, loc: Loc | undefined) => {
    if (seen.has(id) || !loc) return
    seen.add(id)
    const p = toMetres(way.frame, loc)
    if (Math.hypot(p.x - side.middle.x, p.y - side.middle.y) <= SNAP_RADIUS) targets.push(p)
  }
  // the way's own corners first: when two places are as good, its own wins
  for (const id of way.nodes)
    take(id, way.points.has(id) ? toLoc(way.frame, way.points.get(id)!) : undefined)
  // an entry in `local` replaces the one in `base`; `undefined` there means deleted (as OsmData.all)
  for (const [id, entity] of graph.base.entities)
    if (!graph.local.entities.has(id) && entity instanceof OsmNode) take(id, entity.loc)
  for (const entity of graph.local.entities.values())
    if (entity instanceof OsmNode) take(entity.id, entity.loc)
  return targets
}

/**
 * The pull's distance after snapping: a place within `tolerance` of the moved side's line puts the side through it,
 * so it lines up with a corner of the way or of a feature nearby. The nearest wins.
 * @param   way       - The way in metres
 * @param   side      - The side being pulled
 * @param   distance  - The distance the pointer gives
 * @param   targets   - The places to line up with (`snapTargets`)
 * @param   tolerance - How close a place must be to the line, in metres (a few pixels on the screen)
 * @return  The distance, and the place it lines up with, if any
 */
export function snapDistance(
  way: ExtrudeWay,
  side: Side,
  distance: number,
  targets: readonly Pt[],
  tolerance: number,
): { distance: number; target?: Pt } {
  const a = way.points.get(side.a)!
  let best: { distance: number; target: Pt; off: number } | undefined
  for (const q of targets) {
    const along = dot(sub(q, a), side.normal)
    if (Math.abs(along) < MIN_DISTANCE) continue
    const off = Math.abs(along - distance)
    if (off <= tolerance && (!best || off < best.off - 1e-9))
      best = { distance: along, target: q, off }
  }
  return best ? { distance: best.distance, target: best.target } : { distance }
}
