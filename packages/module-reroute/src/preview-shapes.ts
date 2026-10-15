/**
 * The preview of a reroute as GeoJSON, for one map source: the stretch as it is (`old`), the new path (`new`), the
 * split points, the points to check, and the two handles. Each feature has a `kind`; the layers of RerouteOnMap
 * filter on it. Pure.
 */
import { OsmRelation, type Graph } from '@osm-editor-kit/maid-model'
import { nodeLonlat, segmentLine, wayLine, type Lonlat } from './geometry.ts'
import type { RoutePreview } from './route.ts'

export type PreviewKind = 'old' | 'new' | 'split' | 'review' | 'handle'

export type PreviewProperties = {
  kind: PreviewKind
  /** On a handle: which point it is */
  handle?: 'start' | 'end'
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
  const relation = graph.hasEntity(preview.relationId)
  const stretch = preview.stretch
  if (stretch && relation instanceof OsmRelation) {
    for (let index = stretch.from; index <= stretch.to; index++) {
      const member = relation.members[index]
      if (member?.type !== 'way') continue
      const coordinates = wayLine(graph, member.id)
      if (coordinates.length > 1) features.push(lineFeature(coordinates, { kind: 'old' }))
    }
  }
  if (preview.route?.ok) {
    for (const segment of preview.route.segments) {
      const coordinates = segmentLine(graph, segment)
      if (coordinates.length > 1) features.push(lineFeature(coordinates, { kind: 'new' }))
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
    { name: 'start' as const, via: preview.start },
    { name: 'end' as const, via: preview.end },
  ]
  for (const { name, via } of handles) {
    if (via)
      features.push(
        pointFeature(via.loc, { kind: 'handle', handle: name, snapped: via.snap !== undefined }),
      )
  }
  return { type: 'FeatureCollection', features }
}
