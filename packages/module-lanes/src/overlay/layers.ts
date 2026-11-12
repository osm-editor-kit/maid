/**
 * The lane bands on the map as data: the GeoJSON features of a road's bands (scene-bands.ts) and the layers that draw
 * them. Pure: the tests read them, LanesOnMap.tsx turns them into MapLibre layers.
 *
 * Each band is the way's line, moved sideways with `line-offset` and as wide as the lane with `line-width`. Both are in
 * metres on the ground, so they are turned into pixels by zoom: a feature carries its metres and the pixels per metre
 * at zoom 16 for its latitude, and the layer doubles that per zoom level (`interpolate` with `exponential 2` between
 * zoom 16 and 24 gives exactly `value * 2^(zoom - 16)`). The parking sides (module-parking layers.ts `sideOffset`) use
 * fixed pixel stops for Berlin's latitude; a lane band has to sit on the aerial image's lane, so it takes the latitude.
 *
 * A positive `line-offset` is right of the line's drawing direction, negative left, as the band's `offsetMetres`.
 */
import type { LaneBand, LaneBandKind } from './scene-bands.ts'

export const LANES_SOURCE = 'maid-lanes-bands'
/** The bands show from here: below it a lane is a few pixels wide and the road's own drawing says more */
export const LANES_MIN_ZOOM = 17

/** A JSON expression of the style spec. The types live in maplibre-gl, which this package does not depend on. */
export type Expression = readonly unknown[]

export type LanesLayer = {
  id: string
  type: 'line'
  minzoom: number
  filter?: Expression
  paint: Record<string, unknown>
  layout?: Record<string, unknown>
}

export type BandFocus = 'hovered' | 'chosen' | 'none'

export type BandProperties = {
  slotId: string
  kind: LaneBandKind
  direction: LaneBand['direction']
  index: number
  offsetMetres: number
  widthMetres: number
  /** Pixels per metre at zoom 16 at the way's latitude */
  pxPerMetre16: number
  focus: BandFocus
  turn?: string
}

export type BandFeature = {
  type: 'Feature'
  id?: number
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  properties: BandProperties
}

export type BandCollection = { type: 'FeatureCollection'; features: BandFeature[] }

export const EMPTY_BANDS: BandCollection = { type: 'FeatureCollection', features: [] }

/** MapLibre's world is 512 px wide at zoom 0 */
const WORLD_PX_AT_16 = 512 * 2 ** 16
const EARTH_CIRCUMFERENCE_M = 40_075_016.686

/** Pixels per metre on the ground at zoom 16 and a latitude (Web Mercator) */
export function pxPerMetreAt16(latitude: number): number {
  return WORLD_PX_AT_16 / (EARTH_CIRCUMFERENCE_M * Math.cos((latitude * Math.PI) / 180))
}

/** The latitude in the middle of the line's extent */
function middleLatitude(coordinates: readonly [number, number][]): number {
  let min = Infinity
  let max = -Infinity
  for (const [, lat] of coordinates) {
    if (lat < min) min = lat
    if (lat > max) max = lat
  }
  return (min + max) / 2
}

/** The band features of one way: its line once per band, with the focus of `laneFocus` */
export function bandFeatures(
  bands: readonly LaneBand[],
  coordinates: [number, number][],
  focus: { hovered: string | null; chosen: string | null },
): BandCollection {
  if (coordinates.length < 2 || bands.length === 0) return EMPTY_BANDS
  const pxPerMetre16 = pxPerMetreAt16(middleLatitude(coordinates))
  return {
    type: 'FeatureCollection',
    features: bands.map((band) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        slotId: band.slotId,
        kind: band.kind,
        direction: band.direction,
        index: band.index,
        offsetMetres: band.offsetMetres,
        widthMetres: band.widthMetres,
        pxPerMetre16,
        // chosen wins over hovered: the chosen band keeps its blue while the pointer is on it
        focus:
          band.slotId === focus.chosen
            ? 'chosen'
            : band.slotId === focus.hovered
              ? 'hovered'
              : 'none',
        ...(band.turn === undefined ? {} : { turn: band.turn }),
      },
    })),
  }
}

/**
 * Metres of the feature property `key` in pixels by zoom, plus `addPx` pixels, at least `minPx` when given. Exact at
 * every zoom from 16 on: the exponential curve between 16 and 24 is `v16 * 2^(zoom - 16)`, and a constant added at both
 * stops stays constant. The zoom curve has to be the outermost expression (a style spec rule), so the minimum sits in
 * its stops.
 */
export function metresToPx(
  key: 'offsetMetres' | 'widthMetres',
  addPx = 0,
  minPx?: number,
): Expression {
  const at16: Expression = ['*', ['get', key], ['get', 'pxPerMetre16']]
  const stop = (scale: number): Expression => {
    const px: Expression = ['+', scale === 1 ? at16 : ['*', at16, scale], addPx]
    return minPx === undefined ? px : ['max', minPx, px]
  }
  return ['interpolate', ['exponential', 2], ['zoom'], 16, stop(1), 24, stop(2 ** 8)]
}

/** The colours by kind. Hovered and chosen are the colours of the focus in the diagram and table */
export const BAND_COLOURS: Record<LaneBandKind | 'hovered' | 'chosen', string> = {
  car: '#71717a',
  bus: '#b91c1c',
  bicycle: '#15803d',
  other: '#7c3aed',
  hovered: '#f59e0b',
  chosen: '#2563eb',
}
const CHOSEN_OUTLINE = '#1e3a8a'

const bandColour: Expression = [
  'match',
  ['get', 'focus'],
  'hovered',
  BAND_COLOURS.hovered,
  'chosen',
  BAND_COLOURS.chosen,
  [
    'match',
    ['get', 'kind'],
    'bus',
    BAND_COLOURS.bus,
    'bicycle',
    BAND_COLOURS.bicycle,
    'other',
    BAND_COLOURS.other,
    BAND_COLOURS.car,
  ],
]

/** The gap between two bands in px, through which the road below shows as a thin separator */
export const BAND_GAP_PX = 1.5

export const LANES_LAYERS: readonly LanesLayer[] = [
  {
    // the chosen band 2 px wider on each edge, under it: it reads as wider without moving its neighbours
    id: 'maid-lanes-chosen-outline',
    type: 'line',
    minzoom: LANES_MIN_ZOOM,
    filter: ['==', ['get', 'focus'], 'chosen'],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': CHOSEN_OUTLINE,
      'line-width': metresToPx('widthMetres', 4),
      'line-offset': metresToPx('offsetMetres'),
    },
  },
  {
    id: 'maid-lanes-bands',
    type: 'line',
    minzoom: LANES_MIN_ZOOM,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': bandColour,
      // see-through, so that the markings of the aerial image show under the bands
      'line-opacity': ['match', ['get', 'focus'], 'none', 0.55, 0.85],
      'line-width': metresToPx('widthMetres', -BAND_GAP_PX, 1),
      'line-offset': metresToPx('offsetMetres'),
    },
  },
]
