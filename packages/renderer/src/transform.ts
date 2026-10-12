/**
 * Moving and rotating the selection with the pointer, as iD's M and R do. The nodes of the
 * selection follow the pointer in the work in progress of the history; a click keeps the result as
 * one undo step, Escape takes it back.
 */
import { actionMoveNode } from '@osm-editor-kit/maid-model'
import type { MaidEngine } from './engine'

export type TransformKind = 'move' | 'rotate'
type Loc = [lon: number, lat: number]
type XY = [x: number, y: number]

const RAD = Math.PI / 180

/** Web Mercator in radians: angles and distances on it are the ones the map shows */
export function toMercator([lon, lat]: readonly number[]): XY {
  return [(lon ?? 0) * RAD, Math.log(Math.tan(Math.PI / 4 + ((lat ?? 0) * RAD) / 2))]
}

export function fromMercator([x, y]: XY): Loc {
  return [x / RAD, (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD]
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
  private ids: readonly string[] = []
  /** Where every node was when the tool started, on the Mercator plane */
  private origin = new Map<string, XY>()
  /** Rotation turns around the middle of the nodes */
  private pivot: XY = [0, 0]
  /** Where the pointer was first seen: the move is the pointer's distance from there */
  private start?: XY

  constructor(private engine: MaidEngine) {}

  get active(): boolean {
    return this.kind !== undefined
  }

  /** Starts moving or rotating these entities. False if there is nothing to transform or it is read-only. */
  begin(kind: TransformKind, ids: readonly string[]): boolean {
    const { engine } = this
    if (this.active || ids.length === 0 || ids.some((id) => engine.isReadOnly(id))) return false
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
    this.ids = ids
    this.start = undefined
    return true
  }

  /** The pointer moved: the nodes follow */
  move(lon: number, lat: number) {
    const { kind, engine, pivot } = this
    if (!kind) return
    const pointer = toMercator([lon, lat])
    this.start ??= pointer
    const { start } = this
    let place: (at: XY) => XY
    if (kind === 'move') {
      const dx = pointer[0] - start[0]
      const dy = pointer[1] - start[1]
      place = ([x, y]) => [x + dx, y + dy]
    } else {
      const angle =
        Math.atan2(pointer[1] - pivot[1], pointer[0] - pivot[0]) -
        Math.atan2(start[1] - pivot[1], start[0] - pivot[0])
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      place = ([x, y]) => {
        const rx = x - pivot[0]
        const ry = y - pivot[1]
        return [pivot[0] + rx * cos - ry * sin, pivot[1] + rx * sin + ry * cos]
      }
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
