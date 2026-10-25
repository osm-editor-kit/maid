/**
 * The pure parts of the panel's OpenAerialMap rows: what a row shows of an image, and the search. No React, no
 * MapLibre and no network, so the tests run without a browser. `ImageryPanel.tsx` uses them.
 */
import type { OamLayer } from '@osm-editor-kit/maplibre-editor-layer-index/oam'
import { everyWordIn } from './helpers.ts'
import { layerLinks, type LayerLink } from './panel-rows.ts'

/** One image of the list, as the panel shows it */
export type OamRow = {
  /** The background value, `oam:<item id>` */
  id: string
  name: string
  /** The capture date, `YYYY-MM-DD` */
  date?: string
  provider?: string
  /** For example `uav`, as the API gives it */
  platform?: string
  /** `4.5 cm/px`, `1.2 m/px` */
  resolution?: string
  /** `6,638 m²`, `1.4 km²` */
  area?: string
  thumbnailUrl?: string
  attributionText: string
  links: LayerLink[]
  selected: boolean
}

/** The ground sample distance for people: centimeters below one meter, one decimal where it says something */
export function resolutionText(gsd: number | undefined) {
  if (gsd === undefined || !(gsd > 0)) return undefined
  if (gsd < 1) {
    const cm = gsd * 100
    return `${cm < 10 ? Math.round(cm * 10) / 10 : Math.round(cm)} cm/px`
  }
  return `${Math.round(gsd * 10) / 10} m/px`
}

/** The area of a footprint for people: square meters below a tenth of a square kilometer */
export function areaText(squareMeters: number | undefined) {
  if (squareMeters === undefined || !(squareMeters > 0)) return undefined
  if (squareMeters < 100_000) return `${Math.round(squareMeters).toLocaleString('en')} m²`
  return `${(Math.round(squareMeters / 100_000) / 10).toLocaleString('en')} km²`
}

/** One image as a row; `shownId` is the background shown now */
export function oamRow(layer: OamLayer, shownId: string): OamRow {
  const resolution = resolutionText(layer.oam.gsd)
  const area = areaText(layer.oam.footprintArea)
  return {
    id: layer.id,
    name: layer.name,
    ...(layer.startDate ? { date: layer.startDate } : {}),
    ...(layer.oam.provider ? { provider: layer.oam.provider } : {}),
    ...(layer.oam.platform ? { platform: layer.oam.platform } : {}),
    ...(resolution ? { resolution } : {}),
    ...(area ? { area } : {}),
    ...(layer.oam.thumbnailUrl ? { thumbnailUrl: layer.oam.thumbnailUrl } : {}),
    attributionText: layer.attributionText,
    links: layerLinks(layer),
    selected: layer.id === shownId,
  }
}

/**
 * The rows of the images in view, in the order the API gives them (newest first), with the shown image first when it
 * is not among them (it stays listed, as a chosen overlay does). Search matches the name, the provider and the date.
 */
export function oamRows(
  inView: readonly OamLayer[],
  shown: OamLayer | undefined,
  shownId: string,
  query: string,
) {
  const layers =
    shown && !inView.some((layer) => layer.id === shown.id) ? [shown, ...inView] : inView
  return layers
    .map((layer) => oamRow(layer, shownId))
    .filter((row) =>
      everyWordIn(`${row.name} ${row.provider ?? ''} ${row.date ?? ''} OpenAerialMap`, query),
    )
}
