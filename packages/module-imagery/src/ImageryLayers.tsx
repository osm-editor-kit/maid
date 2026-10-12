import { isAutomated } from '@osm-editor-kit/maid-core'
import { Fragment, useEffect, useState } from 'react'
import { AttributionControl, Layer, Source, useMap } from 'react-map-gl/maplibre'
import { useStore } from 'zustand'
import { drawLayer, type Drawn } from './eli.ts'
import type { ImageryStore } from './store.ts'

/**
 * Draws the chosen background and overlays under the OSM data (`belowOsm`), and keeps the store
 * up to date with the viewport for the panel. It is part of the map, so it must be rendered inside
 * the map. Nothing is loaded until a background or an overlay is chosen, and nothing at all in an
 * automated browser.
 */
export function ImageryLayers(props: { store: ImageryStore; belowOsm: string }) {
  const { store, belowOsm } = props
  const map = useMap().current
  const backgroundId = useStore(store, (s) => s.backgroundId)
  const overlayKey = useStore(store, (s) => s.overlayIds.join('\n'))
  const brightness = useStore(store, (s) => s.brightness)
  const setView = useStore(store, (s) => s.setView)
  const automated = isAutomated()

  // what is drawn, keyed by what was chosen: a result for an older choice is not shown
  const key = `${backgroundId ?? ''}\n${overlayKey}`
  const [loaded, setLoaded] = useState<{ key: string; items: Drawn[] } | null>(null)

  useEffect(() => {
    if (!map) return
    const track = () => {
      const bounds = map.getBounds()
      setView({
        bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom: map.getZoom(),
      })
    }
    track()
    map.on('moveend', track)
    return () => {
      map.off('moveend', track)
    }
  }, [map, setView])

  useEffect(() => {
    if (automated) return
    const overlays = overlayKey === '' ? [] : overlayKey.split('\n')
    const ids = backgroundId === null ? overlays : [backgroundId, ...overlays]
    if (ids.length === 0) return
    let cancelled = false
    // the background is first, so the overlays are drawn above it; each draw catches its own failure
    void Promise.all(
      ids.map((id, index) =>
        drawLayer(id, backgroundId !== null && index === 0).catch(() => undefined),
      ),
    ).then((results) => {
      if (cancelled) return
      const items = results.filter((item): item is Drawn => item !== undefined)
      setLoaded({ key, items })
    })
    return () => {
      cancelled = true
    }
  }, [automated, backgroundId, overlayKey, key])

  if (automated) return null
  const drawn = loaded?.key === key ? loaded.items : []
  if (drawn.length === 0) return null
  return (
    <>
      {drawn.map((item) => (
        <Fragment key={item.sourceId}>
          <Source id={item.sourceId} {...item.source} />
          <Layer
            {...item.layer}
            beforeId={belowOsm}
            paint={item.background ? { 'raster-brightness-max': brightness } : undefined}
          />
        </Fragment>
      ))}
      {/* the app turns MapLibre's attribution off; this shows the imagery's own, only while some is drawn */}
      <AttributionControl compact position="bottom-right" />
    </>
  )
}
