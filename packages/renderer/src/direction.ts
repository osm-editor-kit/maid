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
export function onewayOf(tags: Tags): OneWay | undefined {
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
export function arrowColour(tags: Tags): string | undefined {
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

/** The marker kind of a sided line (a key of SIDE_KINDS), or undefined. `two_sided=yes` wins. */
export function sidedOf(tags: Tags): string | undefined {
  if (tags.two_sided === 'yes') return undefined
  for (const key in tags) {
    const values = SIDEDNESS[key]
    const value = tags[key]!
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

/** Image ids (direction-images.ts draws them): the arrow, the arrow both ways, `maid-side-<kind>` */
export const ARROW_IMAGE = 'maid-arrow'
export const ARROW_BOTH_IMAGE = 'maid-arrow-both'
export const SIDE_IMAGE_PREFIX = 'maid-side-'
