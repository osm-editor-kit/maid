/**
 * Moving and rotating the selection with the pointer, as iD's M and R do. The move is iD's move:
 * `actionMove`, so the ways that share a node with the selection but are not selected keep their
 * shape, and a replacement vertex is added where they are bent. Rotating moves the nodes in place.
 * R on one point with a direction turns that tag instead (iD's rotate-point-direction): the
 * first angle points at the pointer's bearing from the point, the other angles keep their offset,
 * and the tag keeps its format. A point with no direction tag yet gets the key of its preset's
 * numeric direction field (iD's preset fallback): the tag is written on the first pointer move.
 * The result is in the work in progress of the history while the pointer moves; a click keeps it
 * as one undo step, Escape takes it back.
 */
import {
  actionChangeTags,
  actionMove,
  type Action,
  type Graph,
  OsmNode,
} from '@osm-editor-kit/maid-model'
import {
  isDirectionKey,
  normalizeAzimuthDegrees,
  numericDirectionFieldKey,
  retargetDirectionValue,
  rotatableDirectionKey,
} from '@osm-editor-kit/maid-operations'
import type { Geometry } from '@osm-editor-kit/maid-presets'
import type { MaidEngine } from './engine'

export type TransformKind = 'move' | 'rotate'
type Loc = [lon: number, lat: number]
type XY = [x: number, y: number]
/** The cache of actionMove, see `TransformTool.moveCache` */
type MoveCache = NonNullable<Parameters<typeof actionMove>[2]>

const RAD = Math.PI / 180

/**
 * Moves many nodes as one action: the positions that one `actionMoveNode` per node would give, but
 * one pass through the graph and one commit. A commit per node made a rotation of N nodes cost N
 * commits. Each node is interpolated with the formula of `actionMoveNode` (vecInterp of
 * @rapid-sdk/math), so the final locations are the same. Each id may appear once.
 */
export function actionMoveNodes(moves: readonly (readonly [id: string, to: Loc])[]) {
  const action: Action = (graph: Graph, t?: number) => {
    // as actionMoveNode: no or a bad t is the whole move, and t is kept between 0 and 1
    const eased = t === null || t === undefined || !isFinite(t) ? 1 : Math.min(Math.max(+t, 0), 1)
    if (eased === 0) return graph
    const nodes = moves.map(([id, to]) => {
      const node = graph.entity(id)
      if (!(node instanceof OsmNode)) throw new Error(`${id} is not a node`)
      const from = node.loc!
      return node.move([from[0] + (to[0] - from[0]) * eased, from[1] + (to[1] - from[1]) * eased])
    })
    return graph.replace(nodes).commit()
  }
  action.transitionable = true
  return action
}

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
export function nodesOf(engine: MaidEngine, ids: readonly string[]) {
  const { data } = engine
  const nodes = new Set<string>()
  const addWay = (id: string) => {
    for (const nodeId of data.way(id)?.nodes ?? []) nodes.add(nodeId)
  }
  for (const id of ids) {
    switch (id.charAt(0)) {
      case 'n':
        if (data.node(id)) nodes.add(id)
        break
      case 'w':
        addWay(id)
        break
      case 'r':
        for (const member of data.relation(id)?.members ?? []) {
          if (member.type === 'node' && data.node(member.id)) nodes.add(member.id)
          else if (member.type === 'way') addWay(member.id)
        }
        break
    }
  }
  return nodes
}

/** The direction tag that R turns on one point, with the point's tags as they were when R started */
type DirectionTurn = { id: string; key: string; tags: Record<string, string> }

/**
 * The bearing of a point seen from the pivot, in degrees clockwise from north. The Mercator plane is
 * north-up and conformal: the angle is the one on the ground, whatever the map's bearing on screen.
 */
function bearingFrom(pivot: XY, at: XY) {
  return normalizeAzimuthDegrees(Math.atan2(at[0] - pivot[0], at[1] - pivot[1]) / RAD)
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
  /** Set while R turns the direction of one point, instead of the nodes */
  private direction?: DirectionTurn
  /**
   * Set by a view change: the next pointer position becomes the start and writes nothing, so the
   * direction does not jump when the map moved under a pointer that did not (iD skips that move).
   */
  private rebase = false
  /**
   * actionMove's cache for one move. Every pointer move starts again from the state the move began
   * with and shares this cache, as iD's move mode does, so the replacement vertices keep their ids.
   */
  private moveCache: MoveCache = {}
  /**
   * The latest pointer position that no step has applied yet. The pointer events between two
   * animation frames only set it, so a step runs once per frame however many events arrive, as
   * `dragTo` keeps only the latest position while the map is busy.
   */
  private latest?: XY
  /** The animation frame that applies `latest`, if one is asked for */
  private frame?: number

  constructor(private engine: MaidEngine) {}

  get active() {
    return this.kind !== undefined
  }

  /** Starts moving or rotating these entities. False if there is nothing to transform or it is read-only. */
  begin(kind: TransformKind, ids: readonly string[]) {
    const { engine } = this
    if (this.active || ids.length === 0 || ids.some((id) => engine.isReadOnly(id))) return false
    // a move starts again from the last commit on every pointer move: work that is not ours in
    // the work in progress would be taken back with it
    if (kind === 'move' && engine.data.history.hasWorkInProgress) return false
    const nodes = nodesOf(engine, ids)
    // a single node has nothing to rotate around, unless R turns its direction
    const direction = kind === 'rotate' ? this.directionOf(ids) : undefined
    if (nodes.size === 0 || (kind === 'rotate' && nodes.size < 2 && !direction)) return false
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
    this.direction = direction
    this.rebase = false
    this.moveCache = {}
    return true
  }

  /**
   * The direction tag that R turns for this selection: the one tag of one point with a rotatable
   * direction (see `rotatableDirectionKey`), or the numeric direction field of its preset when the
   * point has no direction tag. Undefined for anything else, which R moves or refuses.
   */
  directionOf(ids: readonly string[]): DirectionTurn | undefined {
    if (ids.length !== 1 || !ids[0]!.startsWith('n')) return undefined
    const id = ids[0]!
    const node = this.engine.data.node(id)
    if (!node) return undefined
    const tags = node.tags
    const hasDirectionKey = Object.keys(tags).some(isDirectionKey)
    const key = rotatableDirectionKey(
      tags,
      hasDirectionKey ? undefined : this.presetDirectionKey(id),
    )
    return key ? { id, key, tags: { ...tags } } : undefined
  }

  /**
   * The key of the numeric direction field of the point's preset (iD's utilDirectionFieldKey), read
   * from the editor's presets: the preset's fields and its more fields, as the inspector offers them.
   * Undefined while the presets are not there (`editor.presetsPending`), or when the preset has none.
   */
  private presetDirectionKey(id: string): string | undefined {
    const presets = this.engine.options.editor.presets
    const node = this.engine.data.node(id)
    if (!presets || !node?.loc) return undefined
    const { tags, loc } = node
    const geometry: Geometry = this.engine.data.nodeWays.has(id) ? 'vertex' : 'point'
    const preset = presets.match(tags, geometry, loc)
    return numericDirectionFieldKey(
      [
        ...presets.fieldsFor(preset, tags, geometry, loc),
        ...presets.moreFieldsFor(preset, tags, geometry, loc),
      ],
      geometry,
    )
  }

  /**
   * The map moved or zoomed without the pointer (a key, a button, a wheel): the pointer's place on
   * the ground changed while the pointer did not. For a direction the next pointer move writes
   * nothing, as iD skips the first move after a pan or a zoom. A move of nodes needs no such step.
   */
  viewChanged() {
    if (this.direction) this.rebase = true
  }

  /**
   * The pointer moved: the selection follows. The step for the latest position runs in the next
   * animation frame (see `latest`). The first position seen is where the pointer started.
   */
  move(lon: number, lat: number) {
    if (!this.kind) return
    const pointer = toMercator([lon, lat])
    if (this.rebase) {
      this.rebase = false
      // the view changed before this position: nothing is written for it
      if (this.start) {
        this.latest = undefined
        return
      }
    }
    this.start ??= pointer
    this.latest = pointer
    this.frame ??= requestAnimationFrame(() => {
      this.frame = undefined
      this.apply()
    })
  }

  /** Moves the selection to the latest pointer position, if no step has done it yet */
  private apply() {
    const pointer = this.latest
    this.latest = undefined
    const { kind, engine, pivot, start, direction } = this
    if (!kind || !pointer || !start) return

    if (kind === 'rotate' && direction) {
      // as iD's rotate-point-direction: the first angle points at the pointer's bearing from the point,
      // and the other angles keep their offset from it. Absolute, so the start of the pointer does not
      // matter and nothing adds up; written from the tags R started with, one tag change per step.
      const value = retargetDirectionValue(
        direction.tags[direction.key],
        bearingFrom(pivot, pointer),
      )
      const tags = { ...direction.tags, [direction.key]: value }
      engine.change(() => engine.data.history.perform(actionChangeTags(direction.id, tags)), false)
      return
    }

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
    // always from where the nodes started, so nothing adds up over many pointer moves; one action
    // for all of them, so the step is one commit
    const moves = [...this.origin].map(([id, at]): [string, Loc] => [id, fromMercator(place(at))])
    engine.change(() => engine.data.history.perform(actionMoveNodes(moves)), false)
  }

  /** Stops the frame that would apply the latest position */
  private unschedule() {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.frame = undefined
  }

  /** Keeps the result as one undo step. Returns false if nothing was moved. */
  finish() {
    // the last pointer position is where the selection is put down: applied before the commit
    this.unschedule()
    this.apply()
    const { kind, ids, engine, direction } = this
    if (!kind) return false
    this.kind = undefined
    this.direction = undefined
    const { history } = engine.data
    if (!history.hasWorkInProgress) return false
    // as iD's annotations: a point's direction is "a point", a node of a way "a node in a way"
    const what = direction
      ? engine.data.nodeWays.get(direction.id)?.length
        ? 'a node in a way'
        : 'a point'
      : ids.length === 1
        ? 'a feature'
        : `${ids.length} features`
    const verb = kind === 'move' ? 'Moved' : 'Rotated'
    engine.change(() =>
      history.commit({
        annotation: `${verb} ${what}`,
        selectedIDs: [...ids],
      }),
    )
    return true
  }

  /** Puts everything back where it was. A pending pointer position is dropped, not applied. */
  cancel() {
    if (!this.kind) return
    this.kind = undefined
    this.direction = undefined
    this.rebase = false
    this.unschedule()
    this.latest = undefined
    this.engine.change(() => this.engine.data.history.revert())
  }
}
