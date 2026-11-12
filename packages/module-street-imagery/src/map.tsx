import {
  buildMapFeatureLayerFilter,
  featureSourceId,
  MAP_FEATURE_COLOR,
  parseIsoDateStartMs,
  signGroupFilter,
  type ProviderId,
} from '@osm-editor-kit/street-imagery'
import {
  queryStreetImageryFeatures,
  SelectedMapFeatureLayer,
  StreetLevelImagerySourcesAndLayers,
  streetImageryInteractiveLayerIds,
  useViewerBearing,
  useViewerHfov,
  useSelectedMapillaryFeature,
  useViewerLngLat,
} from '@osm-editor-kit/street-imagery-react'
import type { MapLayerMouseEvent } from 'maplibre-gl'
import { useEffect } from 'react'
import { Layer, useMap, type MapRef } from 'react-map-gl/maplibre'
import { photoColorExpression } from './colors.ts'
import { useOpenPhoto, useShownPhotos } from './shown.ts'
import { SIGN_ICONS_LAYER_ID, useSignIcons } from './sign-icons.ts'
import {
  activeProviders,
  IMAGERY_PROVIDER_IDS,
  photoTypesOf,
  SIGNS_ID,
  signsActive,
} from './state.ts'
import {
  AUTOMATED,
  streetImageryActions,
  useMapillaryToken,
  useColorBy,
  useSelectedSign,
  useSignGroups,
  useStreetImageryActions,
} from './street-imagery-store.ts'
import { refOf } from './url.ts'
import { MAP_ID, MIN_ZOOM, useMapView } from './view.ts'

export { MAP_ID } from './view.ts'

/** Lets the viewer move the map to the photo it shows. */
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
 * the viewer, Mapillary's traffic signs and the selected one. Drawn above the OSM data; the click on a photo is handled by `streetImageryClick`.
 * The box is snapped to the photo tiles (view.ts), so the package's queries are keyed per tile list.
 */
export function StreetImageryLayers() {
  const mapRef = useMap()[MAP_ID]
  const shown = useShownPhotos(false)
  const token = useMapillaryToken()
  const { photo: openPhoto } = useOpenPhoto(shown.providers)
  const { zoom, bbox } = useMapView(mapRef)
  const colorBy = useColorBy()
  useEaseBridge(mapRef)
  const bearing = useViewerBearing()
  const hfov = useViewerHfov()
  const lngLat = useViewerLngLat()
  const signGroups = useSignGroups()
  const selectedSign = useSelectedSign()
  const signsOn = signsActive(shown.providers, token, AUTOMATED)
  const providers: ProviderId[] = [
    ...activeProviders(shown.providers, token, AUTOMATED),
    ...(signsOn ? ([SIGNS_ID] as const) : []),
  ]
  // the package caches the function per choice, so its identity is stable while the groups stay the same. No group
  // chosen shows every sign, as all of them do (the Radnetz fork's rule)
  const signFilter = signGroups.length === 0 ? undefined : signGroupFilter(signGroups)
  const sign = useSelectedMapillaryFeature({
    featureId: selectedSign,
    shownPhotoId: openPhoto?.providerId === 'mapillary' ? openPhoto.photoId : null,
    minCapturedAt: shown.date.from ? parseIsoDateStartMs(shown.date.from) : null,
  })
  useSignIcons(mapRef, signsOn)

  // the queries of the package run on the shell's query client (mount.tsx), which provides them to the map content
  return (
    <>
      <StreetLevelImagerySourcesAndLayers
        providers={providers}
        bbox={bbox}
        zoom={zoom}
        filter={{
          photoTypes: photoTypesOf(shown.kind),
          date: shown.date,
          mapFeatureValue: signFilter,
        }}
        options={{
          minZoom: MIN_ZOOM,
          photoCircleColor: photoColorExpression(colorBy),
          mapFeatureCircleColor: MAP_FEATURE_COLOR,
          selectedPhoto: openPhoto,
          showSelectionHighlight: true,
          showViewCone: true,
          viewerPov: { bearing, hfov, lngLat },
        }}
      />
      {signsOn && (
        // The signs' icons (iD's and Rapid's sprite source) over the package's dots, on the package's source. The
        // dot stays under an icon that is missing (sign-icons.ts).
        <Layer
          id={SIGN_ICONS_LAYER_ID}
          type="symbol"
          source={featureSourceId(SIGNS_ID)}
          filter={buildMapFeatureLayerFilter(shown.date)}
          layout={{
            'icon-image': ['get', 'value'],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 18, 1],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          }}
        />
      )}
      {selectedSign !== null && (
        <SelectedMapFeatureLayer
          data={sign.data}
          shownImage={sign.shownImage}
          providers={providers}
          bbox={bbox}
          zoom={zoom}
        />
      )}
    </>
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
  const layers = [
    SIGN_ICONS_LAYER_ID,
    ...streetImageryInteractiveLayerIds([...IMAGERY_PROVIDER_IDS, SIGNS_ID]),
  ].filter((id) => map.getLayer(id) !== undefined)
  if (layers.length === 0) return false
  const features = map.queryRenderedFeatures(event.point, { layers })
  // a sign (its icon or its dot) is drawn above the photos: it takes the click, and its photos open in the viewer
  const signId = features
    .map((feature) => feature.properties.featureId as unknown)
    .find((id) => typeof id === 'string' || typeof id === 'number')
  if (signId !== undefined) {
    streetImageryActions.selectSign(String(signId))
    return true
  }
  const hit = queryStreetImageryFeatures({ features }).find(
    (item) => item.kind === 'photo' && item.photoId !== undefined,
  )
  if (!hit?.photoId) return false
  const photo = {
    providerId: hit.providerId,
    photoId: hit.photoId,
    sequenceId: hit.sequenceId ?? null,
    capturedAt: null,
    isPano: null,
    heading: null,
    lngLat: [event.lngLat.lng, event.lngLat.lat] as [number, number],
  }
  const ref = refOf(photo)
  if (ref === null) return false
  // the photo is seeded in its query, so it opens without a request; the viewer loads the date, the type and the
  // exact position of the photo. A photo chosen on the map is no longer one of the selected sign.
  streetImageryActions.selectSign(null)
  streetImageryActions.showPhoto(ref, photo)
  return true
}
