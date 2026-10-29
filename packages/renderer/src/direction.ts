/**
 * Which lines carry direction arrows and which carry side markers, decided as iD does
 * (modules/osm/way.ts `isOneWay`, `isSided`; modules/osm/tags.ts; modules/svg/lines.js).
 * Pure: the builder calls these, the layers name the images that `direction-images.ts` draws.
 */
import type { Tags } from '@osm-editor-kit/maid-style'

/** 1: arrow along the way, -1: against it, 2: both ways (alternating, reversible) */
export type OneWay = 1 | -1 | 2

/** iD's osmOneWayForwardTags: tags that make a way one-way in its drawing direction, by key */
const FORWARD = new Map<string, Set<string>>([
  ['aerialway', new Set(['chair_lift', 'drag_lift', 'j-bar', 'magic_carpet', 'mixed_lift', 'platter', 'rope_tow', 't-bar', 'zip_line'])],
  ['conveying', new Set(['forward'])],
  ['highway', new Set(['motorway'])],
  ['junction', new Set(['circular', 'roundabout'])],
  ['man_made', new Set(['goods_conveyor', 'piste:halfpipe'])],
  ['oneway', new Set(['yes'])],
  ['piste:type', new Set(['downhill', 'sled', 'yes'])],
  ['seamark:type', new Set(['two-way_route', 'recommended_traffic_lane', 'separation_lane', 'separation_roundabout'])],
  ['waterway', new Set(['canal', 'ditch', 'drain', 'fish_pass', 'flowline', 'pressurised', 'river', 'spillway', 'stream', 'tidal_channel'])],
]) // prettier-ignore

/**
 * The direction of a one-way line, or undefined. `oneway=no` wins over everything. Both-ways
 * wins over backwards, as iD draws a both-ways line with its arrows in both directions.
 */
export function onewayOf(tags: Tags) {
  if (tags.oneway === 'no') return undefined
  if (
    tags.oneway === 'alternating' ||
    tags.oneway === 'reversible' ||
    tags.conveying === 'reversible'
  )
    return 2
  if (tags.oneway === '-1' || tags.conveying === 'backward') return -1
  for (const [key, values] of FORWARD) {
    const value = tags[key]
    if (value !== undefined && values.has(value)) return 1
  }
  return undefined
}

/**
 * Arrow colour for a one-way line, as iD's onewayArrowColour: white on dark lines, grey on
 * pedestrian and rail lines, else the default dark grey (undefined here: the layer's default).
 */
export function arrowColour(tags: Tags) {
  if (tags.highway === 'construction' && tags.bridge) return '#fff'
  if (tags.highway === 'pedestrian') return '#eee'
  if (tags.railway && !tags.highway) return '#eee'
  if (tags.aeroway === 'runway') return '#fff'
  return undefined
}

/**
 * iD's osmSidednessTags: the side of a line that is the 'inside' (the right side, unless the
 * value is a string, which names another marker kind).
 */
const SIDEDNESS: Record<string, Record<string, true | string>> = {
  natural: { cliff: true, coastline: 'coastline' },
  barrier: { retaining_wall: true, kerb: true, guard_rail: 'guard_rail', city_wall: true },
  man_made: { embankment: 'embankment-man_made', quay: true },
  waterway: { weir: true },
  cutting: { yes: 'cutting', both: 'cutting', left: 'cutting-left', right: 'cutting-right' },
  embankment: {
    yes: 'embankment', dyke: 'embankment', both: 'embankment',
    left: 'embankment-left', right: 'embankment-right',
  },
} // prettier-ignore

/**
 * iD's osmLifecyclePrefixes: `disused:barrier=kerb` is read as `barrier=kerb` (osmRemoveLifecyclePrefix).
 * Only the sidedness rules use it; iD's one-way tags are read as written.
 */
const LIFECYCLE = new Set([
  'proposed',
  'planned',
  'construction',
  'disused',
  'abandoned',
  'was',
  'dismantled',
  'razed',
  'demolished',
  'destroyed',
  'removed',
  'intermittent',
])
function withoutLifecycle(key: string) {
  const colon = key.indexOf(':')
  if (colon < 0) return key
  return LIFECYCLE.has(key.slice(0, colon)) ? key.slice(colon + 1) : key
}

/** The marker kind of a sided line (a key of SIDE_KINDS), or undefined. `two_sided=yes` wins. */
export function sidedOf(tags: Tags) {
  if (tags.two_sided === 'yes') return undefined
  for (const realKey in tags) {
    const key = withoutLifecycle(realKey)
    const values = SIDEDNESS[key]
    const value = tags[realKey]!
    if (!values || !Object.hasOwn(values, value)) continue
    const kind = values[value]!
    return kind === true ? key : kind
  }
  return undefined
}

/**
 * Side marker shapes in iD's marker units (one unit is 4.5 px). Distances are from the line,
 * positive on the right-hand side of the way. A triangle sits on [-1, 1] along the way with its
 * base at `base` and its apex at `apex`. A circle has its centre at `at`, radius 0.5.
 */
export type SideShape = { base: number; apex: number } | { at: number }
export type SideKind = { color: string; stroke?: string; shapes: SideShape[] }

const EMBANKMENT = { stroke: '#444', color: 'rgba(200, 200, 200, 0.75)' }

/** iD's sided markers (modules/svg/defs.ts), one entry per kind */
export const SIDE_KINDS: Record<string, SideKind> = {
  natural: { color: 'rgb(170, 170, 170)', shapes: [{ base: 0, apex: 1 }] },
  coastline: { color: '#77dede', shapes: [{ base: 1, apex: 2 }] },
  waterway: { color: '#77dede', shapes: [{ base: 1, apex: 2 }] },
  barrier: { color: '#ddd', shapes: [{ base: 1, apex: 2 }] },
  guard_rail: { color: '#ddd', shapes: [{ at: -1 }] },
  man_made: { color: '#fff', shapes: [{ base: 0, apex: 1 }] },
  'embankment-man_made': { ...EMBANKMENT, shapes: [{ base: 1, apex: 2 }] },
  embankment: {
    ...EMBANKMENT,
    shapes: [
      { base: 1.5, apex: 2.5 },
      { base: -1.5, apex: -2.5 },
    ],
  },
  'embankment-right': { ...EMBANKMENT, shapes: [{ base: 1.5, apex: 2.5 }] },
  'embankment-left': { ...EMBANKMENT, shapes: [{ base: -1.5, apex: -2.5 }] },
  cutting: {
    ...EMBANKMENT,
    shapes: [
      { base: 2.5, apex: 1.5 },
      { base: -2.5, apex: -1.5 },
    ],
  },
  'cutting-right': { ...EMBANKMENT, shapes: [{ base: 2.5, apex: 1.5 }] },
  'cutting-left': { ...EMBANKMENT, shapes: [{ base: -2.5, apex: -1.5 }] },
}

/**
 * The arrows and side markers are symbols along the line (`symbol-placement: line`), one every ARROW_SPACING or
 * SIDE_SPACING px, so that MapLibre can drop the one that would cover a vertex: the nodes win, a marker may go
 * (Tobias, 2026-10-28). They do not block each other or the labels (`icon-ignore-placement`). An image is one
 * marker. The spacings are iD's (svg/lines.js).
 */
export const ARROW_SPACING = 36
export const ARROW_HEIGHT = 6
/** iD's arrow is 10 x 5 units of 1.2 px; half a px more on each side for its outline */
export const ARROW_WIDTH = 13
export const SIDE_SPACING = 30

/** The arrow's shape, from `oneway`: forward, against the way (mirrored), both ways */
export type ArrowShape = 'forward' | 'backward' | 'both'
const SHAPE_OF: Record<OneWay, ArrowShape> = { 1: 'forward', [-1]: 'backward', 2: 'both' }
/** The arrow's colour when the feature has no `ac` */
export const ARROW_DEFAULT_COLOUR = '#333'
/** Colours of the arrows that are built ahead; other colours (the lens dims them) are built on demand */
export const ARROW_COLOURS = [ARROW_DEFAULT_COLOUR, '#fff', '#eee']

/** Image ids (direction-images.ts draws them): `maid-arrow-<shape>-<colour>`, `maid-side-<kind>` */
export const ARROW_IMAGE_PREFIX = 'maid-arrow-'
export const SIDE_IMAGE_PREFIX = 'maid-side-'
/** The selected way's direction (engine.ts, the highlight source): white with a dark outline, a symbol icon */
export const SELECTED_ARROW_IMAGE = 'maid-selected-arrow'
export const SELECTED_ARROW_HEIGHT = 8
/** The same arrow as a line pattern, as wide as ARROW_SPACING, for maps without vertices (the relations map) */
export const SELECTED_ARROW_PATTERN = 'maid-selected-arrow-pattern'
/**
 * A transparent square on every drawn vertex (layers.ts `arrow-keepout-*`): it is never seen, but takes
 * its place in MapLibre's collision index, so no arrow or side marker is placed on a vertex.
 */
export const KEEPOUT_IMAGE = 'maid-keepout'
export const KEEPOUT_SIZE = 8

/**
 * MapLibre does not turn a line icon's collision box with the line. This padding makes an arrow's box (ARROW_WIDTH
 * by `height`) a square of ARROW_WIDTH + 2 px, which holds the arrow at every angle.
 */
export function arrowPadding(height: number): [number, number, number, number] {
  const vertical = (ARROW_WIDTH + 2 - height) / 2
  return [vertical, 1, vertical, 1]
}

/** One side-marker unit in px (iD: markerWidth 1.5 of a 6 px stroke, 2 units wide) */
export const SIDE_UNIT = 4.5

/** How far a kind's markers reach from the line, in units */
function sideReach(kind: SideKind) {
  let reach = 0
  for (const shape of kind.shapes) {
    const edges = 'at' in shape ? [shape.at - 0.5, shape.at + 0.5] : [shape.base, shape.apex]
    for (const edge of edges) reach = Math.max(reach, Math.abs(edge))
  }
  return reach
}

/**
 * A side marker's icon (direction-images.ts) in px: one marker, 2 units along the line, and as high as the marker's
 * farthest edge on both sides, so the line runs through its middle. Its collision box is not turned with the line
 * (arrowPadding): on a line across the screen it is the marker's, on one up the screen it is longer along the line
 * than the marker. Either way it holds the marker where it meets a vertex on the line.
 */
export function sideIconSize(kind: SideKind) {
  return { width: 2 * SIDE_UNIT + 1, height: Math.ceil(2 * sideReach(kind) * SIDE_UNIT + 1) }
}

/** The arrow image for a line's direction and colour. layers.ts builds the same id in an expression. */
export function arrowImageId(oneway: OneWay, colour = ARROW_DEFAULT_COLOUR) {
  return `${ARROW_IMAGE_PREFIX}${SHAPE_OF[oneway]}-${colour}`
}

/** The shape and colour that an arrow image id names, or undefined for another id */
export function parseArrowImageId(id: string): { shape: ArrowShape; colour: string } | undefined {
  if (!id.startsWith(ARROW_IMAGE_PREFIX)) return undefined
  const rest = id.slice(ARROW_IMAGE_PREFIX.length)
  const dash = rest.indexOf('-')
  const shape = rest.slice(0, dash)
  if (dash < 0 || (shape !== 'forward' && shape !== 'backward' && shape !== 'both'))
    return undefined
  return { shape, colour: rest.slice(dash + 1) }
}
