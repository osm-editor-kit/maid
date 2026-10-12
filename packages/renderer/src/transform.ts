/**
 * Moving and rotating the selection with the pointer, as iD's M and R do. The move is iD's move:
 * `actionMove`, so the ways that share a node with the selection but are not selected keep their
 * shape, and a replacement vertex is added where they are bent. Rotating moves the nodes in place.
 * The result is in the work in progress of the history while the pointer moves; a click keeps it
 * as one undo step, Escape takes it back.
 */
import { actionMove, actionMoveNode } from '@osm-editor-kit/maid-model'
import type { MaidEngine } from './engine'

export type TransformKind = 'move' | 'rotate'
type Loc = [lon: number, lat: number]
type XY = [x: number, y: number]
/** The cache of actionMove, see `TransformTool.moveCache` */
type MoveCache = NonNullable<Parameters<typeof actionMove>[2]>

const RAD = Math.PI / 180

/** Web Mercator in radians: angles and distances on it are the ones the map shows */
export function toMercator([lon, lat]: readonly number[]): XY {
  return [(lon ?? 0) * RAD, Math.log(Math.tan(Math.PI / 4 + ((lat ?? 0) * RAD) / 2))]
}

export function fromMercator([x, y]: XY): Loc {
  return [x / RAD, (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD]
}

/**
 * Units of the world plane that `actionMove` takes its delta in: the ones of @rapid-sdk/math's
 * projWgs84ToWorld at WORLD_ZOOM 16 (a world 256 * 2^16 units wide). Maid's model does not export
 * that projection, so the factor is written here; `transform.test.ts` checks it against actionMove.
 * On the world plane a radian of longitude is WORLD_SIZE / 2π units and y runs the other way.
 */
const WORLD_UNITS_PER_RADIAN = (256 * 2 ** 16) / (2 * Math.PI)

/** The delta in world units that moves a point from `from` to `to` (both on the Mercator plane) */
export function worldDelta(from: XY, to: XY): XY {
  return [(to[0] - from[0]) * WORLD_UNITS_PER_RADIAN, -(to[1] - from[1]) * WORLD_UNITS_PER_RADIAN]
}

/** The nodes that make up these entities: a node itself, the nodes of a way, of a relation's member ways */
export function nodesOf(engine: MaidEngine, ids: readonly string[]): Set<string> {
  const { data } = engine
  const nodes = new Set<string>()
  const addWay = (id: string) => {
    for (const nodeId of data.way(id)?.nodes ?? []) nodes.add(nodeId)
  }
  for (const id of ids) {
    if (id[0] === 'n' && data.node(id)) nodes.add(id)
    else if (id[0] === 'w') addWay(id)
    else if (id[0] === 'r')
      for (const member of data.relation(id)?.members ?? []) {
        if (member.type === 'node' && data.node(member.id)) nodes.add(member.id)
        else if (member.type === 'way') addWay(member.id)
      }
  }
  return nodes
}

export class TransformTool {
  private kind?: TransformKind
  private ids: string[] = []
  /** Where every node was when the tool started, on the Mercator plane */
  private origin = new Map<string, XY>()
  /** Rotation turns around the middle of the nodes */
  private pivot: XY = [0, 0]
  /** Where the pointer was first seen: the move is the pointer's distance from there */
  private start?: XY
  /**
   * actionMove's cache for one move. Every pointer move starts again from the state the move began
   * with and shares this cache, as iD's move mode does, so the replacement vertices keep their ids.
   */
  private moveCache: MoveCache = {}

  constructor(private engine: MaidEngine) {}

  get active(): boolean {
    return this.kind !== undefined
  }

  /** Starts moving or rotating these entities. False if there is nothing to transform or it is read-only. */
  begin(kind: TransformKind, ids: readonly string[]): boolean {
    const { engine } = this
    if (this.active || ids.length === 0 || ids.some((id) => engine.isReadOnly(id))) return false
    // a move starts again from the last commit on every pointer move: work that is not ours in
    // the work in progress would be taken back with it
    if (kind === 'move' && engine.data.history.hasWorkInProgress) return false
    const nodes = nodesOf(engine, ids)
    // a single node has nothing to rotate around
    if (nodes.size === 0 || (kind === 'rotate' && nodes.size < 2)) return false
    this.origin.clear()
    let sumX = 0
    let sumY = 0
    for (const id of nodes) {
      const loc = engine.data.node(id)?.loc
      if (!loc) continue
      const at = toMercator(loc)
      this.origin.set(id, at)
      sumX += at[0]
      sumY += at[1]
    }
    if (this.origin.size === 0) return false
    this.pivot = [sumX / this.origin.size, sumY / this.origin.size]
    this.kind = kind
    this.ids = [...ids]
    this.start = undefined
    this.moveCache = {}
    return true
  }

  /** The pointer moved: the selection follows */
  move(lon: number, lat: number) {
    const { kind, engine, pivot } = this
    if (!kind) return
    const pointer = toMercator([lon, lat])
    this.start ??= pointer
    const { start } = this

    if (kind === 'move') {
      // as iD: always from the state the move began with, so nothing adds up over many pointer moves
      const action = actionMove(this.ids, worldDelta(start, pointer), this.moveCache)
      engine.change(() => {
        engine.data.history.revert()
        engine.data.history.perform(action)
      }, false)
      return
    }

    const angle =
      Math.atan2(pointer[1] - pivot[1], pointer[0] - pivot[0]) -
      Math.atan2(start[1] - pivot[1], start[0] - pivot[0])
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const place = ([x, y]: XY): XY => {
      const rx = x - pivot[0]
      const ry = y - pivot[1]
      return [pivot[0] + rx * cos - ry * sin, pivot[1] + rx * sin + ry * cos]
    }
    // always from where the nodes started, so nothing adds up over many pointer moves
    const actions = [...this.origin].map(([id, at]) => actionMoveNode(id, fromMercator(place(at))))
    engine.change(() => engine.data.history.perform(...actions), false)
  }

  /** Keeps the result as one undo step. Returns false if nothing was moved. */
  finish(): boolean {
    const { kind, ids, engine } = this
    if (!kind) return false
    this.kind = undefined
    const { history } = engine.data
    if (!history.hasWorkInProgress) return false
    const what = ids.length === 1 ? 'a feature' : `${ids.length} features`
    engine.change(() =>
      history.commit({
        annotation: `${kind === 'move' ? 'Moved' : 'Rotated'} ${what}`,
        selectedIDs: [...ids],
      }),
    )
    return true
  }

  /** Puts everything back where it was */
  cancel() {
    if (!this.kind) return
    this.kind = undefined
    this.engine.change(() => this.engine.data.history.revert())
  }
}
