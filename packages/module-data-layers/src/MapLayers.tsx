/**
 * The visible data layers on the map, drawn under the OSM data (`belowOsm`). Only visible layers
 * mount a source, so a hidden layer makes no request.
 */
import { isAutomated, type RemoteFetch } from '@osm-editor-kit/maid-core'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { Layer, Source, useControl } from 'react-map-gl/maplibre'
import { describeFailure } from './add.ts'
import type { DataLayer, DataLayerConfig } from './config.ts'
import { layerDraw, layersOf, visibleLayers } from './layers.ts'
import { pmtilesLayersOptions, registerPmtilesProtocol } from './pmtiles.ts'
import type { DataLayerStoreHook } from './store.ts'

type Report = (id: string, message: string | undefined) => void

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
function useSourceLayerNames(layer: DataLayer, report: Report, send: RemoteFetch) {
  const { id, url, kind, sourceLayers } = layer
  const readNames = kind === 'pmtiles' && sourceLayers === undefined
  // a query per archive address; disabled when the names are given or the layer is not a PMTiles one
  const read = useQuery({ ...pmtilesLayersOptions(url, send), enabled: readNames })
  const { isSuccess, isError, error } = read
  // the problem is shown by the panel's store: an effect writes it, as it is outside React
  useEffect(() => {
    if (!readNames) return
    if (isSuccess) report(id, undefined)
    if (isError) report(id, describeFailure(error, 'Could not read this PMTiles file').message)
  }, [readNames, isSuccess, isError, error, id, report])
  if (!readNames) return sourceLayers
  return read.data
}

function DataLayerDrawing({
  layer,
  beforeId,
  report,
  send,
}: {
  layer: DataLayer
  beforeId: string
  report: Report
  send: RemoteFetch
}) {
  const names = useSourceLayerNames(layer, report, send)
  const draw = useMemo(() => layerDraw({ ...layer, sourceLayers: names }), [layer, names])
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

/** The map content of the module: registers the protocol once and draws every visible layer */
export function createMapContent(
  useStore: DataLayerStoreHook,
  config: readonly DataLayerConfig[],
  send: RemoteFetch,
) {
  function DataLayersOnMap({ belowOsm }: MapContentProps) {
    useControl(({ mapLib }) => {
      // before any pmtiles:// source is added, which happens in an effect of a child
      registerPmtilesProtocol(mapLib)
      return silentControl()
    })
    const added = useStore((state) => state.added)
    const files = useStore((state) => state.files)
    const hidden = useStore((state) => state.hidden)
    const report = useStore((state) => state.setProblem)
    const layers = useMemo(
      () => visibleLayers(layersOf(config, added, files), hidden, isAutomated()),
      [added, files, hidden],
    )
    return (
      <>
        {layers.map((layer) => (
          <DataLayerDrawing
            key={layer.id}
            layer={layer}
            beforeId={belowOsm}
            report={report}
            send={send}
          />
        ))}
      </>
    )
  }
  return DataLayersOnMap
}
