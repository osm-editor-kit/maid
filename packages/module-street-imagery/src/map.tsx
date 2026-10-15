import { MAP_FEATURE_COLOR, photoTypeColorExpression } from '@osm-editor-kit/street-imagery'
import {
  queryStreetImageryFeatures,
  StreetLevelImagerySourcesAndLayers,
  streetImageryInteractiveLayerIds,
  useMapViewportBbox,
  useViewerBearing,
  useViewerHfov,
  useViewerLngLat,
} from '@osm-editor-kit/street-imagery-react'
import type { MapLayerMouseEvent } from 'maplibre-gl'
import { useEffect, useState } from 'react'
import { useMap, type MapRef } from 'react-map-gl/maplibre'
import { useShownPhotos } from './shown.ts'
import { snapBboxToTiles } from './snap.ts'
import { activeProviders, IMAGERY_PROVIDER_IDS, photoTypesOf } from './state.ts'
import {
  AUTOMATED,
  streetImageryActions,
  useMapillaryToken,
  useOpenPhoto,
  useStreetImageryActions,
} from './street-imagery-store.ts'

/** The id of the editor's map: `<Map id>` in apps/maid MapView. */
export const MAP_ID = 'mainMap'

/**
 * Below this zoom nothing is requested or drawn. Mapillary's track tiles are several MB each in
 * dense areas when zoomed out, and the editor is used at street level (chosen by hand, not
 * measured).
 * This is a MapLibre zoom (512 px, compared with `map.getZoom()`): 13 is OSM zoom 14, the zoom
 * iD uses for Mapillary. Not an OSM number like the rest of Maid's zoom values.
 */
const MIN_ZOOM = 13

/**
 * Zoom and viewport of the map, updated after every move. A child of the map: it listens to moveend itself,
 * since the Map's handlers belong to the shell (MapView).
 */
function useMapView(mapRef: MapRef | undefined) {
  const [zoom, setZoom] = useState(0)
  const [moves, setMoves] = useState(0)
  useEffect(
    function followMoves() {
      const map = mapRef?.getMap()
      if (!map) return
      const update = () => {
        setZoom(map.getZoom())
        setMoves((count) => count + 1)
      }
      update()
      map.on('moveend', update)
      return () => {
        map.off('moveend', update)
      }
    },
    [mapRef],
  )
  // the bbox is read from the map on every render; `moves` tells the hook when to read it again
  const bbox = useMapViewportBbox(MAP_ID, moves)
  return { zoom, bbox }
}

/** Lets the dock's viewer move the map to the photo it shows. */
function useEaseBridge(mapRef: MapRef | undefined) {
  const { setEaseTo } = useStreetImageryActions()
  useEffect(
    function registerEaseTo() {
      const map = mapRef?.getMap()
      if (!map) return
      setEaseTo((lng, lat) => {
        map.easeTo({ center: [lng, lat] })
      })
      return () => {
        setEaseTo(null)
      }
    },
    [mapRef, setEaseTo],
  )
}

/**
 * The photos on the map (the providers that are switched on), the view cone of the photo open in
 * the dock. Drawn above the OSM data; the click on a photo is handled by `streetImageryClick`.
 * The box is snapped to the photo tiles (snap.ts), so the package's queries are keyed per tile list.
 */
export function StreetImageryLayers() {
  const mapRef = useMap()[MAP_ID]
  const shown = useShownPhotos(false)
  const token = useMapillaryToken()
  const openPhoto = useOpenPhoto()
  const { zoom, bbox } = useMapView(mapRef)
  useEaseBridge(mapRef)
  const bearing = useViewerBearing()
  const hfov = useViewerHfov()
  const lngLat = useViewerLngLat()
  const providers = activeProviders(shown.providers, token, AUTOMATED)

  // the queries of the package run on the shell's query client (mount.tsx), which provides them to the map content
  return (
    <StreetLevelImagerySourcesAndLayers
      providers={providers}
      bbox={bbox === null ? null : snapBboxToTiles(bbox)}
      zoom={zoom}
      filter={{ photoTypes: photoTypesOf(shown.kind), date: shown.date }}
      options={{
        minZoom: MIN_ZOOM,
        photoCircleColor: photoTypeColorExpression,
        mapFeatureCircleColor: MAP_FEATURE_COLOR,
        selectedPhoto: openPhoto,
        showSelectionHighlight: true,
        showViewCone: true,
        viewerPov: { bearing, hfov, lngLat },
      }}
    />
  )
}

/**
 * The map's click handler asks this first, in browse mode. When the click hits a photo, the photo
 * opens in the dock and `true` is returned: the handler must then select no OSM feature, because
 * the photo is drawn above the data. Otherwise `false`, and the click goes on as usual.
 */
export function streetImageryClick(event: MapLayerMouseEvent) {
  if (AUTOMATED) return false
  const map = event.target
  // The layers are the map's own: a provider is in the style while it is shown (the URL's, shown.ts), and its layers are
  // unmounted with it. So the click asks for the layers in the style, not for a list of providers.
  const layers = streetImageryInteractiveLayerIds([...IMAGERY_PROVIDER_IDS]).filter(
    (id) => map.getLayer(id) !== undefined,
  )
  if (layers.length === 0) return false
  const features = map.queryRenderedFeatures(event.point, { layers })
  const hit = queryStreetImageryFeatures({ features }).find(
    (item) => item.kind === 'photo' && item.photoId !== undefined,
  )
  if (!hit?.photoId) return false
  // the viewer loads the date, the type and the exact position of the photo
  streetImageryActions.showPhoto({
    providerId: hit.providerId,
    photoId: hit.photoId,
    sequenceId: hit.sequenceId ?? null,
    capturedAt: null,
    isPano: null,
    heading: null,
    lngLat: [event.lngLat.lng, event.lngLat.lat],
  })
  return true
}
