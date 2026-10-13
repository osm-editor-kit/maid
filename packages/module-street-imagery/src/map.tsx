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
import { QueryClientProvider } from '@tanstack/react-query'
import type { MapLayerMouseEvent } from 'maplibre-gl'
import { useEffect, useState } from 'react'
import { useMap, type MapRef } from 'react-map-gl/maplibre'
import { photoQueries } from './query.ts'
import { activeProviders, photoTypesOf } from './state.ts'
import { AUTOMATED, useStreetImageryStore } from './store.ts'

/** The id of the editor's map: `<Map id>` in apps/maid MapView. */
export const MAP_ID = 'mainMap'

/**
 * Below this zoom nothing is requested or drawn. Mapillary's track tiles are several MB each in
 * dense areas when zoomed out, and the editor is used at street level (chosen by hand, not
 * measured).
 */
const MIN_ZOOM = 13

/** Zoom and viewport of the map, updated after every move. */
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
  const setEaseTo = useStreetImageryStore((state) => state.setEaseTo)
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
 */
export function StreetImageryLayers() {
  const mapRef = useMap()[MAP_ID]
  const stored = useStreetImageryStore((state) => state.providers)
  const token = useStreetImageryStore((state) => state.mapillaryToken)
  const photoKind = useStreetImageryStore((state) => state.photoKind)
  const date = useStreetImageryStore((state) => state.date)
  const openPhoto = useStreetImageryStore((state) => state.openPhoto)
  const { zoom, bbox } = useMapView(mapRef)
  useEaseBridge(mapRef)
  const bearing = useViewerBearing()
  const hfov = useViewerHfov()
  const lngLat = useViewerLngLat()
  const providers = activeProviders(stored, token, AUTOMATED)

  return (
    <QueryClientProvider client={photoQueries}>
      <StreetLevelImagerySourcesAndLayers
        providers={providers}
        bbox={bbox}
        zoom={zoom}
        filter={{ photoTypes: photoTypesOf(photoKind), date }}
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
    </QueryClientProvider>
  )
}

/**
 * The map's click handler asks this first, in browse mode. When the click hits a photo, the photo
 * opens in the dock and `true` is returned: the handler must then select no OSM feature, because
 * the photo is drawn above the data. Otherwise `false`, and the click goes on as usual.
 */
export function streetImageryClick(event: MapLayerMouseEvent) {
  const state = useStreetImageryStore.getState()
  const providers = activeProviders(state.providers, state.mapillaryToken, AUTOMATED)
  if (providers.length === 0) return false
  const map = event.target
  // a layer is only queried once it is in the style (it is added while the map mounts)
  const layers = streetImageryInteractiveLayerIds(providers).filter(
    (id) => map.getLayer(id) !== undefined,
  )
  if (layers.length === 0) return false
  const features = map.queryRenderedFeatures(event.point, { layers })
  const hit = queryStreetImageryFeatures({ features }).find(
    (item) => item.kind === 'photo' && item.photoId !== undefined,
  )
  if (!hit?.photoId) return false
  // the viewer loads the date, the type and the exact position of the photo
  state.showPhoto({
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
