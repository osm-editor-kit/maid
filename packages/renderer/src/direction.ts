/**
 * Which lines carry a direction glyph and which carry side markers. The riding direction follows iD's one-way tags
 * (modules/osm/way.ts `isOneWay`, modules/osm/tags.ts), drawn with Maid's own glyphs (glyph.ts, ADR 0017); side
 * markers are iD's (`isSided`, modules/svg/lines.js). Pure: the builder calls these, the layers name the images that
 * `direction-images.ts` draws.
 */
import type { Tags } from '@osm-editor-kit/maid-style'
import {
  GLYPH_HEIGHT,
  GLYPH_KINDS,
  glyphWidth,
  type GlyphKind,
  type GlyphShape,
  type GlyphState,
  type GlyphTone,
} from './glyph'

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

/** Whether a tag other than `oneway` makes the way one-way by default (a roundabout, a motorway, a river) */
function onewayByDefault(tags: Tags) {
  for (const [key, values] of FORWARD) {
    if (key === 'oneway') continue
    const value = tags[key]
    if (value !== undefined && values.has(value)) return true
  }
  return false
}

/** The riding direction of all traffic, from `oneway` and the tags that imply it */
function mainDirection(tags: Tags): GlyphKind | undefined {
  // `oneway=no` wins, as in iD; on a way that is one-way by default it says two-way out loud (Tobias, 2026-11-27)
  if (tags.oneway === 'no') return onewayByDefault(tags) ? 'both' : undefined
  if (
    tags.oneway === 'alternating' ||
    tags.oneway === 'reversible' ||
    tags.conveying === 'reversible'
  )
    return 'reversible'
  if (tags.oneway === '-1' || tags.conveying === 'backward') return 'against'
  if (tags.oneway === 'yes' || onewayByDefault(tags)) return 'with'
  return undefined
}

/**
 * The glyph a line always shows (at rest too), or undefined for a line that is two-way by default and shows its
 * riding direction only on hover and selection (or at rest in a line-focused style, layers.ts `line-two-way`).
 * `oneway:bicycle=no` counts off `highway=cycleway` only, where `oneway` is the cyclists' own (Tobias, 2026-11-27): on
 * a one-way road it adds the bicycles' way back. `oneway:bicycle=yes|-1` on a two-way path or cycleway makes it one way
 * for bicycles; on a cycleway without `oneway` too, as TILDA reads it (`oneway:bicycle` before `oneway`, `-1` against
 * the line), else Maid Bicycle would draw it two-way where TILDA draws one way.
 */
export function ridingOf(tags: Tags): GlyphKind | undefined {
  const main = mainDirection(tags)
  // a highway's tag only: on a river or a piste it says nothing
  const bicycle = tags.highway === undefined ? undefined : tags['oneway:bicycle']
  if (tags.highway !== 'cycleway' && bicycle === 'no' && main === 'with') return 'contraflow'
  if (tags.highway !== 'cycleway' && bicycle === 'no' && main === 'against')
    return 'contraflow-against'
  if (main === undefined || main === 'both') {
    if (bicycle === 'yes') return 'bike-with'
    if (bicycle === '-1') return 'bike-against'
  }
  return main
}

/**
 * Lines that traffic uses, so a two-way one has a riding direction worth showing (`both` on hover and selection, and
 * at rest in a line-focused style). Any other open line (a fence, a power line) shows only its drawing direction.
 */
export function isTravelled(tags: Tags) {
  return (
    (tags.highway !== undefined && !NOT_IN_USE.has(tags.highway) && tags.highway !== 'platform') ||
    (tags.railway !== undefined && !NOT_IN_USE.has(tags.railway) && tags.railway !== 'platform') ||
    tags.route === 'ferry' ||
    tags.aerialway !== undefined
  )
}

/** Lines no one travels yet or any more: no riding direction to show */
const NOT_IN_USE = new Set([
  'construction',
  'proposed',
  'planned',
  'disused',
  'abandoned',
  'razed',
  'dismantled',
])

/** Crossings: on the carriageway, two-way unless tagged */
const CROSSING = new Set(['crossing', 'traffic_island'])

/**
 * A way of its own that bicycles ride and that should say how (a cycleway, a path or footway open to bicycles) but
 * has no oneway tag. A line-focused editor marks it "not tagged" (amber) instead of two-way (ADR 0017); a crossing is
 * two-way unless tagged.
 */
export function needsRidingTag(tags: Tags) {
  if (tags.oneway !== undefined || tags['oneway:bicycle'] !== undefined) return false
  if (
    CROSSING.has(tags.footway ?? '') ||
    CROSSING.has(tags.cycleway ?? '') ||
    CROSSING.has(tags.path ?? '')
  )
    return false
  if (tags.highway === 'cycleway') return true
  const open =
    tags.bicycle === 'designated' || tags.bicycle === 'yes' || tags.bicycle === 'permissive'
  return (
    open && (tags.highway === 'path' || tags.highway === 'footway' || tags.highway === 'bridleway')
  )
}

/**
 * Lines whose glyph is light (white parts, dark edge), where iD draws its arrows white or grey: dark lines (a bridge
 * under construction, a runway), pedestrian streets and rail (iD's onewayArrowColour).
 */
export function isLightGlyph(tags: Tags) {
  if (tags.highway === 'construction' && tags.bridge) return true
  if (tags.highway === 'pedestrian') return true
  if (tags.railway && !tags.highway) return true
  return tags.aeroway === 'runway'
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
 * The glyphs and side markers are symbols along the line (`symbol-placement: line`), so that MapLibre can drop the one
 * that would cover a vertex: the nodes win, a marker may go (Tobias, 2026-10-28). They do not block each other or the
 * labels (`icon-ignore-placement`). An image is one marker.
 */
/** A glyph every 48 px: they are wider than iD's arrows (iD: 36) and need the room (Tobias, 2026-11-27) */
export const GLYPH_SPACING = 48
/** The two-way glyph at rest in a line-focused style: a reminder, not a pattern, so twice as far apart */
export const GLYPH_REST_SPACING = 96
/** iD's side markers, every 30 px (svg/lines.js) */
export const SIDE_SPACING = 30

/** Image ids (direction-images.ts draws them): `maid-glyph-<kind>-<state>-<tone>`, `maid-side-<kind>` */
export const GLYPH_IMAGE_PREFIX = 'maid-glyph-'
export const SIDE_IMAGE_PREFIX = 'maid-side-'
/** Every glyph the map draws: the kinds, and `drawn` for an open line that no one travels (a fence) */
const MAP_GLYPHS: readonly GlyphShape[] = [...GLYPH_KINDS, 'drawn']
const TONES: readonly GlyphTone[] = ['ink', 'light']

export function glyphImageId(kind: GlyphShape, state: GlyphState, tone: GlyphTone = 'ink') {
  return `${GLYPH_IMAGE_PREFIX}${kind}-${state}-${tone}`
}

/** Every glyph image the map may ask for (direction-images.ts builds them ahead) */
export function glyphImageIds() {
  const ids: string[] = []
  for (const kind of MAP_GLYPHS)
    for (const state of ['rest', 'active'] as const)
      for (const tone of TONES)
        if (!(kind === 'drawn' && state === 'rest')) ids.push(glyphImageId(kind, state, tone))
  return ids
}

/** The kind, state and tone that a glyph image id names, or undefined for another id */
export function parseGlyphImageId(
  id: string,
): { kind: GlyphShape; state: GlyphState; tone: GlyphTone } | undefined {
  if (!id.startsWith(GLYPH_IMAGE_PREFIX)) return undefined
  const parts = id.slice(GLYPH_IMAGE_PREFIX.length).split('-')
  const tone = parts.pop() as GlyphTone
  const state = parts.pop() as GlyphState
  const kind = parts.join('-') as GlyphShape
  if (!MAP_GLYPHS.includes(kind) || !TONES.includes(tone)) return undefined
  if (state !== 'rest' && state !== 'active') return undefined
  return { kind, state, tone }
}

/** The widest glyph (px, large size): every glyph image is this wide, so all collide alike near a vertex */
export const GLYPH_BOX_WIDTH = Math.ceil(
  Math.max(...GLYPH_KINDS.map((kind) => glyphWidth(kind, 'active'))) + 2,
)
/** Image height: the glyph and its edge */
export const GLYPH_BOX_HEIGHT = GLYPH_HEIGHT + 2

/**
 * The glyph's size against the line (layers.ts): on a road it stays inside the fill, 1 px clear of each casing (the
 * fill width minus 2 px, at most the full 8 px); a line thinner than a readable glyph (paths, cycleways) gets the
 * smallest size, 5.2 px, and the glyph lies over the line on its edge.
 */
export const GLYPH_MIN_SCALE = 0.65

/** The selected way's direction as a line pattern, for maps without vertices (the relations map): white, dark edge */
export const SELECTED_ARROW_PATTERN = 'maid-selected-arrow-pattern'
export const SELECTED_ARROW_HEIGHT = 8
/** The pattern repeats every this many px */
export const SELECTED_ARROW_SPACING = 36

/**
 * A transparent square on every drawn vertex (layers.ts `arrow-keepout-*`): it is never seen, but takes
 * its place in MapLibre's collision index, so no glyph or side marker is placed on a vertex.
 */
export const KEEPOUT_IMAGE = 'maid-keepout'
export const KEEPOUT_SIZE = 8

/**
 * MapLibre does not turn a line icon's collision box with the line. This padding makes a box `width` by `height` a
 * square of `width` + 2 px, which holds the icon at every angle.
 */
export function squarePadding(width: number, height: number): [number, number, number, number] {
  const vertical = (width + 2 - height) / 2
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
 * (squarePadding): on a line across the screen it is the marker's, on one up the screen it is longer along the line
 * than the marker. Either way it holds the marker where it meets a vertex on the line.
 */
export function sideIconSize(kind: SideKind) {
  return { width: 2 * SIDE_UNIT + 1, height: Math.ceil(2 * sideReach(kind) * SIDE_UNIT + 1) }
}

/**
 * The riding direction of a module's own lines (the bicycle lens) as a line pattern (`line-pattern`, one glyph every
 * LINE_GLYPH_SPACING px), which follows the layer's `line-offset`; a symbol does not. The rest glyph at the small size,
 * ink with its white edge. The layer's `line-width` is LINE_GLYPH_HEIGHT. Ids: `maid-line-glyph-<kind>`.
 */
export const LINE_GLYPH_PREFIX = 'maid-line-glyph-'
export const LINE_GLYPH_SPACING = 56
export const LINE_GLYPH_HEIGHT = 8
export type LineGlyphKind = 'with' | 'against' | 'both' | 'missing'
export const LINE_GLYPH_KINDS: readonly LineGlyphKind[] = ['with', 'against', 'both', 'missing']
export function lineGlyphImageId(kind: LineGlyphKind) {
  return `${LINE_GLYPH_PREFIX}${kind}`
}
