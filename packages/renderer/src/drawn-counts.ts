// What the map draws: how many features each source has on the screen, for the engine's stats().
// Reads the rendered features and the style layers of each source; nothing is changed.
import type { Map as MapLibreMap } from 'maplibre-gl'
import { SOURCE_NAMES } from './channels'
import { EDIT_SOURCES, SOURCES } from './layers'

function layersOfSource(map: MapLibreMap, source: string) {
  return map
    .getStyle()
    .layers.filter((l) => 'source' in l && l.source === source)
    .map((l) => l.id)
}

export function drawnCounts(map: MapLibreMap | undefined) {
  const drawn: Record<string, number> = {}
  if (map) {
    for (const name of SOURCE_NAMES) {
      try {
        const layers = [
          ...layersOfSource(map, SOURCES[name]),
          ...layersOfSource(map, EDIT_SOURCES[name]),
        ]
        const ids = new Set(map.queryRenderedFeatures({ layers }).map((f) => f.id))
        drawn[name] = ids.size
      } catch (error) {
        // MapLibre can throw "feature index out of bounds" here; keep the stats usable and visible
        console.error(`stats: queryRenderedFeatures failed for ${name}`, error)
        drawn[name] = -1
      }
    }
    drawn.layers = map.getStyle().layers.length
  }
  return drawn
}
