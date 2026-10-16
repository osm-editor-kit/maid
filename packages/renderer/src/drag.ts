/**
 * Dragging a node: the moves that follow the pointer (one at a time, the latest wins), what the node is
 * aimed at, and the one undo step when it is dropped, with the connection to a node or a way. Owned by the
 * engine as `engine.dragging`; the engine keeps the delegating methods (`dragTo`, `endDrag`, ...).
 * Same pattern as DrawTool and TransformTool: it works on the engine's public members.
 */
import { actionAddMidpoint, actionConnect } from '@osm-editor-kit/maid-model'
import { dragNeighbours, type Neighbour } from './constraint'
import type { MaidEngine } from './engine'
import type { Loc, Point, SnapTarget } from './snap'
import { aimAtNode, snapTargetAt } from './snap-aim'

/** The aim of a map drag: where the pointer is, which layers can be snapped to, and whether Alt makes it free */
type Aim = { point: Point; layers: string[]; free: boolean }

export class DragTool {
  constructor(private engine: MaidEngine) {}

  private target?: { id: string; lon: number; lat: number }
  /** The vertex being dragged: its moves become one undo step when the drag ends */
  node?: string
  busy = false
  /**
   * What the dragged node is over at the last step: a node or a way it would snap to, and the
   * reason a drop there would be refused. Undefined while nothing is aimed at (Alt, drawing).
   */
  private aim?: { target?: SnapTarget; refused?: string }
  /**
   * The last move that the map view aimed (not the drawing's cursor). A key that changes makes it again (refresh), so
   * the drag follows Alt without a mouse move.
   */
  private last?: { id: string; lon: number; lat: number; aim: Aim }

  /** Why the drop at the pointer would be refused, while a drag is over a target that is not allowed */
  get refusal() {
    return this.aim?.refused
  }

  /**
   * What a screen point lands on for a snap: a node (a vertex or a point) within SNAP_PX first,
   * else the line of the nearest way within SNAP_PX. Features in `skip`, read-only features and
   * anything not in `layers` (the layers a click uses, so no hidden feature) are not targets. One
   * query of the rendered features around the point.
   */
  snapAt(point: Point, layers: string[], skip: ReadonlySet<string>) {
    return snapTargetAt(this.engine, point, layers, skip)
  }

  private aimAt(id: string, point: Point, layers: string[]) {
    return aimAtNode(this.engine, id, point, layers)
  }

  /** True if this id is a node that can be dragged: a vertex or a standalone point */
  isDraggable(id: string | null): id is string {
    return (
      !!id &&
      id[0] === 'n' &&
      this.engine.data.node(id) !== undefined &&
      !this.engine.isReadOnly(id)
    )
  }

  /**
   * Call on every pointer move while a vertex is held. Positions that arrive while the map is
   * still drawing the previous one are dropped in favour of the latest, so the vertex never
   * lags behind by more than one update.
   */
  dragTo(id: string, lon: number, lat: number, aim?: Aim) {
    // Aimed (a vertex or a point dragged by the map view): the node snaps to what is under the pointer,
    // unless Alt is held. A refused target keeps the node at the pointer; the drop takes it back.
    const aimed = aim && !aim.free ? this.aimAt(id, aim.point, aim.layers) : undefined
    this.aim = aimed
    let at: Loc = aimed?.target && !aimed.refused ? aimed.target.loc : [lon, lat]
    if (aim) {
      const hover = aimed?.target
      this.engine.setHover(hover ? (hover.type === 'node' ? hover.id : hover.wayId) : id)
      this.last = { id, lon, lat, aim }
      // Free (Alt) or over a snap target: no constraint. Otherwise the vertex is held to its way's constraints (ADR 0011).
      if (!aim.free && !aimed?.target) {
        at = this.constrain(id, aim.point) ?? at
      } else this.engine.setGuides([])
    }
    this.target = { id, lon: at[0], lat: at[1] }
    this.node = id
    this.engine.sender.touch()
    if (this.busy) return
    this.busy = true
    void (async () => {
      try {
        while (this.target) {
          const target = this.target
          this.target = undefined
          await this.engine.moveNodeStep(target.id, target.lon, target.lat)
        }
      } finally {
        this.busy = false
      }
    })()
  }

  /** Resolves when the moves that were asked for are on the map. Does not end the drag. */
  async settleDrag() {
    while (this.busy) await new Promise((resolve) => requestAnimationFrame(resolve))
  }

  /** Makes the last aimed move again, with the keys as they are now (the engine calls it when a key changes) */
  refresh() {
    const last = this.last
    if (!last || !this.node) return
    this.dragTo(last.id, last.lon, last.lat, {
      ...last.aim,
      free: this.engine.modifiers.alt,
    })
  }

  /** The place a vertex is held to by the constraints, or undefined. The guides are cleared when there is none. */
  private constrain(id: string, point: Point): Loc | undefined {
    const neighbours = this.neighboursOf(id)
    if (!neighbours) {
      this.engine.setGuides([])
      return undefined
    }
    return this.engine.constrainPlacement('drag', point, neighbours)
  }

  /**
   * The neighbours of a vertex with exactly one parent way: the nodes before and after it in that way. A point, or a
   * vertex that two ways share, has none (ADR 0011).
   */
  private neighboursOf(id: string): Neighbour[] | undefined {
    const { data } = this.engine
    const parents = data.nodeWays.get(id) ?? []
    const [parent] = parents
    if (parents.length !== 1 || parent === undefined) return undefined
    const way = data.way(parent)
    if (!way) return undefined
    return dragNeighbours(id, way.nodes, way.isClosed(), (nid) => data.node(nid)?.loc)
  }

  /** Forgets a move that was not made yet and ends the drag without an undo step */
  stopDrag() {
    this.target = undefined
    this.node = undefined
    this.last = undefined
    this.engine.setGuides([])
  }

  /**
   * Call when the vertex is released. The drag is one undo step: the move, and the connection when
   * the node was dropped on a node or a way (the oldest node of a connected pair survives, as iD does).
   * A refused drop is taken back, so the node is where the drag started. Resolves with the node the
   * selection should show after a connection (`selected`), and with the reason of a refusal.
   */
  async endDrag() {
    // a press on a handle that never moved is over: it added nothing
    this.engine.handles.release()
    // Over from here: a key that changes while the last move settles must not aim the drag again (refresh),
    // or the release with Shift still held would be undone by the key-up that follows it.
    this.last = undefined
    await this.settleDrag()
    this.engine.setGuides([])
    const id = this.node
    const added = this.engine.handles.takeNode()
    const aim = this.aim
    this.node = undefined
    this.aim = undefined
    const { history } = this.engine.data
    const result: { selected?: string; refused?: string } = {}
    if (id && history.hasWorkInProgress) {
      const target = aim?.target
      if (aim?.refused) {
        this.engine.change(() => history.revert())
        result.refused = aim.refused
      } else if (target?.type === 'node') {
        const standalone = !this.engine.data.nodeWays.get(id)?.length
        this.engine.change(() => {
          history.perform(actionConnect([id, target.id]))
          // the connect keeps the oldest of the two: the dragged node, or the one it was dropped on
          const survivor = history.staging.graph.hasEntity(id) ? id : target.id
          history.commit({
            annotation: standalone ? 'Connected a point to a node' : 'Connected a way to a node',
            selectedIDs: [survivor],
          })
          result.selected = survivor
        })
      } else if (target?.type === 'way' && this.engine.data.node(id)) {
        const node = this.engine.data.node(id)!
        const standalone = !this.engine.data.nodeWays.get(id)?.length
        this.engine.change(() => {
          // the dragged node keeps its id and its tags: it is inserted into the way at the snapped place
          history.perform(actionAddMidpoint({ loc: target.loc, edge: target.edge }, node))
          history.commit({
            annotation: standalone ? 'Connected a point to a way' : 'Connected a way to a way',
            selectedIDs: [id],
          })
        })
      } else {
        // a node that a handle drag made is a new node of the way, not a moved one
        const annotation = id === added ? 'Added a node to a way' : 'Moved a node'
        history.commit({ annotation, selectedIDs: [id] })
      }
    }
    if (id) this.engine.setHover(result.selected ?? id)
    this.engine.changed()
    // the moved features stay in the live tier until compaction
    this.engine.sender.touch()
    this.engine.sender.wake()
    return result
  }
}
