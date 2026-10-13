import { isAutomated } from '@osm-editor-kit/maid-core'
import { Fragment, useEffect, useState } from 'react'
import { AttributionControl, Layer, Source, useMap } from 'react-map-gl/maplibre'
import { useStore } from 'zustand'
import { drawCustom } from './custom.ts'
import { drawLayer, type Drawn } from './eli.ts'
import { toOsmZoom } from './helpers.ts'
import { backgroundKeyOf, shownBackgroundId, shownTemplate, type ImageryStore } from './store.ts'

/**
 * Draws the chosen background and overlays under the OSM data (`belowOsm`), and keeps the store
 * up to date with the viewport for the panel. It is part of the map, so it must be rendered inside
 * the map. Nothing is loaded until a background or an overlay is chosen, and nothing at all in an
 * automated browser.
 */
export function ImageryLayers(props: { store: ImageryStore; belowOsm: string }) {
  const { store, belowOsm } = props
  const map = useMap().current
  // the background that is shown: the stored choice, or a link's for this visit (see the store)
  const backgroundId = useStore(store, (s) => shownBackgroundId(s))
  // the template when the background is a custom one (or a link's); null for an index layer
  const template = useStore(store, (s) => shownTemplate(s))
  const overlayKey = useStore(store, (s) => s.overlayIds.join('\n'))
  const brightness = useStore(store, (s) => s.brightness)
  const setView = useStore(store, (s) => s.setView)
  const remember = useStore(store, (s) => s.remember)
  const rememberBackground = useStore(store, (s) => s.rememberBackground)
  const automated = isAutomated()

  // what is drawn, keyed by what was chosen: a result for an older choice is not shown
  const key = `${backgroundId ?? ''}\n${template ?? ''}\n${overlayKey}`
  const [loaded, setLoaded] = useState<{ key: string; items: Drawn[] } | null>(null)

  useEffect(() => {
    if (!map) return
    const track = () => {
      const bounds = map.getBounds()
      setView({
        bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        // MapLibre zoom (512 px) to OSM zoom (256 px), the convention of ELI's minzoom
        zoom: toOsmZoom(map.getZoom()),
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
    if (backgroundId === null && overlays.length === 0) return
    let cancelled = false
    // the background is first, so the overlays are drawn above it. A custom background is drawn
    // from its template, an index layer from ELI; each draw catches its own failure
    const jobs: Promise<Drawn | undefined>[] = []
    if (backgroundId !== null) {
      jobs.push(
        template === null
          ? drawLayer(backgroundId, true)
          : Promise.resolve(drawCustom(backgroundId, template, true, window.devicePixelRatio)),
      )
    }
    for (const id of overlays) jobs.push(drawLayer(id, false))
    void Promise.all(jobs.map((job) => job.catch(() => undefined))).then((results) => {
      if (cancelled) return
      const items = results.filter((item): item is Drawn => item !== undefined)
      // the names of what is drawn now: the measure and the changeset cite them (usedNames)
      remember(Object.fromEntries(items.map((item) => [item.id, item.name])))
      // the background alone, for the measure's magnifier (backgroundOnMap); its key says which choice it is
      const background = items.find((item) => item.background)
      rememberBackground(
        background
          ? { key: backgroundKeyOf(backgroundId, template), source: background.source }
          : null,
      )
      setLoaded({ key, items })
    })
    return () => {
      cancelled = true
    }
  }, [automated, backgroundId, template, overlayKey, key, remember, rememberBackground])

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
