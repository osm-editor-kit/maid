/**
 * The junction as a sketch: the roads around a vertex in a small box, and an arrow for every turn of the chosen
 * FROM road. Headless: plain numbers in SVG units, no React. iD draws the same thing with its own map code; here the
 * sketch is north up and fitted to the box (iD's view is fitted to the vertices too, and not rotated).
 */
import {
  OsmNode,
  osmInferRestriction,
  type Graph,
  type Intersection,
  type OsmWay,
  type Turn,
} from '@osm-editor-kit/maid-model'
import { fitMiniMap, type LonLat, type MiniMapBox } from '@osm-editor-kit/maid-ui'
import { turnKindOf, turnStateOf, type TurnKind, type TurnState } from './turns.ts'

export type Point = [number, number]

/** SVG units from the junction at which a road's heading is taken: beyond the first small bend */
const HEADING_RADIUS = 30

export type JunctionRoad = {
  id: EntityID
  /** The road's name, else its ref; undefined when it has neither */
  name: string | undefined
  /** The road in the box, from the junction outwards */
  points: Point[]
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
  /** The junction (the vertex) in the box */
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
  /** The arrow as an SVG path */
  path: string
  /** The middle of the arrow: where its button sits */
  at: Point
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
 * The roads of an intersection, fitted into the box. `radius` (metres) is how far from the junction the roads are
 * drawn: the restriction field's distance. `bearing` turns the drawing the way the map is turned (degrees, MapLibre's
 * bearing), so the sketch matches what the person sees; 0 is north up. Undefined when there is no junction to edit, by
 * iD's test for showing its field: the intersection has the chosen vertex and more than two ways (a vertex of two
 * paths, or of roads and footways only, has not).
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
    undefined,
    bearing,
  )
  if (!frame) return undefined

  const centre = frame.project(junction)
  return {
    width: box.width,
    height: box.height,
    centre,
    roads: lines.map((road) => {
      const points = road.line.map((loc) => frame.project(loc))
      return {
        id: road.id,
        name: road.name,
        points,
        canBeFrom: road.canBeFrom,
        heading: headingOf(points, centre, HEADING_RADIUS),
        highway: road.highway,
        length: lengthOf(road.line),
      }
    }),
  }
}

/**
 * The turns from one FROM road, as arrows on the sketch. A turn through via ways bends at the first via road; a U-turn
 * loops on its own road. `arrowRadius` (SVG units) is where the arrows meet the roads.
 */
export function junctionTurns(
  sketch: JunctionSketch,
  intersection: Intersection,
  fromWayID: EntityID,
  maxViaWays: number,
  arrowRadius: number,
): JunctionTurn[] {
  const roadOf = (id: EntityID) => sketch.roads.find((road) => road.id === id)
  const graph = intersection.graph
  const { centre } = sketch
  const turns: JunctionTurn[] = []
  // an indirect restriction is cut down to the path from its own FROM way, so two walks can end in the same turn:
  // one arrow for one key (iD joins its arrows by the key too)
  const seen = new Set<string>()

  for (const turn of intersection.turns(fromWayID, maxViaWays)) {
    if (seen.has(turn.key)) continue
    seen.add(turn.key)
    const fromRoad = roadOf(turn.from.way)
    const toRoad = roadOf(turn.to.way)
    if (!fromRoad || !toRoad) continue

    const start = pointAtRadius(fromRoad.points, centre, arrowRadius)
    const end = pointAtRadius(toRoad.points, centre, arrowRadius)
    let control: Point = centre
    let stop = end
    if (turn.from.way === turn.to.way) {
      // U-turn: out along the road and back on the same road, bending away from it
      stop = pointAtRadius(fromRoad.points, centre, arrowRadius * 0.45)
      const dx = start[0] - centre[0]
      const dy = start[1] - centre[1]
      const length = Math.hypot(dx, dy) || 1
      control = [
        start[0] - (dy / length) * arrowRadius * 0.7,
        start[1] + (dx / length) * arrowRadius * 0.7,
      ]
    } else if (turn.via.ways && turn.via.ways.length > 0) {
      const viaRoad = roadOf(turn.via.ways[0] ?? '')
      if (viaRoad) control = pointAtRadius(viaRoad.points, centre, arrowRadius)
    }

    const mid: Point = [
      (start[0] + 2 * control[0] + stop[0]) / 4,
      (start[1] + 2 * control[1] + stop[1]) / 4,
    ]
    const restrictionType = osmInferRestriction(graph, turn)
    turns.push({
      key: turn.key,
      turn,
      from: turn.from.way,
      to: turn.to.way,
      state: turnStateOf(turn),
      kind: turnKindOf(restrictionType),
      indirect: turn.direct === false,
      path: `M ${start[0]} ${start[1]} Q ${control[0]} ${control[1]} ${stop[0]} ${stop[1]}`,
      at: mid,
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
