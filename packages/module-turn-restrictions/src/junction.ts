/**
 * The junction as a sketch: the roads around a vertex in a small box, and an arrow for every turn of the chosen
 * FROM road. Headless: plain numbers in SVG units, no React. iD draws the same thing with its own map code (its
 * restriction field, its turn targets 50 px out on the TO road, its grey halo on the FROM road); here the sketch is
 * centred on the junction, fitted to the farthest road on each side, north up or turned with the map's bearing.
 */
import {
  OsmNode,
  osmInferRestriction,
  type Graph,
  type Intersection,
  type OsmWay,
  type Turn,
} from '@osm-editor-kit/maid-model'
import { resolveWayStyle, tagClasses } from '@osm-editor-kit/maid-style'
import { fitMiniMap, type LonLat, type MiniMapBox } from '@osm-editor-kit/maid-ui'
import { turnKindOf, turnStateOf, type TurnKind, type TurnState } from './turns.ts'

export type Point = [number, number]

/** SVG units from the junction at which a road's heading is taken: beyond the first small bend */
const HEADING_RADIUS = 30

/**
 * The least length of a road on the sketch, in SVG units. A road that ends nearer is drawn on past its real end, as a
 * dashed stub, so that its direction and its turn buttons read; the stub is not data (see JunctionRoad.dataEnd).
 */
export const MIN_ARM_LENGTH = 90

/**
 * SVG units from the junction to the turn button on a TO road. iD puts its turn targets at a fixed distance from the
 * junction on the TO way (50 px), so the buttons form a ring instead of clustering at the centre.
 */
export const TURN_BUTTON_RADIUS = 70

/** SVG units from the junction where an arrow leaves the FROM road: clear of the junction's own lines */
const START_RADIUS = 26

/** SVG units from the junction of the via road a turn bends at */
const VIA_RADIUS = 40

/** Sideways spacing of two or more buttons on one TO road (several turns through via ways reach the same road) */
const BUTTON_SPACING = 22

/** Sideways bulge of a U-turn's loop, in SVG units */
const U_TURN_BULGE = 30

/**
 * The least half-span of the drawing in metres (the bounds of the roads are at least twice this). A tiny junction, a
 * few metres of road, is not drawn bigger than this. iD has no such floor: its single-vertex view stays at zoom 22
 * (about 27 px per metre), which only shows a few metres of the junction.
 */
const MIN_HALF_SPAN = 12

export type JunctionRoad = {
  id: EntityID
  /** The road's name, else its ref; undefined when it has neither */
  name: string | undefined
  /**
   * The road in the box, from the junction outwards. Its real points come first, up to `dataEnd`; the points after
   * that are a stub drawn past a road that ends nearer than MIN_ARM_LENGTH.
   */
  points: Point[]
  /** The index of the road's last real point in `points` (the rest is a stub, see above) */
  dataEnd: number
  /** Whether turns can start on this road (iD: only such a road can be chosen as FROM); a oneway that leaves cannot */
  canBeFrom: boolean
  /** Where the road leaves the junction, in degrees clockwise from north: tells apart two roads of one name */
  heading: number
  /** The road's highway tag (`residential`, `primary_link`, ...): the first rule of the FROM road's choice */
  highway: string | undefined
  /** Metres of the road in the drawing, from the junction to the search distance: the second rule's length */
  length: number
}

export type JunctionSketch = {
  /** Width and height of the box in SVG units */
  width: number
  height: number
  /** The junction (the vertex) in the box: the middle of the box */
  centre: Point
  roads: JunctionRoad[]
}

export type JunctionTurn = {
  key: string
  turn: Turn
  from: EntityID
  to: EntityID
  state: TurnState
  /** Undefined for a turn that is not a left, right, U or straight turn (never seen, but not assumed away) */
  kind: TurnKind | undefined
  /** An indirect restriction: drawn lighter and not editable (iD) */
  indirect: boolean
  /** The arrow as an SVG path, from the FROM road to the button */
  path: string
  /** The turn's button: on the TO road, TURN_BUTTON_RADIUS out from the junction (the arrow ends there) */
  at: Point
}

/** How a road is drawn: the colour and width of its fill, and of the casing under it, by its highway class */
export type RoadLook = {
  /** The road's colour, the one the map draws its highway class in (packages/style) */
  fill: string
  /** The casing's colour, the map's casing for the class; undefined where the map draws none */
  casing: string | undefined
  /** Width of the fill in SVG units */
  width: number
  /** Width of the casing in SVG units; the casing shows as an outline on both sides of the fill */
  casingWidth: number
  /** A path (footway, cycleway, ...) is drawn dashed, as the map draws it */
  dashed: boolean
}

/** The colour of a road part the map draws in grey when its class has none (an unknown highway tag) */
const FALLBACK_FILL = '#a1a1aa'

/**
 * The look of a road by its highway tag, from the map's own styles: the fill and casing colours, and whether the map
 * draws it dashed, come from packages/style (the same resolution the map uses), so a change of the map style reaches
 * the sketch. The widths are the sketch's own: a road is 6 units wide, a dashed path 3. `_link` roads look like their
 * class (the style matches them so).
 */
export function roadLook(highway: string | undefined): RoadLook {
  const style = resolveWayStyle(tagClasses(highway ? { highway } : {}), 'line')
  const dashed = style.stroke.dash !== undefined
  const width = dashed ? 3 : 6
  return {
    fill: style.stroke.color ?? FALLBACK_FILL,
    casing: style.casing.color,
    width,
    casingWidth: width + 3,
    dashed,
  }
}

/** Metres between two lon/lat points: enough for the distances of one junction */
function metres(a: LonLat, b: LonLat): number {
  const latitude = ((a[1] + b[1]) / 2) * (Math.PI / 180)
  const dx = (b[0] - a[0]) * 111_320 * Math.cos(latitude)
  const dy = (b[1] - a[1]) * 111_320
  return Math.hypot(dx, dy)
}

/** The road from the junction outwards, up to `radius` metres and the first node beyond it */
function roadFromJunction(graph: Graph, way: OsmWay, junction: LonLat, radius: number): LonLat[] {
  const locs: LonLat[] = []
  for (const id of way.nodes) {
    const node = graph.hasEntity(id)
    const loc = node instanceof OsmNode ? node.loc : undefined
    if (loc) locs.push(loc)
  }
  // the end nearer to the junction comes first (a split road ends there, a via road may pass by)
  const first = locs[0]
  const last = locs[locs.length - 1]
  const ordered =
    first && last && metres(first, junction) > metres(last, junction) ? locs.reverse() : locs
  const line: LonLat[] = []
  for (const loc of ordered) {
    line.push(loc)
    if (metres(loc, junction) > radius) break
  }
  return line
}

/** The place where a road reaches `radius` SVG units from the centre; the road's end when it is shorter */
function pointAtRadius(points: readonly Point[], centre: Point, radius: number): Point {
  const last = points[points.length - 1] ?? centre
  let previous: Point = centre
  for (const point of points) {
    const distance = Math.hypot(point[0] - centre[0], point[1] - centre[1])
    if (distance >= radius) {
      const before = Math.hypot(previous[0] - centre[0], previous[1] - centre[1])
      const t = distance === before ? 0 : (radius - before) / (distance - before)
      return [
        previous[0] + (point[0] - previous[0]) * t,
        previous[1] + (point[1] - previous[1]) * t,
      ]
    }
    previous = point
  }
  return last
}

/** The direction from the junction to where a road is `radius` SVG units away, in degrees clockwise from north */
function headingOf(points: readonly Point[], centre: Point, radius: number): number {
  const [x, y] = pointAtRadius(points, centre, radius)
  // y grows downwards in the box, so north is -y
  const degrees = (Math.atan2(x - centre[0], centre[1] - y) * 180) / Math.PI
  return (degrees + 360) % 360
}

/** The length of a line in metres, along its points */
function lengthOf(line: readonly LonLat[]): number {
  let total = 0
  for (let index = 1; index < line.length; index += 1) {
    total += metres(line[index - 1]!, line[index]!)
  }
  return total
}

/**
 * A road's drawn points, with the last one pushed out along its direction to `minLength` SVG units when the road ends
 * nearer. The road's real end is `dataEnd`; the points after it are the stub. A road with no direction (its end is
 * the junction itself) is not extended.
 */
export function extendArm(
  drawn: readonly Point[],
  centre: Point,
  minLength: number,
): { points: Point[]; dataEnd: number } {
  const last = drawn[drawn.length - 1]
  if (!last) return { points: [], dataEnd: 0 }
  const dataEnd = drawn.length - 1
  const dx = last[0] - centre[0]
  const dy = last[1] - centre[1]
  const length = Math.hypot(dx, dy)
  if (length === 0 || length >= minLength) return { points: [...drawn], dataEnd }
  const k = minLength / length
  return { points: [...drawn, [centre[0] + dx * k, centre[1] + dy * k]], dataEnd }
}

/**
 * The roads of an intersection, fitted into the box. `radius` (metres) is how far from the junction the roads are
 * drawn: the restriction field's distance. The junction is the middle of the box, and the drawing is scaled so that the
 * farthest road on each side reaches the padding (no lopsided empty half). `bearing` turns the drawing the way the map
 * is turned (degrees, MapLibre's bearing), so the sketch matches what the person sees; 0 is north up. Undefined when
 * there is no junction to edit, by iD's test for showing its field: the intersection has the chosen vertex and more
 * than two ways (a vertex of two paths, or of roads and footways only, has not).
 */
export function junctionSketch(
  intersection: Intersection,
  vertexID: EntityID,
  radius: number,
  box: MiniMapBox,
  bearing: number = 0,
): JunctionSketch | undefined {
  const vertex = intersection.graph.hasEntity(vertexID)
  if (!(vertex instanceof OsmNode)) return undefined
  const junction = vertex.loc
  if (!junction) return undefined
  if (intersection.ways.length < 3) return undefined
  if (!intersection.vertices.some((candidate) => candidate.id === vertexID)) return undefined

  const lines = intersection.ways.map((way) => ({
    id: way.id,
    name: way.tags.name || way.tags.ref || undefined,
    canBeFrom: Boolean(way.props.__from || way.props.__via),
    highway: way.tags.highway,
    line: roadFromJunction(intersection.graph, way, junction, radius),
  }))
  const frame = fitMiniMap(
    lines.map((road) => road.line),
    box,
    2 * MIN_HALF_SPAN,
    bearing,
    junction,
  )
  if (!frame) return undefined

  const centre = frame.project(junction)
  return {
    width: box.width,
    height: box.height,
    centre,
    roads: lines.map((road) => {
      const { points, dataEnd } = extendArm(
        road.line.map((loc) => frame.project(loc)),
        centre,
        MIN_ARM_LENGTH,
      )
      return {
        id: road.id,
        name: road.name,
        points,
        dataEnd,
        canBeFrom: road.canBeFrom,
        heading: headingOf(points, centre, HEADING_RADIUS),
        highway: road.highway,
        length: lengthOf(road.line),
      }
    }),
  }
}

/**
 * The point `offset` SVG units to one side of a point on a road, for the buttons that share one TO road: the first
 * one stays on the road, then one to each side in turn.
 */
function beside(point: Point, centre: Point, nth: number): Point {
  if (nth === 0) return point
  const dx = point[0] - centre[0]
  const dy = point[1] - centre[1]
  const length = Math.hypot(dx, dy)
  if (length === 0) return point
  const side = nth % 2 === 1 ? 1 : -1
  const offset = Math.ceil(nth / 2) * BUTTON_SPACING * side
  // the road's normal: the radial direction turned by a quarter turn
  return [point[0] - (dy / length) * offset, point[1] + (dx / length) * offset]
}

/**
 * The first spot on a TO road's button position that no placed button covers: the road's own point, then one beside it
 * on each side in turn. Two roads that run in one line (a via road and the road beyond it) share their points, so the
 * second button goes beside the first.
 */
function freeSpot(onRoad: Point, centre: Point, placed: readonly Point[]): Point {
  let at = onRoad
  for (let nth = 0; nth < 16; nth += 1) {
    at = beside(onRoad, centre, nth)
    if (!placed.some((p) => Math.hypot(p[0] - at[0], p[1] - at[1]) < BUTTON_SPACING / 2)) break
  }
  return at
}

/**
 * The turns from one FROM road, as arrows on the sketch, each ending at its button. A button sits on its TO road
 * TURN_BUTTON_RADIUS out from the junction (where that spot is taken, beside it). A turn through via ways
 * bends at the first via road; a U-turn loops out on its own road and back to a button on it.
 */
export function junctionTurns(
  sketch: JunctionSketch,
  intersection: Intersection,
  fromWayID: EntityID,
  maxViaWays: number,
): JunctionTurn[] {
  const roadOf = (id: EntityID) => sketch.roads.find((road) => road.id === id)
  const graph = intersection.graph
  const { centre } = sketch
  const turns: JunctionTurn[] = []
  // an indirect restriction is cut down to the path from its own FROM way, so two walks can end in the same turn:
  // one arrow for one key (iD joins its arrows by the key too)
  const seen = new Set<string>()
  // the buttons placed so far: a button takes the first free spot on its TO road
  const placed: Point[] = []

  for (const turn of intersection.turns(fromWayID, maxViaWays)) {
    if (seen.has(turn.key)) continue
    seen.add(turn.key)
    const fromRoad = roadOf(turn.from.way)
    const toRoad = roadOf(turn.to.way)
    if (!fromRoad || !toRoad) continue

    const at = freeSpot(pointAtRadius(toRoad.points, centre, TURN_BUTTON_RADIUS), centre, placed)
    placed.push(at)
    const start = pointAtRadius(fromRoad.points, centre, START_RADIUS)
    let control: Point = centre
    if (turn.from.way === turn.to.way) {
      // U-turn: out along the road and back on it, bulging to one side
      const dx = start[0] - centre[0]
      const dy = start[1] - centre[1]
      const length = Math.hypot(dx, dy) || 1
      const out = TURN_BUTTON_RADIUS * 0.7
      control = [
        centre[0] + (dx / length) * out - (dy / length) * U_TURN_BULGE,
        centre[1] + (dy / length) * out + (dx / length) * U_TURN_BULGE,
      ]
    } else if (turn.via.ways && turn.via.ways.length > 0) {
      const viaRoad = roadOf(turn.via.ways[0] ?? '')
      if (viaRoad) control = pointAtRadius(viaRoad.points, centre, VIA_RADIUS)
    }

    const restrictionType = osmInferRestriction(graph, turn)
    turns.push({
      key: turn.key,
      turn,
      from: turn.from.way,
      to: turn.to.way,
      state: turnStateOf(turn),
      kind: turnKindOf(restrictionType),
      indirect: turn.direct === false,
      path: `M ${start[0]} ${start[1]} Q ${control[0]} ${control[1]} ${at[0]} ${at[1]}`,
      at,
    })
  }
  return turns
}

/**
 * The ways to highlight on the map for the section's state: the FROM road, and while a turn is hovered or focused its
 * TO road and its via ways (the same halo as a related feature). Each way once.
 */
export function relatedWayIDs(
  fromID: EntityID | null,
  hovered: JunctionTurn | undefined,
): EntityID[] {
  const ids = new Set<EntityID>()
  if (fromID) ids.add(fromID)
  if (hovered) {
    ids.add(hovered.to)
    for (const via of hovered.turn.via.ways ?? []) ids.add(via)
  }
  return [...ids]
}
