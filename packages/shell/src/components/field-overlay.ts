import type { FieldOverlay, SideChoice } from '@osm-editor-kit/maid-renderer'
import type { Tags } from '@osm-editor-kit/maid-style'
/**
 * What the map shows for the field that has the focus or the pointer on it: a side line for a
 * directional field's side (cycleway:left, sidewalk:right, parking:both:orientation, ...) and a width band for a width field
 * (width, est_width, cycleway:left:width, sidewalk:both:width, ...). This module is pure. The Inspector hands the
 * result to the engine. Rules from the iD fork (WORKDOC.md features 7 and 10; modules/width/
 * width_tags.ts and width_indicator.ts): the band of a side starts at the road's edge, half the
 * road width out, and the road width is the way's width tag or a default by highway type.
 */
import type { FieldFocus } from '@osm-editor-kit/maid-ui'

/** A parking key of a side: `parking:left`, `parking:right:orientation`, `parking:both:fee:conditional` */
const PARKING_SIDE_KEY = /^parking:(left|right|both)(?::|$)/
const SIDE_WIDTH_KEY = /^(cycleway|sidewalk):(left|right|both):width$/
const WAY_WIDTH_KEYS = new Set(['width', 'est_width'])

/** Default road width in metres by highway type, without oneway (the fork's HIGHWAY_WIDTH_NO_ONEWAY) */
const WIDTH_NO_ONEWAY: Record<string, number> = {
  motorway: 22, trunk: 20, primary: 18, secondary: 14, tertiary: 10,
  motorway_link: 9, trunk_link: 9, primary_link: 6, secondary_link: 6, tertiary_link: 6,
  residential: 8, unclassified: 8, living_street: 5, pedestrian: 8, road: 8, service: 4,
  bus_guideway: 3, track: 2.5, footway: 2.5, path: 2.5, bridleway: 2.5, cycleway: 2, steps: 2,
} // prettier-ignore

/** Default road width in metres for a road tagged oneway (the fork's HIGHWAY_WIDTH_ONEWAY) */
const WIDTH_ONEWAY: Record<string, number> = {
  ...WIDTH_NO_ONEWAY,
  motorway: 15, trunk: 15, primary: 12, secondary: 9, tertiary: 7,
} // prettier-ignore

const DEFAULT_ROAD_WIDTH = 10

/**
 * A width in metres from the field's text: `3.5`, `3,5`, `3.5 m`, `3.` while it is typed. Other
 * units (cm, ft, ...) and anything else give undefined: no band.
 */
export function parseWidthMetres(value: string | undefined) {
  const match = value?.trim().match(/^(\d+(?:[.,]\d*)?|[.,]\d+)\s*(m)?$/i)
  if (!match) return undefined
  const metres = Number.parseFloat(match[1]!.replace(',', '.'))
  return metres > 0 ? metres : undefined
}

/** An OSM width value: metres, or cm and km (the fork reads all three for the road's width) */
function parseOsmWidth(value: string | undefined) {
  const match = value?.trim().match(/^(\d+\.?\d*|\.\d+)\s*([a-zA-Z]*)$/)
  if (!match) return undefined
  const number = Number.parseFloat(match[1]!)
  const unit = (match[2] || 'm').toLowerCase()
  if (unit === 'm') return number
  if (unit === 'cm') return number / 100
  if (unit === 'km') return number * 1000
  return undefined
}

function isOneway(tags: Tags) {
  if (tags.oneway === 'yes' || tags.oneway === '-1') return true
  if (tags.oneway === 'no') return false
  return (
    tags.junction === 'roundabout' ||
    tags.highway === 'motorway' ||
    tags.highway === 'motorway_link'
  )
}

/** The road's width in metres: its width or est_width tag, else the default for its highway type */
export function roadWidthMetres(tags: Tags) {
  const explicit = parseOsmWidth(tags.width) ?? parseOsmWidth(tags.est_width)
  if (explicit !== undefined) return explicit
  const table = isOneway(tags) ? WIDTH_ONEWAY : WIDTH_NO_ONEWAY
  return table[tags.highway ?? ''] ?? DEFAULT_ROAD_WIDTH
}

/** The part of the street a width key describes: the whole way, or a lane or sidewalk on a side */
export function widthKeyTarget(
  key: string,
): { kind: 'way' } | { kind: 'side'; side: SideChoice } | undefined {
  if (WAY_WIDTH_KEYS.has(key)) return { kind: 'way' }
  const match = SIDE_WIDTH_KEY.exec(key)
  if (!match) return undefined
  const side = sideChoiceOf(match[2])
  return side ? { kind: 'side', side } : undefined
}

/** The side a width key names; the regex above only lets these three through */
function sideChoiceOf(text: string | undefined) {
  if (text === 'left' || text === 'right' || text === 'both') return text
  return undefined
}

/**
 * The overlay for a focused field: `side` for a directional side, `width` for a width key with a
 * width in metres, else nothing. A side band starts at the road's edge. `tags` are the selected
 * way's; without them the default width is used.
 */
export function fieldOverlayFor(
  focus: FieldFocus | null,
  tags: Tags | undefined,
): FieldOverlay | null {
  if (!focus) return null
  if (focus.side) return { kind: 'side', side: focus.side }
  const parkingSide = PARKING_SIDE_KEY.exec(focus.key)?.[1]
  if (parkingSide === 'left' || parkingSide === 'right' || parkingSide === 'both') {
    return { kind: 'side', side: parkingSide }
  }
  const target = widthKeyTarget(focus.key)
  if (!target) return null
  const metres = parseWidthMetres(focus.value)
  if (metres === undefined) return null
  if (target.kind === 'way') return { kind: 'width', metres }
  return {
    kind: 'width',
    metres,
    side: target.side,
    offsetMetres: roadWidthMetres(tags ?? {}) / 2,
  }
}
