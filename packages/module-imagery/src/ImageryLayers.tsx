import { isAutomated, isLocalUrl, toOsmZoom } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import { useQueries, type QueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useMemo } from 'react'
import { AttributionControl, Layer, Source, useMap } from 'react-map-gl/maplibre'
import { drawCustom } from './custom.ts'
import { drawLayer, type Drawn } from './eli.ts'
import { useImageryActions, useImageryContext, useView, type Shown } from './imagery-store.ts'
import { oamDrawQuery } from './oam.ts'
import { useCannotShift } from './offset-protocol.ts'
import { isZeroOffset, metersToUnits, NO_OFFSET, shiftedTileUrl, type Meters } from './offset.ts'
import {
  useImageryStart,
  useLiveBrightness,
  useLiveImagery,
  useMirrorBrightness,
  useMirrorShown,
  useSwitchOnMove,
} from './shown.ts'
import { isOamValue, NONE, templateOf } from './url.ts'

/**
 * One layer to draw: an index layer (ELI, `template` null), an OpenAerialMap image (`oam:<item id>`, `template` null)
 * or a custom background from its template
 */
type Wanted = { id: string; background: boolean; template: string | null }

/** A layer's source as the layer index gives it (the type of `Drawn.source`) */
type RasterSource = Drawn['source']

/**
 * The background's source with its tiles shifted: the same source, with each tile URL wrapped for the offset protocol
 * (offset.ts, offset-protocol.ts). The wrapped source is `xyz`: the protocol gets the tms flip with the tile.
 */
function shiftedSource(source: RasterSource, offset: Meters, key: string): RasterSource {
  const { scheme, ...rest } = source
  const units = metersToUnits(offset)
  return {
    ...rest,
    tiles: source.tiles.map((template) =>
      shiftedTileUrl({ template, units, tileSize: source.tileSize, tms: scheme === 'tms', key }),
    ),
  }
}

/**
 * Under an automated browser (AGENTS.md, core rule 1) only a background from a local template is drawn: the one a
 * `bg=custom:` link names when it points at this machine (the browser checks serve their own tiles). The
 * layers of the index and the overlays stay off. The gate of the requests (`packages/core/src/fetching/remote-fetch.ts`)
 * lets local hosts through too.
 */
function allowedUnderAutomation(wanted: Wanted) {
  return wanted.template !== null && isLocalUrl(wanted.template)
}

/**
 * The query of one drawn layer. The work is local (the layer index is bundled with the app), so the
 * result is kept for the session. Not retried: a draw that fails fails the same way again. `null` for a
 * layer that is unknown or needs a key, because a query's data cannot be `undefined`. An OpenAerialMap image is
 * the one draw that asks a server (its item, once); the answer is kept for the session too.
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
  if (isOamValue(id)) return oamDrawQuery(id, background)
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
 * It also runs the start order once the map has a view (shown.ts), switches the background when the map moves out of its
 * coverage, and mirrors what is shown.
 */
export function ImageryLayers(props: { belowOsm: string }) {
  const { belowOsm } = props
  const map = useMap().current
  const { shown } = useLiveImagery()
  // the URL's brightness (`bg_display`), written here: this is the one instance of the module that writes it
  const { brightness } = useLiveBrightness(true)
  const { urls } = useImageryContext()
  const [urlOffset] = useUrlParam(urls.offset)
  const offset = urlOffset ?? NO_OFFSET
  // a background whose server refuses the canvas is drawn unshifted (offset-protocol.ts)
  const cannotShift = useCannotShift(shown.background)
  const view = useView()
  const { setView } = useImageryActions()
  const automated = isAutomated()

  useImageryStart(view)
  useSwitchOnMove(view)
  useMirrorShown(shown)
  useMirrorBrightness(brightness)
  // the shift of the background: none with no offset (the plain tile URLs cost nothing), none where it cannot be drawn
  const shifted = !isZeroOffset(offset) && !cannotShift

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

  // the background's tile URLs change with the offset only. Built here, not in the render, a render that changes
  // nothing would hand react-map-gl new tile URLs and every tile would be requested again.
  const [east, north] = offset
  const layers = useMemo(
    () =>
      items.map((item) =>
        item.background && shifted
          ? { ...item, source: shiftedSource(item.source, [east, north], shown.background) }
          : item,
      ),
    [items, shifted, east, north, shown.background],
  )

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

  if (layers.length === 0) return null
  return (
    <>
      {/* only the background is shifted (see `layers`): the overlays keep their own tiles, as in iD */}
      {layers.map((item) => (
        <Fragment key={item.sourceId}>
          <Source id={item.sourceId} {...item.source} />
          {/* the paint the index gives stays; a background adds the brightness to it (never `paint` undefined over it) */}
          <Layer
            {...item.layer}
            beforeId={belowOsm}
            paint={
              item.background
                ? { ...item.layer.paint, 'raster-brightness-max': brightness }
                : item.layer.paint
            }
          />
        </Fragment>
      ))}
      {/* the app turns MapLibre's attribution off; this shows the imagery's own, only while some is drawn */}
      <AttributionControl compact position="bottom-right" />
      <CollapseAttributionOnMount />
    </>
  )
}

/**
 * Starts the compact attribution closed, as the "i" button. MapLibre's `compact` opens it (`.maplibregl-compact-show`)
 * when the first attribution text arrives and has no option to start closed (maplibre-gl-js#7426). After the control is
 * mounted (this is its sibling, so its effect runs after `useControl`), the class is removed once, right away or, while
 * the attribution is still empty, as soon as MapLibre adds `.maplibregl-compact`. A click still opens it, a pan still
 * closes it. The FMC pattern of tilda-geo and osmcha (react-map-gl skill, map-props-attribution-locale.md).
 */
function CollapseAttributionOnMount() {
  const { current: map } = useMap()
  useEffect(
    function collapseTheAttribution() {
      const attribution = map?.getMap().getContainer().querySelector('.maplibregl-ctrl-attrib')
      if (!attribution) return
      const collapse = () => {
        if (!attribution.classList.contains('maplibregl-compact')) return false
        attribution.classList.remove('maplibregl-compact-show')
        return true
      }
      if (collapse()) return
      const observer = new MutationObserver(() => {
        if (collapse()) observer.disconnect()
      })
      observer.observe(attribution, { attributeFilter: ['class'] })
      return () => observer.disconnect()
    },
    [map],
  )
  return null
}
