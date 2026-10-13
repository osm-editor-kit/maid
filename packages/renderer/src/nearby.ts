// The features near one feature, for the address field's suggestions: iD's getNear*, getEnclosing* and
// isInNearbyBuilding (address.js). The decisions and the geometry are pure (no model, no MapLibre); the last
// part reads a graph: the boxes of its entities, and the shapes of the few that lie near one feature.
//
// Not as iD: iD asks the history's spatial index (`context.history().intersects`). The editor's history has none
// (core/src/editor.ts), so the boxes are read from the graph once per graph version and kept (engine.nearby).
// Holes of a multipolygon are not cut out, and only the closed outer ways of a multipolygon are outlines.
import {
  OsmNode,
  OsmRelation,
  OsmWay,
  type Graph,
  type OsmEntity,
} from '@osm-editor-kit/maid-model'
import { isArea, type Tags } from '@osm-editor-kit/maid-style'
import { distanceMetres } from './measure'

/** A point as [lon, lat]. Mutable, as the renderer's distance takes it; presets take it readonly, which it is. */
type LonLat = [number, number]

/** Metres per degree of latitude, roughly: enough to pad a box by a distance, not to measure with */
const METRES_PER_DEGREE = 111_320

/** [minLon, minLat, maxLon, maxLat] */
export type Box = [number, number, number, number]

export type NearbyType = 'node' | 'way' | 'relation'

/** One feature near the edited one, as the address field's lists need it (address-logic.ts AddressCandidate) */
export type Nearby = {
  type: NearbyType
  tags: Tags
  /** The centre of the edited feature to the candidate's centre, or to its nearest point when it is a line */
  distanceMetres: number
  /** An area whose outline holds all four corners of the edited feature's extent */
  encloses: boolean
  /** A point inside a building that encloses the edited feature */
  inEnclosingBuilding: boolean
}

/**
 * A feature as the lookup sees it. A point is measured at its location, an area at the centre of its box
 * (its outlines decide `encloses`), a line to its nearest point.
 */
export type NearbyShape = {
  id: string
  type: NearbyType
  tags: Tags
  kind: 'point' | 'line' | 'area'
  box: Box
  centre: LonLat
  /** A line: its points in order */
  points: LonLat[]
  /** An area: its outlines, closed rings */
  outlines: LonLat[][]
}

/** The box around a set of points, or undefined for none */
export function boxOf(points: readonly LonLat[]): Box | undefined {
  const first = points[0]
  if (!first) return undefined
  let [minLon, minLat, maxLon, maxLat] = [first[0], first[1], first[0], first[1]]
  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return [minLon, minLat, maxLon, maxLat]
}

/** The centre of a box: iD's extent.center() */
export function centreOfBox(box: Box): LonLat {
  return [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]
}

/** A box grown by `metres` on every side (on the ground: the longitude grows with the latitude) */
export function padBox(box: Box, metres: number): Box {
  const dLat = metres / METRES_PER_DEGREE
  const midLat = (box[1] + box[3]) / 2
  const dLon = metres / (METRES_PER_DEGREE * Math.max(Math.cos((midLat * Math.PI) / 180), 0.01))
  return [box[0] - dLon, box[1] - dLat, box[2] + dLon, box[3] + dLat]
}

export function overlaps(a: Box, b: Box) {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
}

/** Crossing count on a closed ring: true when the point is inside */
function insideRing(point: LonLat, ring: readonly LonLat[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside
  }
  return inside
}

/** True when the point is inside one of the outlines (holes are not cut out) */
export function insideOutlines(point: LonLat, outlines: readonly LonLat[][]) {
  return outlines.some((ring) => ring.length > 2 && insideRing(point, ring))
}

/** The distance in metres from a point to the nearest point of a line, measured on a flat map around the point */
function distanceToLine(point: LonLat, points: readonly LonLat[]) {
  const cos = Math.cos((point[1] * Math.PI) / 180)
  const kx = METRES_PER_DEGREE * cos
  const ky = METRES_PER_DEGREE
  let best = Number.POSITIVE_INFINITY
  // the point is the origin; each segment is taken in metres from it
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const ax = (a[0] - point[0]) * kx
    const ay = (a[1] - point[1]) * ky
    const bx = (b[0] - point[0]) * kx
    const by = (b[1] - point[1]) * ky
    const dx = bx - ax
    const dy = by - ay
    const lengthSquared = dx * dx + dy * dy
    const t =
      lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared))
    best = Math.min(best, Math.hypot(ax + dx * t, ay + dy * t))
  }
  if (points.length === 1) {
    const a = points[0]!
    best = Math.hypot((a[0] - point[0]) * kx, (a[1] - point[1]) * ky)
  }
  return best
}

function isBuilding(tags: Tags) {
  return tags.building !== undefined && tags.building !== 'no'
}

/**
 * The features near `selected`: the candidates within `metres` of its centre (a line by its nearest point), and every
 * area that encloses it, however far its centre is. A point is inside an enclosing building when it lies in an area
 * that is a building and encloses `selected`. `candidates` must not contain `selected` or its nodes.
 */
export function nearbyFeatures(
  selected: NearbyShape,
  candidates: readonly NearbyShape[],
  metres = 200,
): Nearby[] {
  const [minLon, minLat, maxLon, maxLat] = selected.box
  const corners: LonLat[] = [
    [minLon, minLat],
    [maxLon, minLat],
    [maxLon, maxLat],
    [minLon, maxLat],
  ]
  const encloses = (shape: NearbyShape) =>
    shape.kind === 'area' && corners.every((corner) => insideOutlines(corner, shape.outlines))
  const enclosing = candidates.filter((shape) => encloses(shape) && isBuilding(shape.tags))

  const found: Nearby[] = []
  for (const shape of candidates) {
    const isEnclosing = encloses(shape)
    const distance =
      shape.kind === 'line'
        ? distanceToLine(selected.centre, shape.points)
        : distanceMetres(selected.centre, shape.centre)
    if (distance > metres && !isEnclosing) continue
    found.push({
      type: shape.type,
      tags: shape.tags,
      distanceMetres: distance,
      encloses: isEnclosing,
      inEnclosingBuilding:
        shape.kind === 'point' &&
        enclosing.some((area) => insideOutlines(shape.centre, area.outlines)),
    })
  }
  return found
}

// ---------------------------------------------------------------- reading the graph

/** The points of the nodes with these ids that have a location, in order */
function locsOf(graph: Graph, ids: readonly string[]) {
  const points: LonLat[] = []
  for (const id of ids) {
    const node = graph.hasEntity(id)
    if (node instanceof OsmNode && node.loc) points.push([node.loc[0], node.loc[1]])
  }
  return points
}

/** The closed outer rings of a multipolygon, as the points of their ways */
function outlinesOf(graph: Graph, relation: OsmRelation) {
  const outlines: LonLat[][] = []
  for (const member of relation.members) {
    if (member.type !== 'way' || member.role === 'inner') continue
    const way = graph.hasEntity(member.id)
    if (!(way instanceof OsmWay) || !isClosed(way)) continue
    const points = locsOf(graph, way.nodes)
    if (points.length > 2) outlines.push(points)
  }
  return outlines
}

function isClosed(way: OsmWay) {
  return way.nodes.length > 2 && way.nodes[0] === way.nodes[way.nodes.length - 1]
}

/**
 * The box of an entity: a node's location, a way's nodes, a relation's members (nodes and ways). Undefined when
 * none of them has a location (a relation that is not a multipolygon is measured by its members).
 */
export function extentOfEntity(graph: Graph, entity: OsmEntity): Box | undefined {
  if (entity instanceof OsmNode) {
    const loc = entity.loc
    return loc ? [loc[0], loc[1], loc[0], loc[1]] : undefined
  }
  if (entity instanceof OsmWay) return boxOf(locsOf(graph, entity.nodes))
  if (entity instanceof OsmRelation) {
    const boxes: Box[] = []
    for (const member of entity.members) {
      const other = graph.hasEntity(member.id)
      const box = other && member.type !== 'relation' ? extentOfEntity(graph, other) : undefined
      if (box) boxes.push(box)
    }
    if (boxes.length === 0) return undefined
    return [
      Math.min(...boxes.map((b) => b[0])),
      Math.min(...boxes.map((b) => b[1])),
      Math.max(...boxes.map((b) => b[2])),
      Math.max(...boxes.map((b) => b[3])),
    ]
  }
  return undefined
}

/** The shape of an entity for the lookup, or undefined for one it does not look at (nodes without a location, other relations) */
export function shapeOf(graph: Graph, id: string, entity: OsmEntity): NearbyShape | undefined {
  if (entity instanceof OsmNode) {
    const loc = entity.loc
    if (!loc) return undefined
    const point: LonLat = [loc[0], loc[1]]
    return {
      id,
      type: 'node',
      tags: entity.tags,
      kind: 'point',
      box: [loc[0], loc[1], loc[0], loc[1]],
      centre: point,
      points: [],
      outlines: [],
    }
  }
  if (entity instanceof OsmWay) {
    const points = locsOf(graph, entity.nodes)
    const box = boxOf(points)
    if (!box) return undefined
    const common = { id, type: 'way' as const, tags: entity.tags, box, centre: centreOfBox(box) }
    if (isClosed(entity) && isArea(entity.tags, true))
      return { ...common, kind: 'area', points: [], outlines: [points] }
    return { ...common, kind: 'line', points, outlines: [] }
  }
  if (entity instanceof OsmRelation) {
    if (entity.tags.type !== 'multipolygon') return undefined
    const outlines = outlinesOf(graph, entity)
    const box = boxOf(outlines.flat())
    if (!box) return undefined
    return {
      id,
      type: 'relation',
      tags: entity.tags,
      kind: 'area',
      box,
      centre: centreOfBox(box),
      points: [],
      outlines,
    }
  }
  return undefined
}

/** The box of every entity of a graph, as the candidates are looked up. Built once per graph version. */
export type BoxEntry = { id: string; box: Box }

export function boxesOf(graph: Graph): BoxEntry[] {
  const entries: BoxEntry[] = []
  const relations: Array<[string, OsmRelation]> = []
  const visit = (id: string, entity: OsmEntity | undefined) => {
    if (!entity) return
    if (entity instanceof OsmRelation) {
      relations.push([id, entity])
      return
    }
    const box = extentOfEntity(graph, entity)
    if (box) entries.push({ id, box })
  }
  // an entity edited here is in the local cache, and then its base entry is not the current one
  for (const [id, entity] of graph.base.entities) {
    if (!graph.local.entities.has(id)) visit(id, entity)
  }
  for (const [id, entity] of graph.local.entities) visit(id, entity)
  // a relation's box is the union of its members' boxes, which are known now
  for (const [id, relation] of relations) {
    const box = extentOfEntity(graph, relation)
    if (box) entries.push({ id, box })
  }
  return entries
}
