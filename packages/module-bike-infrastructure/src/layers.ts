/**
 * The layers of the bicycle infrastructure, as data (BikeInfraOnMap turns each into a MapLibre layer). Pure: the tests
 * read them.
 *
 * - Centre line (`self`): the way's own infrastructure (a cycleway, a footway where bicycles are allowed, a bicycle
 *   road) as a line on top of the way, in the colour of its group (groups.ts) over a thin white casing, so it reads on
 *   iD's road colours and on aerial imagery.
 * - Road sides (`left`, `right`): a lane, track or sidewalk that is tagged on the road, a thinner line without casing
 *   right at the edge of the road as drawn, so it reads as part of the road (Tobias, 2026-11-11: it looked like a
 *   separately mapped way); a sidewalk just outside the cycleway of the same side.
 * - Sidepath (`_adjoining`): two thin lines in its colour along the path, a kerb on each side, so a path that runs along a road
 *   can be told from one on its own (`_isolated`) and from one where TILDA cannot tell (`_adjoiningOrIsolated`).
 * - Separately mapped (`cycleway:<side>=separate`): a thin dotted blue line at the side of the road.
 * - Traffic signs: the sign's image (the signs of the traffic sign field), at the middle of the part, turned with the
 *   line, from zoom 18.
 *
 * MapLibre's `line-offset`: a positive value is to the right of the line's direction, a negative to the left.
 */
export const BIKE_SOURCE = 'bike-infrastructure'
export const BIKE_SIGN_SOURCE = 'bike-infrastructure-signs'
/** OSM zoom 16, the load zoom of the editor (renderer layers.ts DETAIL_ZOOM), as MapLibre counts it */
export const BIKE_MIN_ZOOM = 15
/** The signs come later: at zoom 16 they would cover the lines */
export const SIGN_MIN_ZOOM = 17

/** A JSON expression of the style spec. The types live in maplibre-gl, which this package does not depend on. */
export type Expression = readonly unknown[]

export type BikeLayer = {
  id: string
  type: 'line' | 'symbol'
  source: string
  minzoom: number
  filter: Expression
  paint?: Record<string, unknown>
  layout?: Record<string, unknown>
}

const kindIs = (kind: string): Expression => ['==', ['get', 'kind'], kind]
const sideIs = (side: string): Expression => ['==', ['get', 'side'], side]
const isDashed: Expression = ['==', ['get', 'dashed'], true]
const notDashed: Expression = ['!=', ['get', 'dashed'], true]

/** Width of an infrastructure line in px */
export const LINE_WIDTH: Expression = [
  'interpolate',
  ['linear'],
  ['zoom'],
  15,
  2.5,
  17,
  3.5,
  19,
  5.5,
  22,
  8,
]
/** The white casing under it: 1.5 px on each edge */
export const CASING_WIDTH: Expression = [
  'interpolate',
  ['linear'],
  ['zoom'],
  15,
  5.5,
  17,
  6.5,
  19,
  8.5,
  22,
  11,
]

/** Width of a road side's line in px: thinner than a way of its own, and without the white casing */
export const SIDE_WIDTH: Expression = ['step', ['zoom'], 2, 16, 3]

/**
 * Offset of a road side from the centre line in px, `sign` 1 for the right side and -1 for the left: right at the edge
 * of the road as the editor draws it (its casing, `road` and `roadLow` of the feature; iD draws roads in px, not on the
 * ground), so the line reads as part of the road and not as a separately mapped way. `extra` moves a sidewalk further
 * out, past the cycleway of the same side. MapLibre zoom 16 is OSM zoom 17, where iD's wider road style starts.
 */
export function sideOffset(sign: 1 | -1, extra = 0): Expression {
  const at = (road: string, half: number): Expression => [
    '*',
    sign,
    ['+', ['/', ['coalesce', ['get', road], 10], 2], half + extra],
  ]
  return ['step', ['zoom'], at('roadLow', 1), 16, at('road', 1.5)]
}

/** The offset of a feature: none on the centre line, else by its side and prefix */
function offsetOf(side: 'self' | 'left' | 'right', prefix: 'cycleway' | 'sidewalk') {
  if (side === 'self') return 0
  return sideOffset(side === 'right' ? 1 : -1, prefix === 'sidewalk' ? 3.5 : 0)
}

/** Construction and other lifecycles are drawn lighter */
const OPACITY: Expression = ['case', ['has', 'lifecycle'], 0.45, 1]

/** The parts of a way: the centre line, and each side with its prefix */
const PARTS = [
  { side: 'self', prefix: 'cycleway' },
  { side: 'left', prefix: 'cycleway' },
  { side: 'left', prefix: 'sidewalk' },
  { side: 'right', prefix: 'cycleway' },
  { side: 'right', prefix: 'sidewalk' },
] as const

function partFilter(part: (typeof PARTS)[number]): Expression {
  if (part.side === 'self') return sideIs('self')
  const prefix: Expression =
    part.prefix === 'sidewalk'
      ? ['==', ['get', 'prefix'], 'sidewalk']
      : ['!=', ['get', 'prefix'], 'sidewalk']
  return ['all', sideIs(part.side), prefix]
}

const partId = (part: (typeof PARTS)[number]) =>
  part.side === 'self' ? 'self' : `${part.side}-${part.prefix}`

/** A kerb line of a sidepath, `sign` 1 on the right: just outside the casing */
function kerbOffset(sign: 1 | -1): Expression {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    15,
    sign * 4,
    17,
    sign * 5,
    19,
    sign * 6,
    22,
    sign * 8,
  ]
}

export const BIKE_LAYERS: readonly BikeLayer[] = [
  // the separately mapped sides: a thin dotted line, under everything else
  ...(['left', 'right'] as const).map((side): BikeLayer => ({
    id: `bike-separate-${side}`,
    type: 'line',
    source: BIKE_SOURCE,
    minzoom: BIKE_MIN_ZOOM,
    filter: ['all', kindIs('separate'), sideIs(side)],
    paint: {
      'line-color': '#174ed9',
      'line-width': 1.5,
      'line-dasharray': [1, 2],
      'line-offset': sideOffset(side === 'right' ? 1 : -1),
    },
  })),
  // the sidepath kerbs, under the casing of the line
  ...([1, -1] as const).map((sign): BikeLayer => ({
    id: `bike-sidepath-${sign === 1 ? 'right' : 'left'}`,
    type: 'line',
    source: BIKE_SOURCE,
    minzoom: BIKE_MIN_ZOOM,
    filter: ['all', kindIs('infra'), sideIs('self'), ['==', ['get', 'sidepath'], 'yes']],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'colour'],
      'line-width': 1.5,
      'line-offset': kerbOffset(sign),
      'line-opacity': OPACITY,
    },
  })),
  ...PARTS.flatMap((part): BikeLayer[] => {
    const offset = offsetOf(part.side, part.prefix)
    const filter = ['all', kindIs('infra'), partFilter(part)]
    const layout = { 'line-join': 'round', 'line-cap': 'butt' }
    // a road side has no casing and a thinner line: it belongs to the road (see sideOffset)
    const self = part.side === 'self'
    const width = self ? LINE_WIDTH : SIDE_WIDTH
    const casing: BikeLayer[] = [
      {
        id: `bike-${partId(part)}-casing`,
        type: 'line',
        source: BIKE_SOURCE,
        minzoom: BIKE_MIN_ZOOM,
        filter,
        layout,
        paint: {
          'line-color': '#ffffff',
          'line-width': CASING_WIDTH,
          'line-offset': offset,
          'line-opacity': ['*', 0.85, OPACITY],
        },
      },
    ]
    return [
      ...(self ? casing : []),
      {
        id: `bike-${partId(part)}`,
        type: 'line',
        source: BIKE_SOURCE,
        minzoom: BIKE_MIN_ZOOM,
        filter: [...filter, notDashed],
        layout,
        paint: {
          'line-color': ['get', 'colour'],
          'line-width': width,
          'line-offset': offset,
          'line-opacity': OPACITY,
        },
      },
      {
        id: `bike-${partId(part)}-dashed`,
        type: 'line',
        source: BIKE_SOURCE,
        minzoom: BIKE_MIN_ZOOM,
        filter: [...filter, isDashed],
        layout,
        paint: {
          'line-color': ['get', 'colour'],
          'line-width': width,
          'line-offset': offset,
          'line-opacity': OPACITY,
          'line-dasharray': [2, 1.5],
        },
      },
    ]
  }),
]

/** The traffic signs: one image per sign value (the main sign above its additional signs), turned with the line */
export const SIGN_LAYER: BikeLayer = {
  id: 'bike-signs',
  type: 'symbol',
  source: BIKE_SIGN_SOURCE,
  minzoom: SIGN_MIN_ZOOM,
  filter: ['has', 'image'],
  layout: {
    'icon-image': ['get', 'image'],
    'icon-rotate': ['get', 'rotate'],
    'icon-rotation-alignment': 'map',
    // the image's own size at every zoom: a scaled raster image gets blurred
    'icon-allow-overlap': false,
    'icon-padding': 1,
  },
}
