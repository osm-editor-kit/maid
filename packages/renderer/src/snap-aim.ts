// Where a dragged node would land: the snap target under the pointer, and why a drop onto a target would be refused.
// Reads the map and the data through the engine's public members: nothing here changes the engine.
// Imperative on purpose: the snap is a screen-radius test at the pointer on every move (see pick.ts).
import { actionConnect } from '@osm-editor-kit/maid-model'
import { projectedNodes } from './draw'
import type { MaidEngine } from './engine'
import { featureId } from './feature-id'
import {
  chooseTarget,
  collapses,
  nearestOnPolyline,
  type Point,
  type SnapTarget,
  SNAP_PX,
} from './snap'

export function snapTargetAt(
  engine: MaidEngine,
  point: Point,
  layers: string[],
  skip: ReadonlySet<string>,
  /** Ways whose line is not a target, but whose vertices are: the ways of a dragged node */
  ownWays: ReadonlySet<string> = new Set(),
) {
  const { map } = engine
  if (!map) return undefined
  const features = map.queryRenderedFeatures(
    [
      [point.x - SNAP_PX, point.y - SNAP_PX],
      [point.x + SNAP_PX, point.y + SNAP_PX],
    ],
    { layers },
  )
  const candidates: SnapTarget[] = []
  const seen = new Set<string>()
  for (const feature of features) {
    const id = featureId(feature)
    if (!id || seen.has(id) || skip.has(id) || engine.isReadOnly(id)) continue
    seen.add(id)
    switch (id.charAt(0)) {
      case 'n': {
        const loc = engine.data.node(id)?.loc
        if (!loc) break
        // a pin is drawn above its node, so a hit on it can be farther than SNAP_PX: it stays a candidate
        const at = map.project([loc[0], loc[1]])
        const distance = Math.hypot(at.x - point.x, at.y - point.y)
        candidates.push({ type: 'node', id, loc: [loc[0], loc[1]], distance })
        break
      }
      case 'w': {
        const way = engine.data.way(id)
        const nodes = way ? projectedNodes(engine, way) : []
        // a vertex of the line under the pointer is a node target, as in iD, even where no vertex is drawn
        for (const n of nodes) {
          if (skip.has(n.id) || seen.has(n.id) || engine.isReadOnly(n.id)) continue
          const distance = Math.hypot(n.x - point.x, n.y - point.y)
          if (distance > SNAP_PX) continue
          const loc = engine.data.node(n.id)?.loc
          if (loc) candidates.push({ type: 'node', id: n.id, loc: [loc[0], loc[1]], distance })
        }
        const on = way && !ownWays.has(id) && nearestOnPolyline(nodes, point, SNAP_PX)
        if (on) {
          const at = map.unproject([on.x, on.y])
          candidates.push({
            type: 'way',
            wayId: id,
            loc: [at.lng, at.lat],
            edge: on.edge,
            distance: on.distance,
          })
        }
        break
      }
    }
  }
  return chooseTarget(candidates)
}

/**
 * Why a drop that joins the dragged node to this node would be refused, or undefined if it is
 * allowed: the model's own rule (relations, turn restrictions), a way that would be left with too
 * few nodes, or a way that would change and is read-only.
 */
export function connectRefusalOf(engine: MaidEngine, dragged: string, target: string) {
  const { staging } = engine.data.history
  const reason = actionConnect([dragged, target]).disabled?.(staging.graph)
  if (reason === 'restriction') return 'It would break a turn restriction'
  if (reason) return 'The two nodes have different roles in a relation'
  const ways = [
    ...(engine.data.nodeWays.get(dragged) ?? []),
    ...(engine.data.nodeWays.get(target) ?? []),
  ]
  const lists = (engine.data.nodeWays.get(dragged) ?? []).map(
    (w) => engine.data.way(w)?.nodes ?? [],
  )
  if (collapses(lists, dragged, target)) return 'The way would be left with too few nodes'
  if (ways.some((w) => engine.isReadOnly(w))) return 'A way it would change is read-only'
  return undefined
}

/**
 * The snap of a dragged node at this pointer. As in iD, the vertices of the dragged node's own ways
 * are targets (a drop joins the way to itself, or merges two neighbours), their lines are not. A
 * node target that the model would refuse carries the reason.
 */
export function aimAtNode(engine: MaidEngine, id: string, point: Point, layers: string[]) {
  const own = new Set<string>(engine.data.nodeWays.get(id) ?? [])
  const target = snapTargetAt(engine, point, layers, new Set([id]), own)
  if (!target || target.type === 'way') return { target }
  return { target, refused: connectRefusalOf(engine, id, target.id) }
}
