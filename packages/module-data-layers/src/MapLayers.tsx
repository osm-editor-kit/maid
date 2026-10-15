/**
 * The visible data layers on the map, drawn under the OSM data (`belowOsm`). Only visible layers
 * mount a source, so a hidden layer makes no request.
 */
import { isAutomated, type RemoteFetch, type UrlParamHandle } from '@osm-editor-kit/maid-core'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Layer, Source, useControl } from 'react-map-gl/maplibre'
import { gpxAddressOptions } from './add.ts'
import type { DataLayer, DataLayerConfig } from './config.ts'
import { useAddedLayers, useFileLayers, useHiddenIds } from './data-layers-store.ts'
import { layerDraw, layersOf, visibleLayers } from './layers.ts'
import { colorsInUse, useLinkedLayer } from './link.ts'
import { pmtilesLayersOptions, registerPmtilesProtocol } from './pmtiles.ts'

/**
 * A control with nothing in it. `useControl` is how react-map-gl gives a child of the map the map
 * library it uses (`mapLib`), which the PMTiles protocol is registered with.
 */
function silentControl() {
  return {
    onAdd: () => {
      const element = document.createElement('div')
      element.hidden = true
      return element
    },
    onRemove: () => {},
  }
}

/**
 * The layer names a PMTiles layer draws. Given in the config, they are used as they are; otherwise
 * they are read from the archive once it is shown. `undefined` while they are being read.
 */
function useSourceLayerNames(layer: DataLayer, send: RemoteFetch) {
  const { url, kind, sourceLayers } = layer
  const readNames = kind === 'pmtiles' && sourceLayers === undefined
  // a query per archive address; disabled when the names are given or the layer is not a PMTiles one.
  // A failure is the query's error: the panel reads it from the same query (see `useLayerProblems`).
  const read = useQuery({ ...pmtilesLayersOptions(url, send), enabled: readNames })
  if (!readNames) return sourceLayers
  return read.data
}

/**
 * The data of a GPX layer, read from its address (once per address, `gpxAddressOptions`). Undefined for other
 * layers, and for a GPX layer until it is read. A layer that has its data (a file) does not read.
 */
function useGpxData(layer: DataLayer, send: RemoteFetch) {
  const read = useQuery({
    ...gpxAddressOptions(layer.url, send),
    enabled: layer.kind === 'gpx' && layer.data === undefined,
  })
  return read.data
}

function DataLayerDrawing({
  layer,
  beforeId,
  send,
}: {
  layer: DataLayer
  beforeId: string
  send: RemoteFetch
}) {
  const names = useSourceLayerNames(layer, send)
  const gpx = useGpxData(layer, send)
  const draw = useMemo(
    () => layerDraw({ ...layer, sourceLayers: names, data: layer.data ?? gpx }),
    [layer, names, gpx],
  )
  if (!draw) return null
  return (
    <Source id={draw.sourceId} {...draw.source}>
      {draw.sets
        .flatMap((set) => set.layers)
        .map((spec) => (
          <Layer key={spec.id} {...spec} beforeId={beforeId} />
        ))}
    </Source>
  )
}

/**
 * The map content of the module: registers the protocol once and draws every visible layer. The layer a link names
 * (`data`) is loaded here, once per address, and drawn with the others.
 */
export function createMapContent(
  config: readonly DataLayerConfig[],
  send: RemoteFetch,
  link: UrlParamHandle<string>,
) {
  function DataLayersOnMap({ belowOsm }: MapContentProps) {
    useControl(({ mapLib }) => {
      // before any pmtiles:// source is added, which happens in an effect of a child
      registerPmtilesProtocol(mapLib)
      return silentControl()
    })
    const added = useAddedLayers()
    const files = useFileLayers()
    const hidden = useHiddenIds()
    const linked = useLinkedLayer(link, send, colorsInUse(config, added, files), { load: true })
    const layers = useMemo(
      () =>
        visibleLayers(
          layersOf(config, added, files, linked.layer ? [linked.layer] : []),
          hidden,
          isAutomated(),
        ),
      [added, files, hidden, linked.layer],
    )
    return (
      <>
        {layers.map((layer) => (
          <DataLayerDrawing key={layer.id} layer={layer} beforeId={belowOsm} send={send} />
        ))}
      </>
    )
  }
  return DataLayersOnMap
}
