/**
 * The map's zoom and box as the photo layers ask for them, and the photos in view, for the photos panel (the date
 * chart and the legend). The panel asks with the same box (snapped to tiles) and zoom as the layers, so it reads the
 * layers' queries and makes no request of its own while the layers are on.
 */
import type { NormalizedPhoto } from '@osm-editor-kit/street-imagery'
import { useMapViewportBbox, useProviderPhotos } from '@osm-editor-kit/street-imagery-react'
import { useEffect, useState } from 'react'
import { useMap, type MapRef } from 'react-map-gl/maplibre'
import { snapBboxToTiles } from './snap.ts'
import type { ImageryProviderId } from './state.ts'

/** The id of the editor's map: `<Map id>` in apps/maid MapView. */
export const MAP_ID = 'mainMap'

/**
 * Below this zoom nothing is requested or drawn. Mapillary's track tiles are several MB each in
 * dense areas when zoomed out, and the editor is used at street level (chosen by hand, not
 * measured).
 * This is a MapLibre zoom (512 px, compared with `map.getZoom()`): 13 is OSM zoom 14, the zoom
 * iD uses for Mapillary. Not an OSM number like the rest of Maid's zoom values.
 */
export const MIN_ZOOM = 13

/**
 * Zoom and box of the map, updated after every move; the box snapped to the photo tiles (snap.ts). Works inside the
 * map and beside it (the shell's MapProvider holds the map by its id); it listens to moveend itself, since the Map's
 * handlers belong to the shell (MapView).
 */
export function useMapView(mapRef: MapRef | undefined = useMap()[MAP_ID]) {
  const [zoom, setZoom] = useState(() => mapRef?.getMap().getZoom() ?? 0)
  useEffect(
    function followMoves() {
      const map = mapRef?.getMap()
      if (!map) return
      const update = () => {
        setZoom(map.getZoom())
      }
      update()
      map.on('moveend', update)
      return () => {
        map.off('moveend', update)
      }
    },
    [mapRef],
  )
  // since 1.0 the hook follows moveend itself and keeps the same array while the viewport is the same
  const bbox = useMapViewportBbox(MAP_ID)
  return { zoom, bbox: bbox === null ? null : snapBboxToTiles(bbox) }
}

const NO_PHOTOS: NormalizedPhoto[] = []

/**
 * The photos of the shown providers in the layers' box, before the date and kind filters: what the date chart and
 * the legend count. Empty below `MIN_ZOOM` and for providers that are off.
 */
export function usePhotosInView(providers: readonly ImageryProviderId[]): NormalizedPhoto[] {
  const { zoom, bbox } = useMapView()
  const options = { minZoom: MIN_ZOOM }
  const panoramax = useProviderPhotos(
    'panoramax',
    providers.includes('panoramax') ? bbox : null,
    zoom,
    options,
  )
  const mapillary = useProviderPhotos(
    'mapillary',
    providers.includes('mapillary') ? bbox : null,
    zoom,
    options,
  )
  const lists = [panoramax.data, mapillary.data].filter((list) => list !== undefined)
  if (lists.length === 0) return NO_PHOTOS
  return lists.flat()
}
