/**
 * Midpoint handles: the small handle in the middle of each segment of a selected way, and the press on one
 * that adds a node to the segment and goes on as a drag of that node. Owned by the engine as `engine.handles`.
 * The drag itself (dragTo, undo steps) stays in the engine; this file reaches it through `HandlesHost`.
 */
import type { OsmWay } from '@osm-editor-kit/maid-model'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { OsmData } from './data'
import { midpointFeatures, segmentsOf, type MidpointFeature, type Segment } from './midpoints'
import type { Loc, Point } from './snap'

/** Pixels around the pointer in which a midpoint handle is hit */
const HANDLE_PX = 6
/** Pixels a press on a handle must move before its node is made: a click with a little shake adds nothing */
const HANDLE_DRAG_PX = 3

export interface HandlesHost {
  map(): MapLibreMap | undefined
  data: OsmData
  /** Handles exist only in browse mode with no drawing, move, rotation or measure under way */
  mayCompute(): boolean
  selected(): readonly string[]
  /** The feature is on the map */
  isDrawn(id: string): boolean
  isReadOnly(id: string): boolean
  /** The nodes of a way on the screen, in order */
  projected(way: OsmWay): Parameters<typeof segmentsOf>[0]
  pushHighlight(): void
  busy(): boolean
  /** The node being dragged, if any */
  dragged(): string | undefined
  dragTo(
    id: string,
    lon: number,
    lat: number,
    aim?: { point: Point; layers: string[]; free: boolean },
  ): void
  /** Adds a node on the segment inside the drag's work in progress; returns its id */
  insertNode(edge: [string, string], loc: Loc): string
}

export class MidpointHandles {
  constructor(private readonly host: HandlesHost) {}

  /** A press that ended: it added nothing if it never moved */
  release() {
    this.pressed = undefined
  }

  /** The node that a handle drag made, once; the drag's undo step is named for it */
  takeNode() {
    const node = this.node
    this.node = undefined
    return node
  }

  /** The handles on the map now (midpoints.ts): one per segment of a selected way that is long enough and in view */
  list: MidpointFeature[] = []

  /**
   * Works out the handles for the selected ways. Only in browse mode, only for ways that are on the map
   * and can be changed, and only for a segment whose parent ways can all be changed too: the node
   * of a handle goes into each of them. Nothing is sent: `refreshShape` and `refreshMidpoints` do that.
   */
  compute() {
    const map = this.host.map()
    this.list = []
    if (!map || !this.host.mayCompute()) return
    const segments: Segment[] = []
    for (const id of this.host.selected()) {
      if (id[0] !== 'w' || !this.host.isDrawn(id) || this.host.isReadOnly(id)) continue
      const way = this.host.data.way(id)
      if (way) segments.push(...segmentsOf(this.host.projected(way)))
    }
    if (segments.length === 0) return
    const container = map.getContainer()
    this.list = midpointFeatures(
      segments,
      { width: container.clientWidth, height: container.clientHeight },
      (p) => {
        const at = map.unproject([p.x, p.y])
        return [at.lng, at.lat]
      },
    ).filter((f) => this.mayChange(f.properties.edge))
  }

  /** True if every way that a node added on this segment would join is on the map and can be changed */
  private mayChange(edge: readonly [string, string]) {
    const [a, b] = edge
    const bWays = new Set(this.host.data.nodeWays.get(b) ?? [])
    return (this.host.data.nodeWays.get(a) ?? []).every(
      (wayId) => !bWays.has(wayId) || (this.host.isDrawn(wayId) && !this.host.isReadOnly(wayId)),
    )
  }

  /** After the view moved: the handles are the ones in view now. Not per frame, and nothing when no way is selected. */
  refresh() {
    if (this.host.selected().length === 0 && this.list.length === 0) return
    this.compute()
    this.host.pushHighlight()
  }

  /** The handle under a screen point, if there is one: its segment and where it is on the ground */
  at(point: Point, tolerance = HANDLE_PX): { edge: [string, string]; loc: Loc } | undefined {
    const map = this.host.map()
    if (!map) return undefined
    for (const feature of this.list) {
      const [lon, lat] = feature.geometry.coordinates as Loc
      const at = map.project([lon, lat])
      if (Math.hypot(at.x - point.x, at.y - point.y) <= tolerance)
        return { edge: feature.properties.edge, loc: [lon, lat] }
    }
    return undefined
  }

  /** The press on a handle that has not moved yet. The node is made on the first real move (`move`). */
  private pressed?: { edge: [string, string]; loc: Loc; start: Point }
  /** The node that a handle drag made, so the drag's undo step is named for what it did */
  private node?: string

  /** True between a press on a handle and its release */
  get pressing() {
    return this.pressed !== undefined
  }

  /**
   * A press at a screen point: on a handle, it is taken as the start of a handle drag and true is returned.
   * Nothing is changed by the press itself: a press with no move adds nothing (see endDrag).
   */
  press(point: Point) {
    if (this.host.busy()) return false
    const handle = this.at(point)
    if (!handle) return false
    this.pressed = { ...handle, start: point }
    return true
  }

  /**
   * A pointer move while a handle is pressed. Until the pointer is HANDLE_DRAG_PX away from the press, nothing
   * happens. Then the node is added on the segment (inside the drag's work in progress, so the drag is one
   * undo step) and the drag goes on as a drag of that node: dragTo, with the same snapping as any node.
   */
  move(
    point: Point,
    lon: number,
    lat: number,
    aim?: { point: Point; layers: string[]; free: boolean },
  ) {
    const press = this.pressed
    if (!press) return
    let id = this.host.dragged()
    if (id === undefined) {
      if (Math.hypot(point.x - press.start.x, point.y - press.start.y) < HANDLE_DRAG_PX) return
      id = this.insertNode(press.edge, press.loc)
    }
    this.host.dragTo(id, lon, lat, aim)
  }

  /** The node of a handle drag: added on the segment, in the work in progress (the drag commits it) */
  private insertNode(edge: [string, string], loc: Loc) {
    const id = this.host.insertNode(edge, loc)
    this.node = id
    return id
  }
}
