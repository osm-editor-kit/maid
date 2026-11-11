/**
 * The layers of the bicycle infrastructure, as data (BikeInfraOnMap turns each into a MapLibre layer). Pure: the tests
 * read them.
 *
 * - Centre line (`self`): the way's own infrastructure (a cycleway, a footway where bicycles are allowed, a bicycle
 *   road) as a line on top of the way, in the colour of its group (groups.ts) over a thin white casing, so it reads on
 *   iD's road colours and on aerial imagery.
 * - Road sides (`left`, `right`): a lane, track or sidewalk that is tagged on the road, offset to its side as the
 *   parking module draws its sides; a sidewalk further out than the cycleway of the same side.
 * - Sidepath (`_adjoining`): two thin lines in its colour along the path, a kerb on each side, so a path that runs along a road
 *   can be told from one on its own (`_isolated`) and from one where TILDA cannot tell (`_adjoiningOrIsolated`).
 * - Separately mapped (`cycleway:<side>=separate`): a thin dotted blue line at the side of the road.
 * - Traffic signs: the sign's image (the signs of the traffic sign field), at the middle of the part, from zoom 17.
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

/**
 * Offset of a road side from the centre line in px, `sign` 1 for the right side and -1 for the left; `extra` moves a
 * sidewalk further out. As in the parking module: just outside the road as the editor draws it (a residential road is
 * 10 px wide at every zoom) up to zoom 17, from 18 on a distance on the ground of about 2.4 m, doubling per level.
 */
export function sideOffset(sign: 1 | -1, extra = 0): Expression {
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    15,
    sign * (6 + extra),
    17,
    sign * (9 + extra),
    18,
    sign * (13 + extra),
    22,
    sign * (208 + extra * 16),
  ]
}

/** The offset of a feature: none on the centre line, else by its side and prefix */
function offsetOf(side: 'self' | 'left' | 'right', prefix: 'cycleway' | 'sidewalk') {
  if (side === 'self') return 0
  return sideOffset(side === 'right' ? 1 : -1, prefix === 'sidewalk' ? 5 : 0)
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
    return [
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
      {
        id: `bike-${partId(part)}`,
        type: 'line',
        source: BIKE_SOURCE,
        minzoom: BIKE_MIN_ZOOM,
        filter: [...filter, notDashed],
        layout,
        paint: {
          'line-color': ['get', 'colour'],
          'line-width': LINE_WIDTH,
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
          'line-width': LINE_WIDTH,
          'line-offset': offset,
          'line-opacity': OPACITY,
          'line-dasharray': [2, 1.5],
        },
      },
    ]
  }),
]

/** The traffic signs: one image per sign value (the main sign above its additional signs), upright */
export const SIGN_LAYER: BikeLayer = {
  id: 'bike-signs',
  type: 'symbol',
  source: BIKE_SIGN_SOURCE,
  minzoom: SIGN_MIN_ZOOM,
  filter: ['has', 'image'],
  layout: {
    'icon-image': ['get', 'image'],
    // the image's own size at every zoom: a scaled raster image gets blurred
    'icon-allow-overlap': false,
    'icon-padding': 1,
  },
}
