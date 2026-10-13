import type { LayerSpecification } from 'maplibre-gl'
import { SOURCES } from './layers'

/**
 * The image a layer's `icon-image` names: `['concat', 'pin-', …]` gives `pin-` (the images of that family are named
 * `pin-<icon>`), a constant gives the id itself. Undefined for a layer without an icon.
 */
export function iconImagePrefix(layer: LayerSpecification): string | undefined {
  if (layer.type !== 'symbol' || !layer.layout) return undefined
  const image: unknown = (layer.layout as Record<string, unknown>)['icon-image']
  if (typeof image === 'string') return image
  if (Array.isArray(image) && image[0] === 'concat' && typeof image[1] === 'string') return image[1]
  return undefined
}

/**
 * The image families the OSM data layers ask MapLibre for in a tile at `tileZoom` (the MapLibre zoom the tile is
 * laid out for). MapLibre's worker lays out a layer only where it is not hidden at that zoom (`isHidden(zoom, true)`:
 * below floor(minzoom), at or above maxzoom), and it asks for the icon of every feature the layer's filter lets
 * through, whatever its paint says (an opacity of 0 from feature state does not stop the request). The edit and
 * selection twins hold only features being edited or selected, so they are left out. The active pin layer draws from
 * ACTIVE_SOURCE (the hovered and selected points only, a source other than SOURCES.points), so it is left out too:
 * it asks for the pins of those few points when they are shown, and none at the opening view.
 *
 * Used by the load benchmark and the image tests; it mirrors MapLibre's rule, it does not replace it.
 */
export function iconImagesRequestedAt(layers: LayerSpecification[], tileZoom: number): Set<string> {
  const requested = new Set<string>()
  for (const layer of layers) {
    if (!('source' in layer)) continue
    if (layer.source !== SOURCES.points && layer.source !== SOURCES.vertices) continue
    if (/--(edit|select)$/.test(layer.id)) continue
    if (tileZoom < Math.floor(layer.minzoom ?? 0)) continue
    if (layer.maxzoom !== undefined && tileZoom >= layer.maxzoom) continue
    const prefix = iconImagePrefix(layer)
    if (prefix !== undefined) requested.add(prefix)
  }
  return requested
}
