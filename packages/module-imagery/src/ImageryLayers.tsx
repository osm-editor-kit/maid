import { isAutomated, isLocalUrl, toOsmZoom } from '@osm-editor-kit/maid-core'
import { useQueries, type QueryClient } from '@tanstack/react-query'
import { Fragment, useEffect } from 'react'
import { AttributionControl, Layer, Source, useMap } from 'react-map-gl/maplibre'
import { drawCustom } from './custom.ts'
import { drawLayer, type Drawn } from './eli.ts'
import { useBrightness, useImageryActions, useView, type Shown } from './imagery-store.ts'
import { useImageryStart, useLiveImagery, useMirrorShown } from './shown.ts'
import { NONE, templateOf } from './url.ts'

/** One layer to draw: an index layer (ELI, `template` null) or a custom background from its template */
type Wanted = { id: string; background: boolean; template: string | null }

/**
 * Under an automated browser (AGENTS.md, core rule 1) only a background from a local template is drawn: the one a
 * `background=custom:` link names when it points at this machine (the browser checks serve their own tiles). The
 * layers of the index and the overlays stay off. The gate of the requests (`packages/core/src/fetching/remote-fetch.ts`)
 * lets local hosts through too.
 */
function allowedUnderAutomation(wanted: Wanted) {
  return wanted.template !== null && isLocalUrl(wanted.template)
}

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

/** The drawn layers in order (the background first, so the overlays draw above it) */
function drawnItems(results: readonly { data: Drawn | null | undefined }[]) {
  const items: Drawn[] = []
  for (const result of results) if (result.data) items.push(result.data)
  return items
}

/**
 * What a choice draws, read from the query cache: the background (undefined with none chosen, or
 * while it is not drawn yet) and the overlays that are drawn. The names and sources live there,
 * not in the store: they are results of the draws.
 */
export function drawnShown(queries: QueryClient, shown: Shown) {
  // the device pixel ratio is part of a custom draw's key; the read and the draw use the same value
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio
  const read = (wanted: Wanted) =>
    queries.getQueryData<Drawn | null>(drawQuery(wanted, dpr).queryKey) ?? undefined
  const background =
    shown.background === NONE
      ? undefined
      : read({ id: shown.background, background: true, template: templateOf(shown.background) })
  const overlays = shown.overlays.flatMap((id) => {
    const drawn = read({ id, background: false, template: null })
    return drawn ? [drawn] : []
  })
  return { background, overlays }
}

/**
 * Draws the chosen background and overlays under the OSM data (`belowOsm`). It is part of the map,
 * so it must be rendered inside the map. Nothing is loaded until a background or an overlay is
 * chosen, and in an automated browser only a background from a local template (see `allowedUnderAutomation`).
 * It also runs the start order once the map has a view (shown.ts), and mirrors what is shown.
 */
export function ImageryLayers(props: { belowOsm: string }) {
  const { belowOsm } = props
  const map = useMap().current
  const { shown } = useLiveImagery()
  const brightness = useBrightness()
  const view = useView()
  const { setView } = useImageryActions()
  const automated = isAutomated()

  useImageryStart(view)
  useMirrorShown(shown)

  // the background is first, so the overlays are drawn above it
  const wanted: Wanted[] = []
  if (shown.background !== NONE) {
    wanted.push({ id: shown.background, background: true, template: templateOf(shown.background) })
  }
  for (const id of shown.overlays) wanted.push({ id, background: false, template: null })
  const dpr = window.devicePixelRatio
  const items = useQueries({
    queries: wanted.map((layer) => ({
      ...drawQuery(layer, dpr),
      enabled: !automated || allowedUnderAutomation(layer),
      staleTime: Infinity,
      retry: false,
    })),
    combine: drawnItems,
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

  if (items.length === 0) return null
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
