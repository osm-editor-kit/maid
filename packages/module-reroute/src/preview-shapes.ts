/**
 * The preview of a reroute as GeoJSON, for one map source: the stretch as it is (`old`), the new path (`new`), the
 * split points, the points to check, and the two handles. Each feature has a `kind`; the layers of RerouteOnMap
 * filter on it. Pure.
 */
import { OsmRelation, type Graph } from '@osm-editor-kit/maid-model'
import { nodeLonlat, segmentLine, wayLine, type Lonlat } from './geometry.ts'
import type { RoutePreview } from './route.ts'

/**
 * `old`: the ways of the stretch as they are (drawn under the new path); `new`: the new path on a way that joins the
 * route; `same`: the new path on a way of the stretch (it stays)
 */
export type PreviewKind = 'old' | 'new' | 'same' | 'split' | 'review' | 'handle'

export type PreviewProperties = {
  kind: PreviewKind
  /**
   * On a handle: which point it is (`start`, `end`, `via-0`, …). On the new path: `line`, so a press on the line drags
   * a new via point out of it, as in a route planner.
   */
  handle?: string
  /** On a handle: whether the point is on a road or path (false: nothing is near, the point is where the pointer was) */
  snapped?: boolean
}

/** A GeoJSON feature, typed here so the module needs no `geojson` types of its own (the map takes it as GeoJSON) */
export type PreviewFeature = {
  type: 'Feature'
  properties: PreviewProperties
  geometry: { type: 'LineString'; coordinates: Lonlat[] } | { type: 'Point'; coordinates: Lonlat }
}

export type PreviewCollection = { type: 'FeatureCollection'; features: PreviewFeature[] }

function lineFeature(
  coordinates: readonly Lonlat[],
  properties: PreviewProperties,
): PreviewFeature {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'LineString', coordinates: [...coordinates] },
  }
}

function pointFeature(coordinates: Lonlat, properties: PreviewProperties): PreviewFeature {
  return { type: 'Feature', properties, geometry: { type: 'Point', coordinates } }
}

/** Every feature of the preview, in the order the layers draw them */
export function previewShapes(graph: Graph, preview: RoutePreview): PreviewCollection {
  const features: PreviewFeature[] = []
  // the whole stretch as it is, under the new path: what the new path does not cover is what leaves the route
  const { stretchIds } = changedWays(graph, preview)
  for (const id of stretchIds) {
    const coordinates = wayLine(graph, id)
    if (coordinates.length > 1) features.push(lineFeature(coordinates, { kind: 'old' }))
  }
  if (preview.route?.ok) {
    for (const segment of preview.route.segments) {
      const coordinates = segmentLine(graph, segment)
      const kind = stretchIds.has(segment.wayId) ? 'same' : 'new'
      if (coordinates.length > 1) features.push(lineFeature(coordinates, { kind, handle: 'line' }))
    }
    for (const split of preview.route.splits) {
      features.push(pointFeature(split.loc, { kind: 'split' }))
    }
  }
  // point members of the stretch that the new path leaves behind (plan.ts flags them)
  for (const point of preview.plan?.ok ? preview.plan.pointsToReview : []) {
    if (!point.far) continue
    const loc = nodeLonlat(graph, point.id)
    if (loc) features.push(pointFeature(loc, { kind: 'review' }))
  }
  const handles = [
    { name: 'start', via: preview.start },
    ...preview.vias.map((via, index) => ({ name: `via-${index}`, via })),
    { name: 'end', via: preview.end },
  ]
  for (const { name, via } of handles) {
    if (via)
      features.push(
        pointFeature(via.loc, { kind: 'handle', handle: name, snapped: via.snap !== undefined }),
      )
  }
  return { type: 'FeatureCollection', features }
}

/**
 * The ways the reroute changes: those of the stretch the new path leaves (`removed`), and those of the new path that
 * are not in the stretch (`added`), each once, in order. A way the plan splits counts as kept: a part of it stays.
 */
export function changedWays(graph: Graph, preview: RoutePreview) {
  const relation = graph.hasEntity(preview.relationId)
  const stretch = preview.stretch
  const stretchIds = new Set<EntityID>()
  if (stretch && relation instanceof OsmRelation) {
    for (let index = stretch.from; index <= stretch.to; index++) {
      const member = relation.members[index]
      if (member?.type === 'way') stretchIds.add(member.id)
    }
  }
  const routeIds = new Set<EntityID>(
    preview.route?.ok ? preview.route.segments.map((segment) => segment.wayId) : [],
  )
  if (!preview.route?.ok) return { removed: [], added: [], stretchIds, routeIds }
  const removed = [...stretchIds].filter((id) => !routeIds.has(id))
  const added = [...routeIds].filter((id) => !stretchIds.has(id))
  return { removed, added, stretchIds, routeIds }
}
