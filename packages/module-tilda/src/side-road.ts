/**
 * The road a way of its own runs next to, from the loaded data: the input of the tagging package's geometry helpers
 * (`pickSidepathRoad`, `lineRelationToRoad`, `sidepathDirectionFindings`, tagging 0.9.0). With it, the meaning of
 * `oneway=yes` on a cycle path says whether its line runs with the traffic beside it, and the validation finds a cycle
 * path drawn against it.
 */
import { type Graph, OsmWay } from '@osm-editor-kit/maid-model'
import {
  isRoad,
  type LineRelation,
  lineRelationToRoad,
  pickSidepathRoad,
  type WayGeometry,
} from '@tilda-geo/bicycle-infrastructure-tagging'
import { boxOf, locsOf, waysOf } from './footway.ts'

/** Roads whose box comes this close to the way are candidates (the package's own limit is 25 m) */
const SEARCH_METERS = 30

/** The way and the roads near it, as the package takes them; undefined for a closed or unloaded way */
export function wayWithRoads(
  graph: Graph,
  wayId: string,
): { way: WayGeometry; roads: WayGeometry[] } | undefined {
  const way = graph.hasEntity(wayId)
  if (!(way instanceof OsmWay) || way.isClosed()) return undefined
  const coords = locsOf(graph, way)
  if (!coords || coords.length < 2) return undefined
  const box = boxOf(coords, SEARCH_METERS)
  const roads: WayGeometry[] = []
  for (const other of waysOf(graph)) {
    if (other.id === way.id || !isRoad({ ...other.tags })) continue
    const locs = locsOf(graph, other)
    if (!locs || locs.length < 2) continue
    const own = boxOf(locs, 0)
    if (
      own.minLon <= box.maxLon &&
      own.maxLon >= box.minLon &&
      own.minLat <= box.maxLat &&
      own.maxLat >= box.minLat
    )
      roads.push({ tags: { ...other.tags }, coords: locs })
  }
  return { way: { tags: { ...way.tags }, coords }, roads }
}

/** How the way's line runs next to its road, or undefined when it has none or the geometry does not say */
export function lineRelationOf(graph: Graph, wayId: string): LineRelation | undefined {
  const found = wayWithRoads(graph, wayId)
  if (!found) return undefined
  const road = pickSidepathRoad(found.way.coords, found.roads)
  return road && lineRelationToRoad(found.way.coords, road)
}
