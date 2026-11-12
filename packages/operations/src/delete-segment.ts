// Delete segment: removes the piece of a line between two neighbouring nodes, where the edit menu was opened.
// Not in iD. For rebuilding a line: instead of deleting a node, disconnecting and moving, one step takes the
// segment out. An open line is split at the segment's inner ends and the piece between them is deleted
// (relations keep the remaining pieces, as after a split); a closed line is opened at the segment.
import { Graph, OsmNode, OsmWay, actionDeleteWay, actionSplit } from '@osm-editor-kit/maid-model'
import type { Action } from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext } from './types.ts'

/** The selected line and the index of its segment nearest to where the menu was opened */
type SegmentPlan = { way: OsmWay; index: number; from: OsmNode; to: OsmNode }

/** The squared distance from p to the segment a–b, on a plane where a degree of longitude is `kx` of one of latitude */
function distanceSquared(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
  kx: number,
) {
  const ax = (a[0] - p[0]) * kx
  const ay = a[1] - p[1]
  const bx = (b[0] - p[0]) * kx
  const by = b[1] - p[1]
  const dx = bx - ax
  const dy = by - ay
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length))
  const x = ax + t * dx
  const y = ay + t * dy
  return x * x + y * y
}

/**
 * The segment of the one selected line nearest to `context.at`. Undefined without `at` (the command bar, keys, the
 * menu key), for anything but one line (an area, a node, several features) and for a line with a node out of view.
 */
export function segmentPlan(context: OperationContext): SegmentPlan | undefined {
  const at = context.at
  if (!at || context.selected.length !== 1) return undefined
  const { graph } = context
  const way = graph.hasEntity(context.selected[0]!)
  if (!(way instanceof OsmWay) || way.geometry(graph) !== 'line' || way.nodes.length < 2)
    return undefined
  const nodes = way.nodes.map((id) => graph.hasEntity(id))
  if (!nodes.every((node): node is OsmNode => node instanceof OsmNode && !!node.loc))
    return undefined
  const kx = Math.cos((at[1] * Math.PI) / 180)
  let best: SegmentPlan | undefined
  let bestDistance = Infinity
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i]!
    const to = nodes[i + 1]!
    const d = distanceSquared(at, from.loc!, to.loc!, kx)
    if (d < bestDistance) {
      bestDistance = d
      best = { way, index: i, from, to }
    }
  }
  return best
}

/** The way among `ids` that is exactly the segment from–to, in either direction */
function segmentWay(graph: Graph, ids: readonly string[], from: string, to: string) {
  for (const id of ids) {
    const way = graph.hasEntity(id)
    if (!(way instanceof OsmWay) || way.nodes.length !== 2) continue
    const [a, b] = way.nodes
    if ((a === from && b === to) || (a === to && b === from)) return way.id
  }
  return undefined
}

/** The way among `ids` in which `from` and `to` follow each other */
function wayWithSegment(graph: Graph, ids: readonly string[], from: string, to: string) {
  return ids.find((id) => {
    const way = graph.hasEntity(id)
    if (!(way instanceof OsmWay)) return false
    return way.nodes.some(
      (node, i) =>
        (node === from && way.nodes[i + 1] === to) || (node === to && way.nodes[i + 1] === from),
    )
  })
}

/**
 * The action that takes the segment out, and the ways that are left of the line afterwards (asked after it ran:
 * a split makes new ids). Throws when the line cannot be cut there, for example when the segment's node occurs twice.
 */
function deleteSegmentAction(plan: SegmentPlan) {
  const { way, index } = plan
  const from = plan.from.id
  const to = plan.to.id
  let remaining: string[] = [way.id]
  const action: Action = (graph) => {
    // a line of one segment: the segment is the line
    if (way.nodes.length === 2) {
      remaining = []
      return actionDeleteWay(way.id)(graph)
    }
    // a closed line: open it at the segment, so that it starts after it and ends before it
    if (way.isClosed()) {
      const nodes = way.nodes
      const last = nodes.length - 1
      const opened = [...nodes.slice(index + 1, last), ...nodes.slice(0, index + 1)]
      remaining = [way.id]
      return graph.replace(way.update({ nodes: opened })).commit()
    }
    // an open line: split at the segment's inner ends, then delete the piece between them
    let ids = [way.id]
    for (const node of [from, to]) {
      const at = graph.entity(node) as OsmNode
      const owner = wayWithSegment(graph, ids, from, to)
      const owning = owner && (graph.entity(owner) as OsmWay)
      if (!owning || owning.first() === at.id || owning.last() === at.id) continue
      const split = actionSplit([node]).limitWays([owning.id])
      graph = split(graph)
      ids = [...ids, ...split.getCreatedWayIDs()]
    }
    const piece = segmentWay(graph, ids, from, to)
    if (!piece) throw new Error('The segment could not be cut out of the line')
    remaining = ids.filter((id) => id !== piece)
    return actionDeleteWay(piece)(graph)
  }
  return { action, remaining: () => remaining }
}

/**
 * Delete segment: on a line, the piece between the two nodes around the place where the edit menu was opened. Only in
 * the edit menu of a right click or a long press: the place says which segment. Its preview marks the segment.
 */
export const deleteSegmentOperation: Operation = {
  id: 'delete-segment',
  label: 'Delete segment',
  icon: 'iD-operation-delete',
  group: 'remove',
  applies: (context) => segmentPlan(context) !== undefined,
  disabled: (context) => {
    const plan = segmentPlan(context)
    if (!plan) return undefined
    // no `too_large` as delete has it: only the segment changes, and it is where the menu was opened, so in view
    // an untagged closed line can be the ring of a multipolygon: opening it breaks the area
    if (
      plan.way.isClosed() &&
      context.graph
        .parentRelations(plan.way)
        .some((relation) => relation.tags.type === 'multipolygon')
    )
      return "This segment can't be deleted because the line is the ring of a multipolygon."
    // a dry run on a copy: the graph is transactional, an action changes the one it is given
    try {
      deleteSegmentAction(plan).action(new Graph(context.graph))
    } catch {
      return "This segment can't be cut out of the line."
    }
    return undefined
  },
  preview: (context) => {
    const plan = segmentPlan(context)
    return plan ? [[plan.from.loc!, plan.to.loc!]] : []
  },
  run: (context) => {
    const plan = segmentPlan(context)
    if (!plan) throw new Error('The delete-segment operation does not apply to this selection')
    const { action, remaining } = deleteSegmentAction(plan)
    return {
      actions: [action],
      annotation: plan.way.nodes.length === 2 ? 'Deleted a line' : 'Deleted a segment of a line',
      select: (after) => remaining().filter((id) => after.hasEntity(id) !== undefined),
    }
  },
}
