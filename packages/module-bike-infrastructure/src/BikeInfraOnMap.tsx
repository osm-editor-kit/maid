/**
 * The bicycle infrastructure on the map: registered on `map.content` (index.ts). It draws the features of collect.ts
 * with the layers of layers.ts while it is shown (shown.ts), and the traffic signs once their images are on the map.
 */
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import type { Feature, FeatureCollection } from 'geojson'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Layer, Source, useMap, type LayerProps } from 'react-map-gl/maplibre'
import { bikeCollection } from './collect.ts'
import type { SignProperties } from './features.ts'
import { BIKE_LAYERS, BIKE_SIGN_SOURCE, BIKE_SOURCE, SIGN_LAYER, type BikeLayer } from './layers.ts'
import { useBikeInfraShown } from './shown.ts'
import { SIGN_PIXEL_RATIO, signImage, signImageId } from './sign-images.ts'

/**
 * The layer of the editor that ours go below: the labels of lines when they are on, else the midpoint handles. Both
 * are above the lines and below the vertices and points, so the infrastructure covers iD's line colours but never a
 * vertex, a point or a label (renderer layers.ts).
 */
const BEFORE = ['label-line', 'highlight-midpoint']
/** The signs go above the labels of lines (see the layer) */
const SIGN_BEFORE = ['highlight-midpoint']

/**
 * The staging graph of the editor's history and a count of its changes. A load adds to the graph's base in place, so the
 * graph can stay the same object while its data grows: the count tells the memo below that it has to look again (the
 * collector's caches make a look without a change cheap).
 */
function useStagingGraph(history: MapContentProps['editor']['history']) {
  const [changes] = useState(() => ({ count: 0 }))
  const subscribe = useCallback(
    (listener: () => void) => {
      const changed = () => {
        changes.count++
        listener()
      }
      const stops = [
        history.on('merge', changed),
        history.on('stagingchange', changed),
        history.on('historyjump', changed),
      ]
      return () => {
        for (const stop of stops) stop()
      }
    },
    [history, changes],
  )
  const count = useSyncExternalStore(subscribe, () => changes.count)
  return { graph: history.staging.graph, count }
}

/** The layers as react-map-gl takes them (the expressions are checked by the layer tests) */
function toLayerProps(layer: BikeLayer): LayerProps {
  return layer as unknown as LayerProps
}

/** The id of the first editor layer of BEFORE on the map, undefined while there is none */
function useBeforeId(ids: readonly string[] = BEFORE) {
  const { current: map } = useMap()
  if (!map) return undefined
  return ids.find((id) => map.getLayer(id) !== undefined)
}

/** Sign values whose images were made (by value), and the ones that have none or are being made */
const cache = new Map<string, ImageData>()
const failed = new Set<string>()
const loading = new Set<string>()

/**
 * Puts the images of the sign values in `values` on the map, making the ones not made yet, and returns a count that
 * grows with each image added, so that the sign source is built again. Added again after a style load, which drops the
 * images of the old style.
 */
function useSignImages(values: readonly string[]) {
  const { current: map } = useMap()
  const [added, setAdded] = useState(0)
  useEffect(() => {
    if (!map) return
    const add = (value: string, data: ImageData) => {
      const id = signImageId(value)
      if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio: SIGN_PIXEL_RATIO })
    }
    // the images made before (for another map) are put on this one; the signs that use them show with the next change
    for (const value of values) {
      const made = cache.get(value)
      if (made) {
        add(value, made)
        continue
      }
      if (failed.has(value) || loading.has(value)) continue
      loading.add(value)
      signImage(value)
        .then((data) => {
          loading.delete(value)
          if (!data) {
            failed.add(value)
            return
          }
          cache.set(value, data)
          add(value, data)
          setAdded((n) => n + 1)
        })
        .catch(() => {
          loading.delete(value)
          failed.add(value)
        })
    }
    const restore = () => {
      for (const [value, data] of cache) add(value, data)
      setAdded((n) => n + 1)
    }
    map.on('style.load', restore)
    return () => {
      map.off('style.load', restore)
    }
  }, [map, values])
  return added
}

function isSign(feature: Feature): feature is Feature & { properties: SignProperties } {
  return feature.properties?.kind === 'sign'
}

/** The bicycle infrastructure of the loaded data. Renders nothing while it is not shown. */
export function BikeInfraOnMap({ editor }: MapContentProps) {
  const shown = useBikeInfraShown()
  const { graph, count } = useStagingGraph(editor.history)
  const beforeId = useBeforeId()
  const signBeforeId = useBeforeId(SIGN_BEFORE)
  // count: a load grows the graph in place (see useStagingGraph)
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => (shown ? bikeCollection(graph) : null), [shown, graph, count])
  const values = useMemo(() => {
    if (!data) return []
    const set = new Set<string>()
    for (const feature of data.features) if (isSign(feature)) set.add(feature.properties.sign)
    return [...set].sort()
  }, [data])
  const imageCount = useSignImages(values)
  const { current: map } = useMap()
  const signs = useMemo((): FeatureCollection | null => {
    if (!data) return null
    const features: Feature[] = []
    for (const feature of data.features) {
      // only the signs whose image is on the map: MapLibre does not use an image added after the symbol was placed
      if (!isSign(feature) || !map?.hasImage(signImageId(feature.properties.sign))) continue
      features.push({
        ...feature,
        properties: { ...feature.properties, image: signImageId(feature.properties.sign) },
      })
    }
    return { type: 'FeatureCollection', features }
    // imageCount: a new image makes more signs drawable
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [data, map, imageCount])
  if (data === null || signs === null) return null
  return (
    <>
      <Source id={BIKE_SOURCE} type="geojson" data={data}>
        {BIKE_LAYERS.map((layer) => (
          <Layer key={layer.id} beforeId={beforeId} {...toLayerProps(layer)} />
        ))}
      </Source>
      <Source id={BIKE_SIGN_SOURCE} type="geojson" data={signs}>
        {/* above the labels: MapLibre places the symbols of a higher layer first, so a name gives way to a sign
            instead of hiding it; still under the vertices and points */}
        <Layer beforeId={signBeforeId} {...toLayerProps(SIGN_LAYER)} />
      </Source>
    </>
  )
}
