/**
 * Drawing a line or an area, the way iD does it: the way that is being drawn is real data in the
 * work in progress of the history, and its last node follows the pointer. That gives the preview
 * (line, fill, the look of the tags) from the normal redraw. A click fixes the node and adds the
 * next one; finishing commits everything as one undo step, cancelling reverts it.
 */
import {
  actionAddEntity,
  actionAddMidpoint,
  actionAddVertex,
  actionDeleteNode,
  actionMoveNode,
  OsmNode,
  OsmWay,
} from '@osm-editor-kit/maid-model'
import type { MaidEngine } from './engine'
import { nearestOnPolyline, SNAP_PX, type Loc, type Point, type Projected } from './snap'

export type DrawKind = 'line' | 'area'
/** What a click or the pointer lands on: an existing node, a place on a way, or open ground */
type Target =
  | { type: 'node'; id: string; loc: Loc }
  | { type: 'way'; loc: Loc; edge: [string, string] }
  | { type: 'free'; loc: Loc }

export class DrawTool {
  private kind: DrawKind = 'line'
  private wayId?: string
  /** The node that follows the pointer. It is taken out again when drawing ends. */
  private cursorId?: string
  /** A continued line grows at its start instead of its end */
  private atStart = false
  /** True if the way existed before: finishing with nothing added must not delete it */
  private continued = false
  constructor(private engine: MaidEngine) {}

  get active() {
    return this.wayId !== undefined
  }

  /** The way being drawn, if any */
  get way() {
    return this.wayId ? this.engine.data.way(this.wayId) : undefined
  }

  /**
   * The pointer moved: the preview node follows it, snapped to what is under it.
   * `layers` are the map layers that can be snapped to.
   */
  move(point: Point, layers: string[]) {
    if (!this.cursorId) return
    const { loc } = this.target(point, layers)
    this.engine.dragTo(this.cursorId, loc[0], loc[1])
  }

  /**
   * A click. The first one starts the way (on an end of an existing line: continues that line).
   * Later ones fix the preview node there and add the next. A click on the node placed last, or
   * on the first node of an area, finishes. Returns the id of the finished way, if this click finished one.
   */
  async click(kind: DrawKind, point: Point, layers: string[]) {
    const { engine } = this
    await engine.settleDrag()
    const target = this.target(point, layers)
    if (!this.active) {
      this.start(kind, target)
      return undefined
    }
    const way = this.way
    if (!way || !this.cursorId) return undefined
    const fixed = this.fixedNodes(way)
    const last = this.atStart ? fixed[0] : fixed[fixed.length - 1]
    if (target.type === 'node' && (target.id === last || this.closes(target.id, fixed)))
      return this.finish()

    const cursorId = this.cursorId
    const wayId = way.id
    engine.change(() => {
      const { history } = engine.data
      const cursor = engine.data.node(cursorId)
      if (!cursor) return
      switch (target.type) {
        case 'node': {
          // the existing node takes the place of the preview node
          const at = this.cursorIndex()
          history.perform(actionDeleteNode(cursorId, false), actionAddVertex(wayId, target.id, at))
          break
        }
        case 'way':
          // the preview node becomes a node of the way it was clicked on
          history.perform(actionAddMidpoint({ loc: target.loc, edge: target.edge }, cursor))
          break
        case 'free':
          history.perform(actionMoveNode(cursorId, target.loc))
          break
      }
      this.addCursor(target.loc)
    })
    return undefined
  }

  /** Starts a line at this node; on the end of exactly one line that line is continued (iD's A) */
  startAt(nodeId: string) {
    const loc = this.engine.data.node(nodeId)?.loc
    if (this.active || !loc) return false
    this.start('line', { type: 'node', id: nodeId, loc: [loc[0], loc[1]] })
    return true
  }

  /**
   * Ends drawing and keeps the way as one undo step. A way that is too short to exist (a line
   * with one node, an area with two) is dropped. Returns the id of the way that was kept.
   */
  finish() {
    const { engine } = this
    const { history } = engine.data
    const wayId = this.wayId
    const cursorId = this.cursorId
    if (!wayId || !cursorId) return undefined
    engine.stopDrag()
    this.reset()
    let kept: string | undefined
    engine.change(() => {
      // deleting the preview node also deletes a way that is left with too few nodes
      history.perform(actionDeleteNode(cursorId))
      const way = engine.data.way(wayId)
      const enough = way && new Set(way.nodes).size >= (this.kind === 'area' ? 3 : 2)
      if (!way || (!enough && !this.continued)) {
        history.revert()
        return
      }
      kept = wayId
      const annotation = this.continued
        ? 'Continued a line'
        : this.kind === 'area'
          ? 'Added an area'
          : 'Added a line'
      history.commit({ annotation, selectedIDs: [wayId] })
    })
    return kept
  }

  /**
   * Takes back the node that was placed last, as Backspace does in iD. With only the first node
   * left, drawing is cancelled.
   */
  undoLast() {
    const { engine } = this
    const way = this.way
    if (!way || !this.cursorId) return
    const fixed = this.fixedNodes(way)
    if (fixed.length <= 1 || (this.continued && fixed.length <= 2)) {
      this.cancel()
      engine.setMode('browse')
      return
    }
    const last = this.atStart ? fixed[0] : fixed[fixed.length - 1]
    if (!last) return
    engine.stopDrag()
    engine.change(() => {
      const { history } = engine.data
      const node = engine.data.node(last)
      // a node that other ways use stays; it only leaves this way
      const shared = (engine.data.nodeUses.get(last) ?? 0) > 1
      if (shared && node) {
        const next = way.removeNode(last)
        history.perform((graph) => graph.replace(next).commit())
      } else {
        history.perform(actionDeleteNode(last, false))
      }
    })
  }

  /** Ends drawing and takes everything back that it added */
  cancel() {
    if (!this.active) return
    const { engine } = this
    engine.stopDrag()
    this.reset()
    engine.change(() => engine.data.history.revert())
  }

  private reset() {
    this.wayId = undefined
    this.cursorId = undefined
    this.atStart = false
  }

  private start(kind: DrawKind, target: Target) {
    const { engine } = this
    const { context, history } = engine.data
    this.kind = kind
    this.continued = false
    this.atStart = false
    engine.change(() => {
      let firstId: string
      if (target.type === 'node') {
        firstId = target.id
        const line = kind === 'line' ? this.lineEndingAt(target.id) : undefined
        if (line) {
          // continue this line instead of starting a new one
          this.wayId = line.id
          this.continued = true
          this.atStart = line.nodes[0] === target.id
          this.addCursor(target.loc)
          return
        }
      } else {
        const first = new OsmNode(context, { loc: target.loc })
        firstId = first.id
        history.perform(actionAddEntity(first))
        if (target.type === 'way')
          history.perform(actionAddMidpoint({ loc: target.loc, edge: target.edge }, first))
      }
      // iD's convention: an area is a closed way with area=yes until it gets its type
      const way = new OsmWay(context, {
        nodes: kind === 'area' ? [firstId, firstId] : [firstId],
        tags: kind === 'area' ? { area: 'yes' } : {},
      })
      history.perform(actionAddEntity(way))
      this.wayId = way.id
      this.addCursor(target.loc)
    })
  }

  /** Adds the node that follows the pointer to the way. Call inside `engine.change`. */
  private addCursor(loc: Loc) {
    const { engine } = this
    if (!this.wayId) return
    const cursor = new OsmNode(engine.data.context, { loc })
    this.cursorId = cursor.id
    engine.data.history.perform(
      actionAddEntity(cursor),
      actionAddVertex(this.wayId, cursor.id, this.cursorIndex()),
    )
  }

  /** Where the preview node sits in the way: at the growing end, in an area before the closing node */
  private cursorIndex() {
    const way = this.way
    if (!way) return undefined
    if (this.atStart) return 0
    const at = this.cursorId ? way.nodes.indexOf(this.cursorId) : -1
    if (at >= 0) return at
    return this.kind === 'area' ? way.nodes.length - 1 : way.nodes.length
  }

  /** The nodes of the way without the preview node (and without an area's closing node) */
  private fixedNodes(way: OsmWay) {
    const nodes = way.nodes.filter((id) => id !== this.cursorId)
    if (this.kind === 'area' && nodes.length > 1 && nodes[0] === nodes[nodes.length - 1])
      nodes.pop()
    return nodes
  }

  /** A click on the first node closes an area that has enough nodes */
  private closes(nodeId: string, fixed: string[]) {
    return this.kind === 'area' && fixed.length >= 3 && fixed[0] === nodeId
  }

  /** The one unclosed line that starts or ends at this node, if there is exactly one */
  private lineEndingAt(nodeId: string) {
    const { data } = this.engine
    const ways = (data.nodeWays.get(nodeId) ?? []).map((id) => data.way(id))
    if (ways.length !== 1) return undefined
    const way = ways[0]
    if (!way || way.isClosed() || way.tags.area === 'yes') return undefined
    const ends = [way.nodes[0], way.nodes[way.nodes.length - 1]]
    return ends.includes(nodeId) ? way : undefined
  }

  /**
   * What is under a screen position, not counting the way that is being drawn. Imperative: the map's
   * projection gives the screen distance of each node to the pointer, on every move (no React state).
   */
  private target(point: Point, layers: string[]): Target {
    const { engine } = this
    const map = engine.map
    const free = (): Target => {
      const at = map?.unproject([point.x, point.y])
      return { type: 'free', loc: at ? [at.lng, at.lat] : [0, 0] }
    }
    if (!map) return free()
    const near = (loc: readonly number[] | undefined) => {
      if (!loc) return Infinity
      const p = map.project([loc[0] ?? 0, loc[1] ?? 0])
      return Math.hypot(p.x - point.x, p.y - point.y)
    }
    // The way's own nodes first. Most of them have no vertex on the map, so picking misses them.
    const way = this.way
    if (way) {
      for (const id of this.fixedNodes(way)) {
        const node = engine.data.node(id)
        if (node?.loc && near(node.loc) <= SNAP_PX)
          return { type: 'node', id, loc: [node.loc[0], node.loc[1]] }
      }
    }
    const skip = new Set<string>()
    if (this.wayId) skip.add(this.wayId)
    if (this.cursorId) skip.add(this.cursorId)
    const id = engine.pick(point, layers, SNAP_PX, skip)
    if (id?.[0] === 'n') {
      const node = engine.data.node(id)
      if (node?.loc) return { type: 'node', id, loc: [node.loc[0], node.loc[1]] }
    }
    if (id?.[0] === 'w') {
      const hit = engine.data.way(id)
      const on = hit && nearestOnWay(engine, hit, point)
      if (on) return { type: 'way', ...on }
    }
    return free()
  }
}

/** The closest place on a way's line to a screen position, with the two nodes it lies between */
export function nearestOnWay(
  engine: MaidEngine,
  way: OsmWay,
  point: Point,
): { loc: Loc; edge: [string, string] } | undefined {
  const map = engine.map
  if (!map) return undefined
  const nodes = projectedNodes(engine, way)
  // a click inside an area hits its fill: only its outline is snapped to
  const on = nearestOnPolyline(nodes, point, SNAP_PX)
  if (!on) return undefined
  const at = map.unproject([on.x, on.y])
  return { loc: [at.lng, at.lat], edge: on.edge }
}

/** The nodes of a way on the screen, in order; a node without a location is left out */
export function projectedNodes(engine: MaidEngine, way: OsmWay) {
  const map = engine.map
  const nodes: Projected[] = []
  if (!map) return nodes
  for (const id of way.nodes) {
    const loc = engine.data.node(id)?.loc
    if (!loc) continue
    const p = map.project([loc[0], loc[1]])
    nodes.push({ id, x: p.x, y: p.y })
  }
  return nodes
}
