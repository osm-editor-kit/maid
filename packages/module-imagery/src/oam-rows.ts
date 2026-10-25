/**
 * The pure parts of the panel's OpenAerialMap rows: what a row shows of an image, and the search. No React, no
 * MapLibre and no network, so the tests run without a browser. `ImageryPanel.tsx` uses them.
 */
import type { OamLayer } from '@osm-editor-kit/maplibre-editor-layer-index/oam'
import { everyWordIn } from './helpers.ts'
import { layerLinks, type LayerLink } from './panel-rows.ts'

/**
 * The image's page in HOT's STAC Browser, made from its item URL (`…/stac/collections/…` →
 * `…/browser/stac/collections/…`). Undefined for an item URL of another shape (a mock server).
 */
export function oamItemPage(itemUrl: string) {
  const page = itemUrl.replace('/stac/collections/', '/browser/stac/collections/')
  return page === itemUrl ? undefined : page
}

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

/** One image as a row; `on` are the overlays drawn now */
export function oamRow(layer: OamLayer, on: readonly string[]): OamRow {
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
    attributionText: layer.attributionText,
    // the attribution of an image is its own page in the catalogue (provider, licence, capture), not OAM's home page
    links: layerLinks({
      attributionUrl: oamItemPage(layer.oam.itemUrl),
      licenseUrl: layer.licenseUrl,
    }),
    selected: on.includes(layer.id),
  }
}

/**
 * The rows of the images in view, in the order the API gives them (newest first). The images that are on now come
 * first when they are not among them: they stay listed out of view, as chosen overlays do. Search matches the name,
 * the provider and the date.
 */
export function oamRows(
  inView: readonly OamLayer[],
  onLayers: readonly OamLayer[],
  on: readonly string[],
  query: string,
) {
  const outOfView = onLayers.filter((layer) => !inView.some((item) => item.id === layer.id))
  return [...outOfView, ...inView]
    .map((layer) => oamRow(layer, on))
    .filter((row) =>
      everyWordIn(`${row.name} ${row.provider ?? ''} ${row.date ?? ''} OpenAerialMap`, query),
    )
}
