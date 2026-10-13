/**
 * The layers of the parking map, as data (the component turns each into a MapLibre layer). Pure: the tests read them.
 *
 * Look, from the JOSM style (josm-setup-presets-styles.md 3.1 to 3.3, 4c, 4d):
 * - areas: a strip along the inside of the outline, 3 px in the category colour (warnings 6 px black)
 * - sides: one line per side of a road, offset to that side, in the colour of its category (categories.ts) on a dark
 *   casing. The JOSM style has no side lines; this is Maid's design. A conditional restriction and the gap check are
 *   dashed. Width and offset are chosen against the road as the editor draws it (see SIDE_OFFSET).
 * - obstacles: a black halo, 2.5 / 5 / 10 px at zoom below 20 / 20 / 21 (the JOSM values, radius for points)
 * - lowered kerbs: a line in a colour Maid picks (the JOSM rule only sets a repeat width and no image; decision open)
 * - direction arrows: the arrow image every 100 px on the 11 highway classes, 25 px wide
 *
 * The side offsets are MapLibre's `line-offset`: a positive value is to the right of the line's direction, a negative to
 * the left (the style spec: "a positive value offsets the line to the right, relative to the direction of the line").
 * A way that runs north has its right side to the east.
 */
import { CATEGORIES, CATEGORY_ORDER, type CategoryId } from './categories.ts'

export const PARKING_SOURCE = 'parking-sides'
export const PARKING_ARROW_IMAGE = 'parking-direction-arrow'
/** MapLibre zoom of OSM zoom 16, the load zoom (renderer layers.ts DETAIL_ZOOM); the layers are drawn from here on */
export const PARKING_MIN_ZOOM = 15

/** A JSON expression of the style spec. The types live in maplibre-gl, which this package does not depend on. */
export type Expression = readonly unknown[]

export type ParkingLayer = {
  id: string
  type: 'line' | 'circle' | 'symbol'
  minzoom: number
  filter: Expression
  paint?: Record<string, unknown>
  layout?: Record<string, unknown>
}

const kindIs = (kind: string): Expression => ['==', ['get', 'kind'], kind]
const sideIs = (side: 'left' | 'right'): Expression => ['==', ['get', 'side'], side]
const dashed = (on: boolean): Expression => ['==', ['get', 'dashed'], on]

/** The colour of a feature by its category: the JOSM colours of categories.ts */
const COLOURED: readonly CategoryId[] = [
  ...CATEGORY_ORDER,
  'no_parking_side',
  'parked',
  'not_mapped',
]
export const categoryColour: Expression = [
  'match',
  ['get', 'category'],
  ...COLOURED.flatMap((id) => [id, CATEGORIES[id].colour]),
  CATEGORIES.parked.colour,
]

/** Width of a side line in px: grows with the zoom */
export const SIDE_WIDTH: Expression = [
  'interpolate',
  ['linear'],
  ['zoom'],
  15,
  3,
  17,
  4,
  19,
  6,
  22,
  10,
]
/** The dark casing under a side line: 1 px on each edge, so the light JOSM colours read on a pale, dimmed map */
export const SIDE_CASING_WIDTH: Expression = [
  'interpolate',
  ['linear'],
  ['zoom'],
  15,
  5,
  17,
  6,
  19,
  8,
  22,
  12,
]
const SIDE_CASING_COLOUR = '#1f2937'

/**
 * Offset of a side line from the centre line in px; `sign` 1 is the right side, -1 the left.
 * The editor draws a road in pixels (a residential road is 10 px wide with its casing at every zoom), so up to the
 * zoom where that is wider than the road on the ground the line sits just outside the drawn road: 6 px at the load
 * zoom, 9 px at 17. From 18 on the offset is a distance on the ground, about 2.4 m (13 px at 18, doubling per level):
 * where the parked cars are on the aerial image.
 * An offset that stays inside the drawn road (the first version: 5 px at zoom 17 with a 3 px grey line) is not seen.
 */
export function sideOffset(sign: 1 | -1): Expression {
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    15,
    sign * 6,
    17,
    sign * 9,
    18,
    sign * 13,
    22,
    sign * 208,
  ]
}

/** The obstacle halo: JOSM's symbol-size and width per zoom, as a radius for points (half the size) */
const OBSTACLE_STEP: Expression = ['step', ['zoom'], 2.5, 20, 5, 21, 10]

export const PARKING_LAYERS: readonly ParkingLayer[] = [
  {
    id: 'parking-obstacle-ways',
    type: 'line',
    minzoom: PARKING_MIN_ZOOM,
    filter: ['all', kindIs('obstacle-way')],
    paint: { 'line-color': '#000000', 'line-width': OBSTACLE_STEP },
  },
  {
    id: 'parking-obstacle-nodes',
    type: 'circle',
    minzoom: PARKING_MIN_ZOOM,
    filter: kindIs('obstacle-node'),
    paint: { 'circle-color': '#000000', 'circle-radius': OBSTACLE_STEP },
  },
  {
    id: 'parking-kerbs-lowered',
    type: 'line',
    minzoom: PARKING_MIN_ZOOM,
    filter: kindIs('kerb'),
    paint: {
      'line-color': '#e6007e',
      'line-width': ['interpolate', ['linear'], ['zoom'], 15, 2, 19, 4],
    },
  },
  {
    id: 'parking-areas-right',
    type: 'line',
    minzoom: PARKING_MIN_ZOOM,
    filter: ['all', kindIs('area'), ['==', ['get', 'strip'], 'right']],
    paint: {
      'line-color': categoryColour,
      'line-width': ['match', ['get', 'category'], 'warnings', 6, 3],
      'line-offset': ['match', ['get', 'category'], 'warnings', 3, 1.5],
    },
  },
  {
    id: 'parking-areas-left',
    type: 'line',
    minzoom: PARKING_MIN_ZOOM,
    filter: ['all', kindIs('area'), ['==', ['get', 'strip'], 'left']],
    paint: {
      'line-color': categoryColour,
      'line-width': ['match', ['get', 'category'], 'warnings', 6, 3],
      'line-offset': ['match', ['get', 'category'], 'warnings', -3, -1.5],
    },
  },
  ...(['right', 'left'] as const).flatMap((side): ParkingLayer[] => {
    const offset = sideOffset(side === 'right' ? 1 : -1)
    const layout = { 'line-join': 'round' }
    return [
      {
        id: `parking-sides-${side}-casing`,
        type: 'line',
        minzoom: PARKING_MIN_ZOOM,
        filter: ['all', kindIs('side'), sideIs(side)],
        layout,
        paint: {
          'line-color': SIDE_CASING_COLOUR,
          'line-width': SIDE_CASING_WIDTH,
          'line-offset': offset,
        },
      },
      {
        id: `parking-sides-${side}`,
        type: 'line',
        minzoom: PARKING_MIN_ZOOM,
        filter: ['all', kindIs('side'), sideIs(side), dashed(false)],
        layout,
        paint: { 'line-color': categoryColour, 'line-width': SIDE_WIDTH, 'line-offset': offset },
      },
      {
        id: `parking-sides-${side}-dashed`,
        type: 'line',
        minzoom: PARKING_MIN_ZOOM,
        filter: ['all', kindIs('side'), sideIs(side), dashed(true)],
        layout,
        paint: {
          'line-color': categoryColour,
          'line-width': SIDE_WIDTH,
          'line-offset': offset,
          'line-dasharray': [2, 2],
        },
      },
    ]
  }),
  {
    id: 'parking-direction-arrows',
    type: 'symbol',
    minzoom: PARKING_MIN_ZOOM,
    filter: kindIs('arrow'),
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 100,
      'icon-image': PARKING_ARROW_IMAGE,
      'icon-size': 2.5,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  },
]
