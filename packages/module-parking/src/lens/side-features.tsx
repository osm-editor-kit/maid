/**
 * The parking sides on the map: `ParkingSidesOnMap` is registered on `map.content` (index.ts). It draws the features of
 * collect.ts with the layers of layers.ts, only while the parking lens is active (side-state.ts).
 *
 * The feature builders live in features.ts (pure); this file has the component and the one imperative call.
 */
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { Layer, Source, useMap, type LayerProps } from 'react-map-gl/maplibre'
import { arrowPixels, ARROW_PIXEL_RATIO } from './arrow-image.ts'
import { parkingCollection } from './collect.ts'
import { PARKING_ARROW_IMAGE, PARKING_LAYERS, PARKING_SOURCE, type ParkingLayer } from './layers.ts'
import { useParkingShowMissing, useParkingShown } from './side-state.ts'

/**
 * The staging graph of the editor's history, read again after each change of it (a load or an edit). The graph is a new
 * object per change, so it is the snapshot: the memo below depends on it. An external store (react-dev: useSyncExternalStore).
 */
function useStagingGraph(history: MapContentProps['editor']['history']) {
  // stable for one history: a new subscribe function would make the hook unsubscribe and subscribe on every render
  const subscribe = useCallback(
    (listener: () => void) => {
      const stops = [
        history.on('merge', listener),
        history.on('stagingchange', listener),
        history.on('historyjump', listener),
      ]
      return () => {
        for (const stop of stops) stop()
      }
    },
    [history],
  )
  return useSyncExternalStore(subscribe, () => history.staging.graph)
}

/**
 * Registers the direction arrow with the map. react-map-gl has no declarative way to add an image that is generated in
 * code (the layer names it, the image must exist), so this calls `map.addImage`, as the renderer does for its own
 * images. Added again after a style load, which drops the images of the old style.
 */
function useArrowImage() {
  const { current: map } = useMap()
  useEffect(() => {
    if (!map) return
    const ensure = () => {
      if (!map.hasImage(PARKING_ARROW_IMAGE))
        map.addImage(PARKING_ARROW_IMAGE, arrowPixels(), { pixelRatio: ARROW_PIXEL_RATIO })
    }
    const onMissing = (event: { id: string }) => {
      if (event.id === PARKING_ARROW_IMAGE) ensure()
    }
    ensure()
    map.on('styleimagemissing', onMissing)
    map.on('style.load', ensure)
    return () => {
      map.off('styleimagemissing', onMissing)
      map.off('style.load', ensure)
    }
  }, [map])
}

/**
 * The layers as react-map-gl takes them. The expressions are JSON arrays of the style spec; their types live in
 * maplibre-gl, which this package does not depend on, and the layer tests check their shape.
 */
function toLayerProps(layer: ParkingLayer): LayerProps {
  return layer as unknown as LayerProps
}

/** The parking sides, arrows, areas, kerbs and obstacles of the loaded data. Renders nothing while the lens is off. */
export function ParkingSidesOnMap({ editor }: MapContentProps) {
  const shown = useParkingShown()
  const showMissing = useParkingShowMissing()
  const graph = useStagingGraph(editor.history)
  useArrowImage()
  const data = useMemo(
    () => (shown ? parkingCollection(graph, { showMissing }) : null),
    [shown, showMissing, graph],
  )
  if (data === null) return null
  return (
    <Source id={PARKING_SOURCE} type="geojson" data={data}>
      {PARKING_LAYERS.map((layer) => (
        <Layer key={layer.id} {...toLayerProps(layer)} />
      ))}
    </Source>
  )
}
