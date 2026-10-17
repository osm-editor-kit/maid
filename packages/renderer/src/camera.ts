/**
 * The camera moves the engine makes: turning the map with the mouse and the keys, and fitting the view
 * to some entities. Owned by the engine as `engine.camera`. Imperative on purpose: react-map-gl has no
 * prop for a one-off camera move, and the map is uncontrolled (MapView passes initialViewState once).
 */
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { OsmData } from './data'
import { boundsOf, type MembersOf } from './related'
import type { Point } from './snap'
import { dragTurn, TURN_TOLERANCE } from './turn'

/** MapLibre zoom (512 px) of the largest zoom fitTo goes to (OSM 19): a single node or a short way is not zoomed in to the last level */
const FIT_MAX_ZOOM = 18
/** MapLibre zoom (512 px) of a single point in fitTo (OSM 18), unless the map is already closer */
const POINT_ZOOM = 17

export interface CameraHost {
  map(): MapLibreMap | undefined
  data: OsmData
  membersOf: MembersOf
}

export class Camera {
  constructor(private readonly host: CameraHost) {}

  /** A turn with the mouse in progress: where the press was, where the pointer is, and whether it moved */
  private turnDrag: { start: Point; last: Point; moved: boolean } | undefined
  /** When the last turn that moved ended (performance.now). The click MapLibre sends after it is not a click. */
  turnedAt = Number.NEGATIVE_INFINITY

  /** True from the press to the release of a turn with the mouse */
  get turning() {
    return this.turnDrag !== undefined
  }

  /** A turn with the mouse starts at `point`. The caller has checked that the press is on open map. */
  startTurn(point: Point) {
    this.turnDrag = { start: point, last: point, moved: false }
  }

  /**
   * The pointer moved during a turn: the map turns around the centre of the view (turn.ts). Set on the
   * map directly, because a turn runs on every pointer move and React would render on each one.
   */
  moveTurn(point: Point) {
    const drag = this.turnDrag
    const map = this.host.map()
    if (!drag || !map) return
    const { clientWidth, clientHeight } = map.getContainer()
    const turn = dragTurn(drag.last, point, { x: clientWidth / 2, y: clientHeight / 2 })
    drag.last = point
    if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > TURN_TOLERANCE)
      drag.moved = true
    if (turn !== 0) map.setBearing(map.getBearing() + turn)
  }

  /** The turn ends with the release of the mouse */
  endTurn() {
    const drag = this.turnDrag
    this.turnDrag = undefined
    if (drag?.moved) this.turnedAt = performance.now()
  }

  // The camera moves below are imperative: react-map-gl has no prop for a one-off camera move, and the
  // map is uncontrolled (MapView passes initialViewState once).
  /** Turns the map by `degrees` in a short ease: the keys (Shift with the arrows) */
  turnBy(degrees: number) {
    const map = this.host.map()
    if (map) map.easeTo({ bearing: map.getBearing() + degrees, duration: 100 })
  }

  /** Turns the map back to north: the compass button and N */
  resetNorth() {
    this.host.map()?.easeTo({ bearing: 0, duration: 300 })
  }

  /**
   * Whether any of these entities' loaded geometry is in the view: their bounds meet the map's bounds (on a turned map,
   * the box around the view). False when none of it is loaded or there is no map. For "Fly to" buttons, which only show
   * for what is out of view.
   */
  inView(ids: readonly string[]) {
    const map = this.host.map()
    const bounds = this.boundsOf(ids)
    if (!map || !bounds) return false
    const view = map.getBounds()
    const [west, south, east, north] = bounds
    return (
      east >= view.getWest() &&
      west <= view.getEast() &&
      north >= view.getSouth() &&
      south <= view.getNorth()
    )
  }

  private boundsOf(ids: readonly string[]) {
    return boundsOf(ids, {
      loc: (id) => this.host.data.node(id)?.loc,
      nodesOf: (id) => this.host.data.way(id)?.nodes,
      membersOf: this.host.membersOf,
    })
  }

  /**
   * Moves the map to show these entities: the bounds of their loaded geometry, with padding. A
   * relation counts as its members (see relatedIds). Returns false when none of it is loaded.
   * The zoom limits are MapLibre zoom (POINT_ZOOM, FIT_MAX_ZOOM), one level below iD's and Rapid's.
   * The turn of the map is kept: MapLibre would otherwise bring it back to north.
   * Imperative: a one-off camera move, which react-map-gl has no prop for (see turnBy).
   */
  fitTo(ids: readonly string[]) {
    const map = this.host.map()
    const bounds = this.boundsOf(ids)
    if (!map || !bounds) return false
    const [west, south, east, north] = bounds
    if (west === east && south === north) {
      map.easeTo({
        center: [west, south],
        zoom: Math.min(Math.max(map.getZoom(), POINT_ZOOM), FIT_MAX_ZOOM),
        bearing: map.getBearing(),
        duration: 400,
      })
    } else {
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 80, maxZoom: FIT_MAX_ZOOM, bearing: map.getBearing(), duration: 400 },
      )
    }
    return true
  }
}
