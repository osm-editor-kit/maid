/**
 * Turns OSM entities into GeoJSON features that carry their resolved iD style as plain
 * properties. Classification runs once per entity in JavaScript, so MapLibre's style
 * expressions stay trivial (`['get', 'sc']`) and forks can change the look in one place.
 */
import type { FilterSet, FilterState, Geometry } from '@osm-editor-kit/maid-filters'
import type { OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { LonLat, Presets } from '@osm-editor-kit/maid-presets'
import {
  hasInterestingTags,
  isArea,
  lensColour,
  lensFill,
  lensStyle,
  scaleAlpha,
  resolveWayStyle,
  tagClasses,
  wayLayer,
  type Lens,
  type LensGeometry,
  type LensStyle,
  type Tags,
} from '@osm-editor-kit/maid-style'
import type { Feature, LineString, MultiPolygon, Point, Polygon, Position } from 'geojson'
import { addressLabel, isAddressTags } from './address'
import type { MergeResult, OsmData } from './data'
import { arrowColour, onewayOf, sidedOf, type OneWay } from './direction'
import { mapLabelOf } from './label'

export type SourceName = 'areas' | 'lines' | 'points' | 'vertices'
export type FeatureBatch = Record<SourceName, Feature[]>

/** Short property names keep the payload to MapLibre's worker small. See layers.ts for their use. */
export type LineProps = {
  id: string
  /** stacking band: -1 below ground, 0, 1 above */
  b: -1 | 0 | 1
  /** sort key inside a band */
  z: number
  /** stroke colour, width, width at low zoom, dash key */
  sc?: string
  sw: number
  swl: number
  sd?: string
  /** casing colour, width, width at low zoom, dash key */
  cc?: string
  cw: number
  cwl: number
  cd?: string
  /** shadow (hover and selection halo) width */
  hw: number
  hwl: number
  /** the label text (label.ts: the name, else the ref or network and ref), only when there is one */
  name?: string
  /** direction arrows (direction.ts): 1 along the way, -1 against it, 2 both ways */
  oneway?: OneWay
  /** arrow colour, only when it is not the default (iD: white on dark lines, grey on rail) */
  ac?: string
  /** side marker kind (a key of SIDE_KINDS), only on sided lines */
  side?: string
}

export type AreaProps = {
  id: string
  sc?: string
  sw: number
  sd?: string
  /** fill colour with iD's alpha, for full fill */
  fc?: string
  /** the same colour without alpha, for the partial-fill band (the layer sets the opacity) */
  fo?: string
  /** width of the partial-fill band in px at full size, before clamping to the area's size */
  fw: number
  /** side marker kind of a closed barrier or coastline ring (layers: area-sided), only then */
  side?: string
  /** rough inner radius of the area in metres: 2 * area / perimeter */
  r: number
  hw: number
  /** the label text (label.ts), only when there is one */
  name?: string
}

/** `addr`: the text of an address node (iD draws it on a plaque, not as a pin; '' for an address without number or name) */
export type PointProps = { id: string; icon?: string; name?: string; addr?: string }
export type VertexProps = { id: string; t: 0 | 1; s: 0 | 1; icon?: string }

const HIGHWAY_STACK: Record<string, number> = {
  motorway: 0, motorway_link: 1, trunk: 2, trunk_link: 3, primary: 4, primary_link: 5,
  secondary: 6, tertiary: 7, unclassified: 8, residential: 9, service: 10, busway: 11, footway: 12,
} // prettier-ignore

/** Dash patterns are registered here so the layer expressions can list them. */
export const dashPatterns = new Map<string, number[]>()
function dashKey(dash: number[] | undefined, width: number) {
  if (!dash || width <= 0) return undefined
  // CSS dashes are in px, MapLibre's are in multiples of the line width
  const scaled = dash.map((d) => Math.round((d / width) * 100) / 100)
  const key = scaled.join(' ')
  if (!dashPatterns.has(key)) dashPatterns.set(key, scaled)
  return key
}

const DEG = Math.PI / 180
/** Signed area in m² (positive = counter-clockwise) and perimeter in m, on a local flat projection */
function ringMetrics(ring: Position[]) {
  const kx = 111320 * Math.cos(ring[0]![1]! * DEG)
  const ky = 110540
  let area = 0
  let perimeter = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i]![0]! * kx
    const y1 = ring[i]![1]! * ky
    const x2 = ring[i + 1]![0]! * kx
    const y2 = ring[i + 1]![1]! * ky
    area += x1 * y2 - x2 * y1
    perimeter += Math.hypot(x2 - x1, y2 - y1)
  }
  return { area: area / 2, perimeter }
}

/** A node's position as a GeoJSON coordinate. A new array, so features never share the entity's. */
export function coordinateOf(node: OsmNode | undefined) {
  const loc = node?.loc
  return loc ? [loc[0], loc[1]] : undefined
}

function wayCoords(data: OsmData, way: OsmWay) {
  const coords: Position[] = []
  for (const id of way.nodes) {
    const coord = coordinateOf(data.node(id))
    if (coord) coords.push(coord)
  }
  return coords
}

/**
 * A lens restyles a feature by rewriting the properties the layers already read (sc, sw, swl, sd,
 * fc, fo). Only what the lens sets is written, and layers.ts does not change, so without a lens
 * nothing here runs.
 */
function restyleLine(feature: Feature<LineString, LineProps>, style: LensStyle | undefined) {
  if (!style) return feature
  const p = feature.properties
  if (style.width !== undefined) {
    p.sw = style.width
    p.swl = style.width
  }
  const sc = lensColour(style, p.sc)
  if (sc !== undefined) p.sc = sc
  // the casing keeps its own colour under a rule colour, but fades with a dimmed line
  if (style.color === undefined) {
    const cc = lensColour(style, p.cc)
    if (cc !== undefined) p.cc = cc
    // direction arrows fade too; their colour is `ac`, and layers.ts uses #333 when it is not set
    if (p.oneway !== undefined && style.opacity !== undefined) {
      p.ac = scaleAlpha(p.ac ?? '#333', style.opacity)
    }
  }
  if (style.dash !== undefined) {
    const sd = dashKey(style.dash, p.sw)
    if (sd) p.sd = sd
    else delete p.sd
  }
  return feature
}

function restyleArea(
  feature: Feature<Polygon | MultiPolygon, AreaProps>,
  style: LensStyle | undefined,
) {
  if (!style) return feature
  const p = feature.properties
  if (style.width !== undefined) p.sw = style.width
  const sc = lensColour(style, p.sc)
  if (sc !== undefined) p.sc = sc
  if (style.dash !== undefined) {
    const sd = dashKey(style.dash, p.sw)
    if (sd) p.sd = sd
    else delete p.sd
  }
  const fc = lensFill(style, p.fc)
  if (fc !== undefined) p.fc = fc
  const fo = lensColour(style, p.fo)
  if (fo !== undefined) p.fo = fo
  return feature
}

function lineFeature(
  id: string,
  coords: Position[],
  tags: Tags,
  classes: string[],
): Feature<LineString, LineProps> {
  const style = resolveWayStyle(classes, 'line')
  const layer = wayLayer(tags)
  const props: LineProps = {
    id,
    b: layer < 0 ? -1 : layer > 0 ? 1 : 0,
    // iD draws lower `layer` values first and, within one, minor roads first
    z: layer * 20 + (tags.highway ? 13 - (HIGHWAY_STACK[tags.highway] ?? 13) : 0),
    sw: style.stroke.width,
    swl: style.stroke.widthLow,
    cw: style.casing.width,
    cwl: style.casing.widthLow,
    hw: style.shadow.width,
    hwl: style.shadow.widthLow,
  }
  if (style.stroke.color) props.sc = style.stroke.color
  if (style.casing.color) props.cc = style.casing.color
  const sd = dashKey(style.stroke.dash, style.stroke.width)
  if (sd) props.sd = sd
  const cd = dashKey(style.casing.dash, style.casing.width)
  if (cd) props.cd = cd
  const label = mapLabelOf(tags)
  if (label) props.name = label
  const oneway = onewayOf(tags)
  if (oneway) {
    props.oneway = oneway
    const ac = arrowColour(tags)
    if (ac) props.ac = ac
  }
  const side = sidedOf(tags)
  if (side) props.side = side
  return {
    type: 'Feature',
    id,
    properties: props,
    geometry: { type: 'LineString', coordinates: coords },
  }
}

/** MapLibre offsets lines to the left of their direction; counter-clockwise rings put the inside on the left. */
function orient(ring: Position[], counterClockwise: boolean) {
  const { area } = ringMetrics(ring)
  return area > 0 === counterClockwise ? ring : ring.slice().reverse()
}

function areaFeature(
  id: string,
  polygons: Position[][][],
  tags: Tags,
  classes: string[],
): Feature<Polygon | MultiPolygon, AreaProps> {
  // closed ways with a barrier are outlined like the barrier line (iD: overrideGeometry)
  const outline = tags.barrier && tags.barrier !== 'no' ? 'line' : 'area'
  const style = resolveWayStyle(classes, 'area')
  const stroke = outline === 'line' ? resolveWayStyle(classes, 'line').stroke : style.stroke
  // iD draws side markers on a closed barrier (it is a line there) and on a coastline ring. Those
  // markers follow the way's own direction, so such a ring keeps its node order.
  const side = sidedOf(tags)
  const sided = side !== undefined && (outline === 'line' || side === 'coastline')
  let area = 0
  let perimeter = 0
  const oriented = polygons.map((rings) =>
    rings.map((ring, i) => {
      const m = ringMetrics(ring)
      area += i === 0 ? Math.abs(m.area) : -Math.abs(m.area)
      perimeter += m.perimeter
      return sided ? ring : orient(ring, i === 0)
    }),
  )
  const props: AreaProps = {
    id,
    sw: stroke.width,
    // iD strokes the clipped fill path 60px wide (css/70_fills.css), which shows as a band half as wide
    fw: classes.includes('building_part')
      ? 20
      : classes.includes('indoor')
        ? 10
        : classes.includes('amenity-parking_space')
          ? 15
          : 30,
    r: perimeter > 0 ? Math.round(((2 * area) / perimeter) * 100) / 100 : 0,
    hw: style.shadow.width,
  }
  if (stroke.color) props.sc = stroke.color
  const sd = dashKey(stroke.dash, stroke.width)
  if (sd) props.sd = sd
  if (style.fill) {
    props.fc = style.fill
    props.fo = style.fill.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)')
  }
  const label = mapLabelOf(tags)
  if (label) props.name = label
  if (sided) props.side = side
  const geometry: Polygon | MultiPolygon =
    oriented.length === 1
      ? { type: 'Polygon', coordinates: oriented[0]! }
      : { type: 'MultiPolygon', coordinates: oriented }
  return { type: 'Feature', id, properties: props, geometry }
}

/** Joins member ways into closed rings. Returns undefined if a member is missing or rings do not close. */
function assembleRings(data: OsmData, wayIds: string[]) {
  const segments: Position[][] = []
  for (const id of wayIds) {
    const way = data.way(id)
    if (!way) return undefined
    const coords = wayCoords(data, way)
    if (coords.length < 2) return undefined
    segments.push(coords)
  }
  const same = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1]
  const rings: Position[][] = []
  while (segments.length > 0) {
    let ring = segments.pop()!
    while (!same(ring[0]!, ring[ring.length - 1]!)) {
      const end = ring[ring.length - 1]!
      const i = segments.findIndex((s) => same(s[0]!, end) || same(s[s.length - 1]!, end))
      if (i < 0) return undefined
      const next = segments.splice(i, 1)[0]!
      ring = ring.concat((same(next[0]!, end) ? next : next.slice().reverse()).slice(1))
    }
    if (ring.length >= 4) rings.push(ring)
  }
  return rings
}

function pointInRing(point: Position, ring: Position[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!
    const yi = ring[i]![1]!
    const xj = ring[j]![0]!
    const yj = ring[j]![1]!
    if (
      yi > point[1]! !== yj > point[1]! &&
      point[0]! < ((xj - xi) * (point[1]! - yi)) / (yj - yi) + xi
    )
      inside = !inside
  }
  return inside
}

function multipolygon(data: OsmData, relation: OsmRelation) {
  const outerIds = relation.members
    .filter((m) => m.type === 'way' && m.role !== 'inner')
    .map((m) => m.id)
  const innerIds = relation.members
    .filter((m) => m.type === 'way' && m.role === 'inner')
    .map((m) => m.id)
  const outers = assembleRings(data, outerIds)
  const inners = assembleRings(data, innerIds)
  if (!outers || !inners || outers.length === 0) return undefined
  const polygons = outers.map((outer) => [outer])
  for (const inner of inners) {
    const host = polygons.find((p) => pointInRing(inner[0]!, p[0]!))
    if (host) host.push(inner)
  }
  return polygons
}

/** iD hides boundaries by default (renderer/features.js, rule `boundaries`) */
function isHiddenBoundary(t: Tags) {
  return (
    !!t.boundary &&
    !(t.highway || t.waterway || t.railway || t.landuse || t.natural || t.building || t.power)
  )
}

export class FeatureBuilder {
  /** Features left out on purpose, by reason */
  hidden: Record<string, number> = {}

  /** Entities that have a feature, so later merges do not build them twice */
  private built = new Set<string>()
  /** Multipolygons whose members were not all loaded yet */
  private pendingRelations = new Set<string>()
  private vertexState = new Map<string, string>()

  /**
   * Which objects are editable, read-only or hidden. Hidden ones get no feature at all, so they
   * cannot be drawn, hit or snapped to. Without filters everything is editable.
   */
  filters?: FilterSet
  /** What the filters said about an entity that is not plainly editable */
  private states = new Map<string, FilterState>()

  /**
   * The lens the features are styled with (engine.setLens). Without one the builder does exactly
   * what it did before. A feature the lens hides gets the 'hidden' state, like a filter's, so its
   * junction vertices are left out too.
   */
  lens?: Lens

  private lensOf(tags: Tags, geometry: LensGeometry) {
    return this.lens ? lensStyle(this.lens, tags, geometry) : undefined
  }

  constructor(
    private data: OsmData,
    /** Without presets nothing has an icon; the engine sets them when they arrive (see `Engine.fillInPresets`) */
    public presets?: Presets,
  ) {}

  /** Forgets everything that was built, for building all features again (after a filter changed) */
  reset() {
    this.hidden = {}
    this.built.clear()
    this.pendingRelations.clear()
    this.vertexState.clear()
    this.states.clear()
  }

  /** True if the entity has a feature that may be looked at but not changed */
  isReadOnly(id: string) {
    return this.states.get(id) === 'readonly'
  }

  /**
   * Asks the filters about an entity and remembers the answer. Returns true if it is hidden;
   * `count` adds it to the hidden counter of its filter (once per entity).
   */
  private isFiltered(id: string, tags: Tags, geometry: Geometry, count: boolean) {
    const { filters } = this
    if (!filters) return false
    const filter = filters.filterOf(tags, geometry)
    // the filter of a set carries its current state
    const state = filter?.state ?? 'editable'
    if (state === 'editable') this.states.delete(id)
    else this.states.set(id, state)
    if (state !== 'hidden') return false
    if (count && filter) this.hidden[filter.id] = (this.hidden[filter.id] ?? 0) + 1
    return true
  }

  /**
   * A vertex goes with its ways: hidden when all of them are, read-only when one of them is.
   * Returns true if it is hidden.
   */
  private isVertexFiltered(id: string) {
    if (!this.filters) return false
    let visible = false
    let readOnly = false
    for (const wayId of this.data.nodeWays.get(id) ?? []) {
      const state = this.states.get(wayId)
      if (state !== 'hidden') visible = true
      if (state === 'readonly') readOnly = true
    }
    if (visible && readOnly) this.states.set(id, 'readonly')
    else this.states.delete(id)
    return !visible
  }

  /** The feature of one way, or undefined if it is not drawn on its own. Also used when a node moves. */
  buildWay(way: OsmWay): { source: 'areas' | 'lines'; feature: Feature } | undefined {
    const { data } = this
    const id = way.id
    const coords = wayCoords(data, way)
    if (coords.length < 2) return undefined
    const tags = way.tags
    const closed = way.nodes.length > 2 && way.nodes[0] === way.nodes[way.nodes.length - 1]
    const first = !this.built.has(id)
    this.built.add(id)
    if (isHiddenBoundary(tags)) {
      if (first) this.hidden.boundaries = (this.hidden.boundaries ?? 0) + 1
      return undefined
    }
    const area = isArea(way.tags, closed) && coords.length >= 4
    if (this.isFiltered(id, tags, area ? 'area' : 'line', first)) return undefined
    const lens = this.lensOf(tags, area ? 'area' : 'line')
    if (lens?.hidden) {
      this.states.set(id, 'hidden')
      return undefined
    }
    if (area) {
      const feature = areaFeature(id, [[coords]], tags, tagClasses(tags))
      return { source: 'areas', feature: restyleArea(feature, lens) }
    }
    // ways that only carry a multipolygon's outline are drawn by the relation's area
    if (!hasInterestingTags(way.tags) && data.wayMultipolygons.has(way.id)) return undefined
    const feature = lineFeature(id, coords, tags, tagClasses(tags))
    return { source: 'lines', feature: restyleLine(feature, lens) }
  }

  /**
   * The point feature of a standalone node, or undefined if it has no tags worth showing.
   * A node that was added here (negative id) is always drawn: it has no tags until its type is chosen.
   */
  buildPoint(node: OsmNode): Feature | undefined {
    if (!hasInterestingTags(node.tags) && !node.id.startsWith('n-')) return undefined
    // points have no colour in the layers, so a lens can only hide them
    if (this.lensOf(node.tags, 'point')?.hidden) return undefined
    const coordinates = coordinateOf(node)
    if (!coordinates) return undefined
    const id = node.id
    const first = !this.built.has(id)
    this.built.add(id)
    if (this.isFiltered(id, node.tags, 'point', first)) return undefined
    const props: PointProps = { id }
    if (isAddressTags(node.tags)) props.addr = addressLabel(node.tags)
    else {
      // a point's extent is the point itself, so its location is the one the presets are matched at
      const loc: LonLat = [coordinates[0]!, coordinates[1]!]
      const icon =
        this.presets?.match(node.tags, 'point', loc).icon ??
        this.presets?.match(node.tags, 'vertex', loc).icon
      if (icon) props.icon = icon
      const label = mapLabelOf(node.tags)
      if (label) props.name = label
    }
    return { type: 'Feature', id, properties: props, geometry: { type: 'Point', coordinates } }
  }

  /** Re-reads a vertex's tags (tagged or not) and returns its feature, if it has one */
  refreshVertex(node: OsmNode) {
    const shared = (this.data.nodeUses.get(node.id) ?? 0) > 1
    const tagged = hasInterestingTags(node.tags)
    if (
      (!tagged && !shared && !this.data.endpoints.has(node.id)) ||
      this.isVertexFiltered(node.id)
    ) {
      this.vertexState.delete(node.id)
      return undefined
    }
    this.vertexState.set(node.id, `${tagged ? 1 : 0}${shared ? 1 : 0}`)
    return this.buildVertex(node)
  }

  /** The vertex feature of a node, if it has one */
  buildVertex(node: OsmNode): Feature | undefined {
    const state = this.vertexState.get(node.id)
    if (!state) return undefined
    const coordinates = coordinateOf(node)
    if (!coordinates) return undefined
    const props: VertexProps = {
      id: node.id,
      t: state[0] === '1' ? 1 : 0,
      s: state[1] === '1' ? 1 : 0,
    }
    const icon = props.t
      ? this.presets?.match(node.tags, 'vertex', [coordinates[0]!, coordinates[1]!]).icon
      : undefined
    if (icon) props.icon = icon
    return {
      type: 'Feature',
      id: props.id,
      properties: props,
      geometry: { type: 'Point', coordinates },
    }
  }

  /** Features for everything a merge added. Call once per merge, in order. */
  build(added: MergeResult) {
    const { data } = this
    const out: FeatureBatch = { areas: [], lines: [], points: [], vertices: [] }

    for (const relation of added.relations) {
      if (relation.tags.type === 'multipolygon') this.pendingRelations.add(relation.id)
    }
    for (const id of this.pendingRelations) {
      const relation = data.relation(id)
      if (!relation) continue
      const polygons = multipolygon(data, relation)
      if (!polygons) continue
      this.pendingRelations.delete(id)
      // old-style multipolygons carry their tags on the outer way
      let tags = relation.tags
      if (Object.keys(tags).every((k) => k === 'type')) {
        const outer = relation.members.find((m) => m.type === 'way' && m.role !== 'inner')
        const outerWay = outer && data.way(outer.id)
        tags = { ...outerWay?.tags }
      }
      const first = !this.built.has(id)
      this.built.add(id)
      if (this.isFiltered(id, tags, 'area', first)) continue
      const lens = this.lensOf(tags, 'area')
      if (lens?.hidden) {
        this.states.set(id, 'hidden')
        continue
      }
      const feature = areaFeature(id, polygons, tags, tagClasses(tags))
      out.areas.push(restyleArea(feature, lens))
    }

    for (const way of added.ways) {
      if (this.built.has(way.id)) continue
      const built = this.buildWay(way)
      if (built) out[built.source].push(built.feature)
    }

    // Vertices and points. A node's role can change when a later tile brings another way.
    const touched = new Set<OsmNode>(added.nodes)
    for (const way of added.ways) {
      for (const nodeId of way.nodes) {
        const node = data.node(nodeId)
        if (node) touched.add(node)
      }
    }
    for (const node of touched) {
      const uses = data.nodeUses.get(node.id) ?? 0
      const tagged = hasInterestingTags(node.tags)
      const id = node.id
      if (uses === 0) {
        if (!tagged || this.built.has(id)) continue
        const point = this.buildPoint(node)
        if (point) out.points.push(point)
        continue
      }
      // iD only draws vertices that matter while nothing is selected: tagged, junctions, way ends
      const shared = uses > 1
      if (!tagged && !shared && !data.endpoints.has(node.id)) continue
      if (this.isVertexFiltered(id)) continue
      const state = `${tagged ? 1 : 0}${shared ? 1 : 0}`
      if (this.vertexState.get(node.id) === state) continue
      const coordinates = coordinateOf(node)
      if (!coordinates) continue
      this.vertexState.set(node.id, state)
      const props: VertexProps = { id, t: tagged ? 1 : 0, s: shared ? 1 : 0 }
      const icon = tagged
        ? this.presets?.match(node.tags, 'vertex', [coordinates[0]!, coordinates[1]!]).icon
        : undefined
      if (icon) props.icon = icon
      out.vertices.push({
        type: 'Feature',
        id,
        properties: props,
        geometry: { type: 'Point', coordinates },
      })
    }
    return out
  }
}

/** All nodes of a way as vertex features, for showing a selected way's shape points */
export function wayVertices(data: OsmData, wayId: string) {
  const way = data.way(wayId)
  if (!way) return []
  const out: Feature<Point>[] = []
  for (const nodeId of new Set(way.nodes)) {
    const coordinates = coordinateOf(data.node(nodeId))
    if (coordinates)
      out.push({
        type: 'Feature',
        properties: { id: nodeId },
        geometry: { type: 'Point', coordinates },
      })
  }
  return out
}
