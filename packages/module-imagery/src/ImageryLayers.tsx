import { isAutomated } from '@osm-editor-kit/maid-core'
import { useQueries, type UseQueryResult } from '@tanstack/react-query'
import { Fragment, useEffect } from 'react'
import { AttributionControl, Layer, Source, useMap } from 'react-map-gl/maplibre'
import { useStore } from 'zustand'
import { drawCustom } from './custom.ts'
import { drawLayer, type Drawn } from './eli.ts'
import { toOsmZoom } from './helpers.ts'
import { backgroundKeyOf, shownBackgroundId, shownTemplate, type ImageryStore } from './store.ts'

/** One layer to draw: an index layer (ELI, `template` null) or a custom background from its template */
type Wanted = { id: string; background: boolean; template: string | null }

/**
 * The query of one drawn layer. The work is local (the layer index is bundled with the app), so the
 * result is kept for the session. Not retried: a draw that fails fails the same way again. `null` for a
 * layer that is unknown or needs a key, because a query's data cannot be `undefined`.
 */
function drawQuery(wanted: Wanted, dpr: number) {
  if (wanted.template !== null) {
    const { id, template } = wanted
    return {
      queryKey: ['imagery', 'custom', id, template, dpr] as const,
      queryFn: () => drawCustom(id, template, true, dpr) ?? null,
    }
  }
  const { id, background } = wanted
  return {
    queryKey: ['imagery', 'layer', id, background] as const,
    queryFn: async () => (await drawLayer(id, background)) ?? null,
  }
}

/** The drawn layers in order (the background first, so the overlays draw above it), and whether every draw has settled */
function combineDrawn(results: readonly UseQueryResult<Drawn | null, Error>[]) {
  const items: Drawn[] = []
  for (const result of results) if (result.data) items.push(result.data)
  return { items, settled: results.every((result) => !result.isPending) }
}

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

  // the background is first, so the overlays are drawn above it
  const overlays = overlayKey === '' ? [] : overlayKey.split('\n')
  const wanted: Wanted[] = []
  if (backgroundId !== null) wanted.push({ id: backgroundId, background: true, template })
  for (const id of overlays) wanted.push({ id, background: false, template: null })
  const dpr = window.devicePixelRatio
  const { items, settled } = useQueries({
    queries: wanted.map((layer) => ({
      ...drawQuery(layer, dpr),
      enabled: !automated,
      staleTime: Infinity,
      retry: false,
    })),
    combine: combineDrawn,
  })

  // a child of the map, so react-map-gl gives it no prop for moveend: it listens here, for the panel's view
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

  // the names of what is drawn (the measure and the changeset cite them, usedNames) and the background
  // alone (the measure's magnifier, backgroundOnMap): written to the store once every draw has settled.
  // The store is outside React's data, so this is an effect, not a derivation.
  useEffect(() => {
    if (!settled || (backgroundId === null && overlayKey === '')) return
    remember(Object.fromEntries(items.map((item) => [item.id, item.name])))
    const background = items.find((item) => item.background)
    rememberBackground(
      background
        ? { key: backgroundKeyOf(backgroundId, template), source: background.source }
        : null,
    )
  }, [items, settled, backgroundId, overlayKey, template, remember, rememberBackground])

  if (automated || items.length === 0) return null
  return (
    <>
      {items.map((item) => (
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
