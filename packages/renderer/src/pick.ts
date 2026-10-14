// Picks at a screen point: the feature a pointer hits, by iD's layer priority (PRIORITY), and every feature under it.
// Reads the rendered features of the map; pick-order.ts orders the candidates of pickAll.
// Imperative on purpose: a pick uses the engine's own tolerance box and layer priority, and runs on every
// pointer move. react-map-gl's interactiveLayerIds would make the Map query the same layers on each event.
import { isArea } from '@osm-editor-kit/maid-style'
import type { MapGeoJSONFeature } from 'maplibre-gl'
import type { OsmData } from './data'
import type { MaidEngine } from './engine'
import { featureId } from './feature-id'
import { EDIT_SOURCES, SELECT_SOURCES, SOURCES } from './layers'
import { extentOf, orderPicks, PICK_LIMIT, type PickCandidate } from './pick-order'

/** The map and the data a pick reads: public members of the engine */
type PickHost = Pick<MaidEngine, 'map' | 'data'>

const PRIORITY: Record<string, number> = {
  // the shape points of the selection are vertices like the others
  [SOURCES.highlight]: 0,
  [SOURCES.vertices]: 0, [EDIT_SOURCES.vertices]: 0, [SELECT_SOURCES.vertices]: 0,
  [SOURCES.points]: 1, [EDIT_SOURCES.points]: 1, [SELECT_SOURCES.points]: 1,
  [SOURCES.lines]: 2, [EDIT_SOURCES.lines]: 2, [SELECT_SOURCES.lines]: 2,
  [SOURCES.areas]: 3, [EDIT_SOURCES.areas]: 3, [SELECT_SOURCES.areas]: 3,
} // prettier-ignore

function pickBest(features: MapGeoJSONFeature[]) {
  let best: MapGeoJSONFeature | undefined
  for (const f of features) {
    if (!best || (PRIORITY[f.source] ?? 9) < (PRIORITY[best.source] ?? 9)) best = f
  }
  return (best && featureId(best)) ?? null
}

export function pickFeature(
  engine: PickHost,
  point: { x: number; y: number },
  layerIds: string[],
  tolerance: number,
  skip?: ReadonlySet<string>,
) {
  const { map } = engine
  if (!map) return null
  const features = map.queryRenderedFeatures(
    [
      [point.x - tolerance, point.y - tolerance],
      [point.x + tolerance, point.y + tolerance],
    ],
    { layers: layerIds },
  )
  return pickBest(
    skip
      ? features.filter((f) => {
          const id = featureId(f)
          return id === undefined || !skip.has(id)
        })
      : features,
  )
}

export function pickAllFeatures(
  engine: PickHost,
  point: { x: number; y: number },
  layerIds: string[],
  tolerance: number,
) {
  const { map } = engine
  if (!map) return []
  const features = map.queryRenderedFeatures(
    [
      [point.x - tolerance, point.y - tolerance],
      [point.x + tolerance, point.y + tolerance],
    ],
    { layers: layerIds },
  )
  const candidates = new Map<string, PickCandidate>()
  for (const f of features) {
    const id = featureId(f)
    if (!id) continue
    // a feature drawn in more than one layer keeps the highest of its priorities, as pick does
    const priority = PRIORITY[f.source] ?? 9
    const known = candidates.get(id)
    if (known) known.priority = Math.min(known.priority, priority)
    else candidates.set(id, { id, priority, size: sizeOf(engine.data, id) })
  }
  return orderPicks([...candidates.values()], pickBest(features), PICK_LIMIT)
}

/** The size that orders picks: 0 for a node, else the area or the length of a way (pick-order.ts) */
function sizeOf(data: OsmData, id: string) {
  if (id[0] !== 'w') return 0
  const way = data.way(id)
  if (!way) return Number.POSITIVE_INFINITY
  const points: [number, number][] = []
  for (const n of way.nodes) {
    const loc = data.node(n)?.loc
    if (loc) points.push([loc[0], loc[1]])
  }
  const closed = way.nodes.length > 2 && way.nodes[0] === way.nodes[way.nodes.length - 1]
  return extentOf(points, closed && isArea(way.tags, closed))
}
